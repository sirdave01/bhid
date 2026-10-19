import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid passkey ID" },
      { status: 400 }
    );
  }

  const accessToken = request.cookies.get("bhid_access")?.value;

  try {
    const session = await getAuthenticatedSession(accessToken);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const result = await pool.query(
      `DELETE FROM webauthn_credentials
       WHERE id = $1
         AND user_id = $2`,
      [id, session.userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Passkey not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { passkeyId: id },
    });
  } catch (error) {
    console.error("Passkey removal failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to remove this passkey right now" },
      { status: 500 }
    );
  }
}
