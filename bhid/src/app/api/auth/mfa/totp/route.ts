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

  return NextResponse.json(
    {
      success: false,
      message:
        "Authenticator MFA is required for password recovery and cannot be disabled",
    },
    { status: 409 }
  );
}
