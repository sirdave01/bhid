import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";
import { generateRefreshToken, hashToken, signAccessToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";
import pool from "@/lib/db";

const ACCESS_TOKEN_SECONDS = 10 * 60;
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;

type LoginChallenge = {
  id: string;
  user_id: string;
  bhid: string;
  email: string;
  email_verified_at: Date | null;
  auth_version: number;
  secret_encrypted: string;
  attempts: number;
};

function invalidCode() {
  return NextResponse.json(
    { success: false, message: "Invalid or expired authenticator challenge" },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidCode();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("challengeToken" in body) ||
    typeof body.challengeToken !== "string" ||
    !/^[A-Za-z0-9_-]{40,64}$/.test(body.challengeToken) ||
    !("code" in body) ||
    typeof body.code !== "string" ||
    !/^\d{6}$/.test(body.code)
  ) {
    return invalidCode();
  }

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const now = Date.now();
  const refreshExpiresAt = new Date(
    now + REFRESH_IDLE_SECONDS * 1000
  );
  const absoluteExpiresAt = new Date(
    now + SESSION_ABSOLUTE_SECONDS * 1000
  );

  let client: PoolClient | undefined;
  let transactionOpen = false;
  let accessToken = "";
  let user: LoginChallenge | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const result = await client.query<LoginChallenge>(
      `SELECT
         c.id,
         c.user_id,
         c.attempts,
         u.bhid,
         u.email,
         u.email_verified_at,
         u.auth_version,
         m.secret_encrypted
       FROM totp_login_challenges AS c
       JOIN users AS u
         ON u.id = c.user_id
       JOIN totp_methods AS m
         ON m.user_id = u.id
       WHERE c.token_hash = $1
         AND c.used_at IS NULL
         AND c.expires_at > NOW()
         AND c.attempts < 5
         AND u.status = 'ACTIVE'
       FOR UPDATE OF c, u`,
      [hashToken(body.challengeToken)]
    );
    user = result.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidCode();
    }

    if (
      !verifyTotpCode(
        decryptTotpSecret(user.secret_encrypted),
        body.code
      )
    ) {
      await client.query(
        `UPDATE totp_login_challenges
         SET attempts = attempts + 1,
             used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
         WHERE id = $1`,
        [user.id]
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidCode();
    }

    await client.query(
      `UPDATE totp_login_challenges
       SET used_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    const sessionResult = await client.query<{ id: string }>(
      `INSERT INTO sessions (
         user_id,
         token_hash,
         user_agent,
         expires_at,
         absolute_expires_at
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        user.user_id,
        refreshTokenHash,
        request.headers.get("user-agent")?.slice(0, 512) ?? null,
        refreshExpiresAt,
        absoluteExpiresAt,
      ]
    );

    accessToken = signAccessToken(
      {
        userId: user.user_id,
        sessionId: sessionResult.rows[0].id,
        authVersion: user.auth_version,
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
        console.error("TOTP login rollback failed:", rollbackError);
      }
    }

    console.error("TOTP login failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to complete sign-in right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }

  if (!user || !accessToken) {
    return NextResponse.json(
      { success: false, message: "Unable to complete sign-in right now" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({
    success: true,
    message: "Login successful",
    data: {
      id: user.user_id,
      bhid: user.bhid,
      email: user.email,
      emailVerified: user.email_verified_at !== null,
      sessionExpiresAt: refreshExpiresAt.toISOString(),
    },
  });
  const secureCookies = process.env.NODE_ENV === "production";

  response.cookies.set("bhid_access", accessToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_SECONDS,
  });
  response.cookies.set("bhid_refresh", refreshToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_IDLE_SECONDS,
  });

  return response;
}
