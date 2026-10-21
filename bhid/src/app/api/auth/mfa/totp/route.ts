import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { decryptTotpSecret, matchTotpCounter } from "@/lib/totp";

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
    await client.query(
      `UPDATE totp_methods
       SET failed_management_attempts = 0,
           management_locked_until = NULL
       WHERE user_id = $1
         AND management_locked_until <= NOW()`,
      [session.userId]
    );
    const methodResult = await client.query<{
      secret_encrypted: string;
      last_used_step: string | null;
      failed_management_attempts: number;
      management_locked_until: Date | null;
    }>(
      `SELECT
         secret_encrypted,
         last_used_step,
         failed_management_attempts,
         management_locked_until
       FROM totp_methods
       WHERE user_id = $1
       FOR UPDATE`,
      [session.userId]
    );

    const method = methodResult.rows[0];

    if (!method) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Authenticator MFA is not enabled" },
        { status: 409 }
      );
    }

    if (
      method.management_locked_until &&
      method.management_locked_until.getTime() > Date.now()
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Too many incorrect codes. Try again in 15 minutes.",
        },
        { status: 429 }
      );
    }

    const matchedStep = matchTotpCounter(
      decryptTotpSecret(method.secret_encrypted),
      body.code
    );

    if (
      matchedStep === null ||
      (method.last_used_step !== null &&
        matchedStep <= BigInt(method.last_used_step))
    ) {
      await client.query(
        `UPDATE totp_methods
         SET failed_management_attempts = failed_management_attempts + 1,
             management_locked_until = CASE
               WHEN failed_management_attempts + 1 >= 5
                 THEN NOW() + INTERVAL '15 minutes'
               ELSE management_locked_until
             END
         WHERE user_id = $1`,
        [session.userId]
      );
      await client.query("COMMIT");
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
