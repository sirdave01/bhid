import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import {
  generateBhid,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";
import { decryptTotpSecret, matchTotpCounter } from "@/lib/totp";

const ACCESS_TOKEN_SECONDS = 10 * 60;
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;

type SignupChallenge = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  username: string | null;
  password_hash: string;
  secret_encrypted: string;
  attempts: number;
};

function invalidChallenge() {
  return NextResponse.json(
    {
      success: false,
      message: "This registration challenge is invalid or expired",
    },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body is not valid JSON" },
      { status: 400 }
    );
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
    return invalidChallenge();
  }

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  const now = Date.now();
  const refreshExpiresAt = new Date(now + REFRESH_IDLE_SECONDS * 1000);
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_SECONDS * 1000);
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let accessToken: string | undefined;
  let account: {
    id: string;
    bhid: string;
    email: string;
    auth_version: number;
    email_verified_at: Date | null;
  } | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const challengeResult = await client.query<SignupChallenge>(
      `SELECT
         id,
         email,
         first_name,
         last_name,
         username,
         password_hash,
         secret_encrypted,
         attempts
       FROM signup_mfa_challenges
       WHERE token_hash = $1
         AND expires_at > NOW()
         AND attempts < 5
       FOR UPDATE`,
      [hashToken(body.challengeToken)]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidChallenge();
    }

    const matchedStep = matchTotpCounter(
      decryptTotpSecret(challenge.secret_encrypted),
      body.code
    );

    if (matchedStep === null) {
      await client.query(
        `UPDATE signup_mfa_challenges
         SET attempts = attempts + 1
         WHERE id = $1`,
        [challenge.id]
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidChallenge();
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [challenge.email]
    );
    const userResult = await client.query(
      `INSERT INTO users (bhid, email, password_hash, status, verification_level)
       VALUES ($1, $2, $3, 'ACTIVE', 0)
       RETURNING id, bhid, email, auth_version, email_verified_at`,
      [generateBhid(), challenge.email, challenge.password_hash]
    );
    account = userResult.rows[0];
    const displayName = `${challenge.first_name} ${challenge.last_name}`;

    await client.query(
      `INSERT INTO profiles (user_id, username, display_name)
       VALUES ($1, $2, $3)`,
      [account.id, challenge.username, displayName]
    );
    await client.query(
      `INSERT INTO totp_methods (user_id, secret_encrypted, last_used_step)
       VALUES ($1, $2, $3)`,
      [account.id, challenge.secret_encrypted, matchedStep.toString()]
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
        account.id,
        refreshTokenHash,
        request.headers.get("user-agent")?.slice(0, 512) ?? null,
        refreshExpiresAt,
        absoluteExpiresAt,
      ]
    );

    accessToken = signAccessToken(
      {
        userId: account.id,
        sessionId: sessionResult.rows[0].id,
        authVersion: account.auth_version,
      },
      getJwtConfig().audience
    );
    await client.query(
      "DELETE FROM signup_mfa_challenges WHERE id = $1",
      [challenge.id]
    );
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Registration confirmation rollback failed:", rollbackError);
      }
    }

    const dbError = error as { code?: string; constraint?: string };
    if (
      dbError.code === "23505" &&
      dbError.constraint === "users_email_unique"
    ) {
      return NextResponse.json(
        { success: false, message: "Unable to register with those details" },
        { status: 409 }
      );
    }
    if (
      dbError.code === "23505" &&
      (dbError.constraint === "profiles_username_lower_unique" ||
        dbError.constraint === "profiles_username_key")
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "That username is already in use. Restart registration.",
        },
        { status: 409 }
      );
    }

    console.error("Registration confirmation failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to complete registration right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }

  if (!account || !accessToken) {
    return NextResponse.json(
      { success: false, message: "Unable to complete registration right now" },
      { status: 500 }
    );
  }

  const response = NextResponse.json(
    {
      success: true,
      message: "Your account is ready",
      data: {
        id: account.id,
        bhid: account.bhid,
        email: account.email,
        emailVerified: account.email_verified_at !== null,
        sessionExpiresAt: refreshExpiresAt.toISOString(),
      },
    },
    { status: 201 }
  );
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
