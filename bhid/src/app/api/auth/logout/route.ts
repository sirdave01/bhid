// this is the logout route, which is responsible for logging out the user by revoking 
// their refresh token and clearing the relevant cookies. It supports logging out from all devices 
// or just the current device based on the query parameter.

import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import { hashToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("bhid_refresh")?.value;
  const logoutAll = request.nextUrl.searchParams.get("all") === "true";

  const clearCookies = (response: NextResponse) => {
    const secureCookies = process.env.NODE_ENV === "production";

    response.cookies.set("bhid_access", "", {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    response.cookies.set("bhid_refresh", "", {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });

    return response;
  };

  // Always clear cookies on the client side
  if (!refreshToken) {
    return clearCookies(
      NextResponse.json(
        { success: true, message: "Logged out successfully" },
        { status: 200 }
      )
    );
  }

  const refreshTokenHash = hashToken(refreshToken);
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();

    const sessionResult = await client.query(
      `SELECT id, user_id, revoked_at
       FROM sessions
       WHERE token_hash = $1
       LIMIT 1`,
      [refreshTokenHash]
    );

    const session = sessionResult.rows[0];

    if (session && !session.revoked_at) {
      if (logoutAll) {
        // Logout from ALL devices of this user
        await client.query(
          `UPDATE sessions
           SET revoked_at = NOW(),
               revoked_reason = 'user_logout_all',
               last_used_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL`,
          [session.user_id]
        );
      } else {
        // Logout from THIS device only
        await client.query(
          `UPDATE sessions
           SET revoked_at = NOW(),
               revoked_reason = 'user_logout',
               last_used_at = NOW()
           WHERE id = $1`,
          [session.id]
        );
      }
    }

    return clearCookies(
      NextResponse.json(
        {
          success: true,
          message: logoutAll
            ? "Logged out from all devices"
            : "Logged out successfully",
        },
        { status: 200 }
      )
    );
  } catch (error) {
    console.error("Logout error:", error);

    return clearCookies(
      NextResponse.json(
        {
          success: false,
          message: "Unable to sign out right now",
        },
        { status: 500 }
      )
    );
  } finally {
    client?.release();
  }
}