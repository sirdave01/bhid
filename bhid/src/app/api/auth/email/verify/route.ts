import { NextRequest, NextResponse } from "next/server";

import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body is not valid JSON" },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("token" in body) ||
    typeof body.token !== "string" ||
    body.token.length < 32 ||
    body.token.length > 128
  ) {
    return NextResponse.json(
      { success: false, message: "This verification link is invalid or expired" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id
       FROM email_verification_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [hashToken(body.token)]
    );
    const verification = tokenResult.rows[0];

    if (!verification) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "This verification link is invalid or expired" },
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [verification.user_id]
    );
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [verification.id]
    );
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Your email address has been verified",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Email verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify your email right now" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
