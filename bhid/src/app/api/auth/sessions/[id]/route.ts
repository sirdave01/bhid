import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required" },
    { status: 401 }
  );
}

function clearAuthCookies(response: NextResponse) {
  const secureCookies = process.env.NODE_ENV === "production";

  response.cookies.set("bhid_access", "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  response.cookies.set("bhid_refresh", "", {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/auth/sessions/[id]">
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid session ID" },
      { status: 400 }
    );
  }

  try {
    const currentSession = await getAuthenticatedSession(
      request.cookies.get("bhid_access")?.value
    );

    if (!currentSession) {
      return unauthorized();
    }

    const result = await pool.query<{ id: string }>(
      `UPDATE sessions
       SET revoked_at = NOW(),
           revoked_reason = 'user_revoked_session',
           last_used_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND revoked_at IS NULL
       RETURNING id`,
      [id, currentSession.userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Session not found" },
        { status: 404 }
      );
    }

    const isCurrent = id === currentSession.sessionId;
    const response = NextResponse.json({
      success: true,
      data: { sessionId: id, currentSession: isCurrent },
    });

    return isCurrent ? clearAuthCookies(response) : response;
  } catch (error) {
    console.error("Session revocation failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to revoke this session right now" },
      { status: 500 }
    );
  }
}
