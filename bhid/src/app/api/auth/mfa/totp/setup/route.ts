import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import {
  createTotpSecret,
  createTotpUri,
  encryptTotpSecret,
} from "@/lib/totp";

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("TOTP setup session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to set up MFA right now" },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  const secret = createTotpSecret();
  let encryptedSecret: string;

  try {
    encryptedSecret = encryptTotpSecret(secret);
  } catch (error) {
    console.error("TOTP encryption configuration failed:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to set up MFA. Check the TOTP encryption key configuration.",
      },
      { status: 503 }
    );
  }

  try {
    const enabled = await pool.query(
      "SELECT 1 FROM totp_methods WHERE user_id = $1 LIMIT 1",
      [session.userId]
    );

    if (enabled.rowCount) {
      return NextResponse.json(
        { success: false, message: "Authenticator MFA is already enabled" },
        { status: 409 }
      );
    }

    await pool.query(
      `INSERT INTO totp_setup_challenges (
         user_id,
         secret_encrypted,
         expires_at,
         attempts
       )
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0)
       ON CONFLICT (user_id) DO UPDATE
       SET secret_encrypted = EXCLUDED.secret_encrypted,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           created_at = NOW()`,
      [session.userId, encryptedSecret]
    );

    return NextResponse.json({
      success: true,
      data: {
        secret,
        otpauthUri: createTotpUri(secret, session.email),
        expiresInSeconds: 600,
      },
    });
  } catch (error) {
    console.error("TOTP setup failed:", error);
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;

    if (errorCode === "42P01") {
      return NextResponse.json(
        {
          success: false,
          message:
            "MFA setup is not initialized. Apply database migration 003_account_security.sql.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Unable to set up MFA right now" },
      { status: 500 }
    );
  }
}
