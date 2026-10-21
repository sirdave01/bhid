import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { decryptTotpSecret, matchTotpCounter } from "@/lib/totp";

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("TOTP confirmation session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to confirm MFA right now" },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

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
    !("code" in body) ||
    typeof body.code !== "string" ||
    !/^\d{6}$/.test(body.code)
  ) {
    return NextResponse.json(
      { success: false, message: "Enter a valid authenticator code" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const setupResult = await client.query<{
      secret_encrypted: string;
      attempts: number;
    }>(
      `SELECT secret_encrypted, attempts
       FROM totp_setup_challenges
       WHERE user_id = $1
         AND expires_at > NOW()
       FOR UPDATE`,
      [session.userId]
    );
    const setup = setupResult.rows[0];

    if (!setup || setup.attempts >= 5) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "The authenticator setup expired. Start again.",
        },
        { status: 410 }
      );
    }

    const secret = decryptTotpSecret(setup.secret_encrypted);

    const matchedStep = matchTotpCounter(secret, body.code);

    if (matchedStep === null) {
      await client.query(
        `UPDATE totp_setup_challenges
         SET attempts = attempts + 1
         WHERE user_id = $1`,
        [session.userId]
      );
      await client.query("COMMIT");
      return NextResponse.json(
        { success: false, message: "The authenticator code is invalid" },
        { status: 401 }
      );
    }

    await client.query(
      `INSERT INTO totp_methods (
         user_id,
         secret_encrypted,
         last_used_step
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET secret_encrypted = EXCLUDED.secret_encrypted,
           last_used_step = EXCLUDED.last_used_step,
           enabled_at = NOW()`,
      [session.userId, setup.secret_encrypted, matchedStep.toString()]
    );
    await client.query(
      "DELETE FROM totp_setup_challenges WHERE user_id = $1",
      [session.userId]
    );
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Authenticator MFA is enabled for password sign-ins",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("TOTP confirmation failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to confirm MFA right now" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
