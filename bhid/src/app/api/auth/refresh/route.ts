import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";

const ACCESS_TOKEN_SECONDS = 10 * 60;
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      message: "Authentication required",
    },
    { status: 401 }
  );
}

function refreshUnavailable() {
  return NextResponse.json(
    {
      success: false,
      message: "Unable to refresh your session right now",
    },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("bhid_refresh")?.value;

  if (!refreshToken) {
    return unauthorized();
  }

  const currentTokenHash = hashToken(refreshToken);
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let accessToken: string | undefined;
  let replacementRefreshToken: string | undefined;
  let sessionExpiresAt: Date | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    // Lock the live session so simultaneous requests cannot rotate it twice.
    const sessionResult = await client.query(
      `SELECT
         s.id,
         s.user_id,
         s.expires_at,
         s.token_family_id,
         u.auth_version
       FROM sessions AS s
       JOIN users AS u
         ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         AND u.status = 'ACTIVE'
       FOR UPDATE OF s, u`,
      [currentTokenHash]
    );

    const session = sessionResult.rows[0];

    if (!session) {
      // A hash found here proves the cookie was rotated previously, not merely invalid.
      const historyResult = await client.query(
        `SELECT s.token_family_id
         FROM session_refresh_token_history AS h
         JOIN sessions AS s
           ON s.id = h.session_id
         WHERE h.token_hash = $1
           AND h.expires_at > NOW()
         FOR UPDATE OF s`,
        [currentTokenHash]
      );

      const reusedToken = historyResult.rows[0];

      if (reusedToken) {
        await client.query(
          `UPDATE sessions
           SET revoked_at = NOW(),
               revoked_reason = 'refresh_token_reuse'
           WHERE token_family_id = $1
             AND revoked_at IS NULL`,
          [reusedToken.token_family_id]
        );

        await client.query("COMMIT");
        transactionOpen = false;
        return unauthorized();
      }

      await client.query("ROLLBACK");
      transactionOpen = false;
      return unauthorized();
    }

    if (
      typeof session.auth_version !== "number" ||
      !Number.isInteger(session.auth_version) ||
      session.auth_version < 0
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return unauthorized();
    }

    replacementRefreshToken = generateRefreshToken();
    const replacementTokenHash = hashToken(replacementRefreshToken);

    await client.query(
      `INSERT INTO session_refresh_token_history (
         session_id,
         token_hash,
         replaced_by_token_hash,
         expires_at
       )
       VALUES ($1, $2, $3, $4)`,
      [
        session.id,
        currentTokenHash,
        replacementTokenHash,
        session.expires_at,
      ]
    );

    const updatedSessionResult = await client.query(
      `UPDATE sessions
       SET token_hash = $2,
           last_used_at = NOW(),
           expires_at = LEAST(
             NOW() + ($3 * INTERVAL '1 second'),
             absolute_expires_at
           )
       WHERE id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
         AND absolute_expires_at > NOW()
       RETURNING expires_at`,
      [session.id, replacementTokenHash, REFRESH_IDLE_SECONDS]
    );
    const updatedSession = updatedSessionResult.rows[0];

    if (!updatedSession) {
      throw new Error("Session expired during refresh");
    }

    sessionExpiresAt = new Date(updatedSession.expires_at);
    accessToken = signAccessToken(
      {
        userId: session.user_id,
        sessionId: session.id,
        authVersion: session.auth_version,
      },
      getJwtConfig().audience
    );

    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Refresh transaction rollback failed:",
          rollbackError
        );
      }
    }

    console.error("Refresh session rotation failed:", error);
    return refreshUnavailable();
  } finally {
    client?.release();
  }

  if (
    !accessToken ||
    !replacementRefreshToken ||
    !sessionExpiresAt
  ) {
    return refreshUnavailable();
  }

  const now = Date.now();
  const accessExpiresAt = new Date(
    Math.min(
      now + ACCESS_TOKEN_SECONDS * 1000,
      sessionExpiresAt.getTime()
    )
  );
  const accessMaxAge = Math.max(
    0,
    Math.floor((accessExpiresAt.getTime() - now) / 1000)
  );
  const refreshMaxAge = Math.max(
    0,
    Math.floor((sessionExpiresAt.getTime() - now) / 1000)
  );

  const response = NextResponse.json(
    {
      success: true,
      message: "Session refreshed",
      data: {
        sessionExpiresAt: sessionExpiresAt.toISOString(),
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
    expires: accessExpiresAt,
    maxAge: accessMaxAge,
  });

  response.cookies.set("bhid_refresh", replacementRefreshToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    expires: sessionExpiresAt,
    maxAge: refreshMaxAge,
  });

  return response;
}
