import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const result = await pool.query(
      `SELECT enabled_at
       FROM totp_methods
       WHERE user_id = $1
       LIMIT 1`,
      [session.userId]
    );

    return NextResponse.json({
      success: true,
      data: { enabled: result.rows.length > 0 },
    });
  } catch (error) {
    console.error("TOTP status lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to check MFA status right now" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("TOTP session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update MFA right now" },
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
    const result = await client.query<{ secret_encrypted: string }>(
      `SELECT secret_encrypted
       FROM totp_methods
       WHERE user_id = $1
       FOR UPDATE`,
      [session.userId]
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Authenticator MFA is not enabled" },
        { status: 409 }
      );
    }

    const { decryptTotpSecret, verifyTotpCode } = await import("@/lib/totp");

    if (
      !verifyTotpCode(
        decryptTotpSecret(result.rows[0].secret_encrypted),
        body.code
      )
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "The authenticator code is invalid" },
        { status: 401 }
      );
    }

    await client.query("DELETE FROM totp_methods WHERE user_id = $1", [
      session.userId,
    ]);
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Authenticator MFA has been disabled",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("TOTP disable failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update MFA right now" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
