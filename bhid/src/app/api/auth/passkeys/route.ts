import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;

  try {
    const session = await getAuthenticatedSession(accessToken);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const result = await pool.query<{
      id: string;
      label: string;
      device_type: "singleDevice" | "multiDevice";
      backed_up: boolean;
      created_at: Date;
      last_used_at: Date | null;
    }>(
      `SELECT id, label, device_type, backed_up, created_at, last_used_at
       FROM webauthn_credentials
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [session.userId]
    );

    return NextResponse.json({
      success: true,
      data: {
        passkeys: result.rows.map((credential) => ({
          id: credential.id,
          label: credential.label,
          deviceType: credential.device_type,
          backedUp: credential.backed_up,
          createdAt: credential.created_at.toISOString(),
          lastUsedAt: credential.last_used_at?.toISOString() ?? null,
        })),
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Passkey list lookup failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to load your passkeys right now" },
      { status: 500 }
    );
  }
}
