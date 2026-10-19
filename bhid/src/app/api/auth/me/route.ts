// this route verifies access token, checks neon and checks account status.
// It also uses the getJwtConfig function to retrieve the JWT configuration for verifying access tokens.

import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { verifyAccessToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      message: "Authentication required",
    },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;

  if (!accessToken) {
    return unauthorized();
  }

  let claims;

  try {
    claims = verifyAccessToken(
      accessToken,
      getJwtConfig().audience
    );
  } catch {
    return unauthorized();
  }

  // JWT verification may return a string as well as a payload.
  // Validate the required claims before using them.
  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof claims.sub !== "string" ||
    !UUID_PATTERN.test(claims.sub) ||
    typeof claims.sid !== "string" ||
    !UUID_PATTERN.test(claims.sid) ||
    typeof claims.auth_version !== "number" ||
    !Number.isInteger(claims.auth_version)
  ) {
    return unauthorized();
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.bhid,
         u.email,
         u.email_verified_at,
         u.status,
         u.auth_version,
         s.id AS session_id
       FROM sessions AS s
       JOIN users AS u
         ON u.id = s.user_id
       WHERE s.id = $1
         AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         AND u.id = $2
         AND u.status = 'ACTIVE'
         AND u.auth_version = $3
       LIMIT 1`,
      [
        claims.sid,
        claims.sub,
        claims.auth_version,
      ]
    );

    const user = result.rows[0];

    if (!user) {
      return unauthorized();
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        bhid: user.bhid,
        email: user.email,
        emailVerified: user.email_verified_at !== null,
        status: user.status,
        sessionId: user.session_id,
      },
    });
  } catch (error) {
    console.error("Authenticated-user lookup failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to verify your session right now",
      },
      { status: 500 }
    );
  }
}