import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";

const ACCESS_TOKEN_SECONDS = 10 * 60;           // 10 minutes
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;  // 7 days

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("bhid_refresh")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { success: false, message: "No refresh token provided" },
      { status: 401 }
    );
  }

  const refreshTokenHash = hashToken(refreshToken);
  const now = new Date();

  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    // 1. Find the current session by the refresh token hash
    const sessionResult = await client.query(
      `SELECT
         s.id,
         s.user_id,
         s.token_hash,
         s.expires_at,
         s.absolute_expires_at,
         s.revoked_at,
         s.token_family_id,
         u.auth_version,
         u.status,
         u.bhid,
         u.email,
         u.email_verified_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
       LIMIT 1
       FOR UPDATE`,
      [refreshTokenHash]
    );

    const session = sessionResult.rows[0];

    // Generic failure responses (avoid leaking information)
    if (!session) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { success: false, message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // 2. Security checks
    if (session.revoked_at) {
      // Possible token reuse → revoke the whole family
      await client.query(
        `UPDATE sessions
         SET revoked_at = NOW(),
             revoked_reason = 'refresh_token_reuse'
         WHERE token_family_id = $1
           AND revoked_at IS NULL`,
        [session.token_family_id]
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        { success: false, message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    if (session.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { success: false, message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    if (new Date(session.expires_at) < now || new Date(session.absolute_expires_at) < now) {
      await client.query(
        `UPDATE sessions
         SET revoked_at = NOW(),
             revoked_reason = 'expired'
         WHERE id = $1`,
        [session.id]
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        { success: false, message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // 3. Rotate the refresh token
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);

    // Keep the original absolute expiry
    const absoluteExpiresAt = new Date(session.absolute_expires_at);
    const idleExpiresAt = new Date(Date.now() + REFRESH_IDLE_SECONDS * 1000);
    const newExpiresAt = new Date(
      Math.min(idleExpiresAt.getTime(), absoluteExpiresAt.getTime())
    );

    // Update the session with the new token
    await client.query(
      `UPDATE sessions
       SET token_hash = $1,
           expires_at = $2,
           last_used_at = NOW()
       WHERE id = $3`,
      [newRefreshTokenHash, newExpiresAt, session.id]
    );

    // Record the old token in history (for reuse detection)
    await client.query(
      `INSERT INTO session_refresh_token_history
         (session_id, token_hash, replaced_by_token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        session.id,
        refreshTokenHash,
        newRefreshTokenHash,
        session.expires_at,
      ]
    );

    // 4. Issue a new access token
    const accessToken = signAccessToken(
      {
        userId: session.user_id,
        sessionId: session.id,
        authVersion: session.auth_version,
      },
      getJwtConfig().audience
    );

    await client.query("COMMIT");
    transactionOpen = false;

    // 5. Build the response + set cookies
    const response = NextResponse.json(
      {
        success: true,
        message: "Token refreshed",
        data: {
          id: session.user_id,
          bhid: session.bhid,
          email: session.email,
          emailVerified: session.email_verified_at !== null,
          sessionExpiresAt: newExpiresAt.toISOString(),
        },
      },
      { status: 200 }
    );

    const secureCookies = process.env.NODE_ENV === "production";

    response.cookies.set("bhid_access", accessToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_SECONDS,
    });

    response.cookies.set("bhid_refresh", newRefreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: REFRESH_IDLE_SECONDS,
    });

    return response;
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Refresh rollback failed:", rollbackError);
      }
    }

    console.error("Refresh token error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to refresh session" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}