// creating the login route for handling user login requests,
// while getting validation from the loginSchema to ensure that the input data meets the required
// format and constraints. The route also uses the getJwtConfig function to retrieve the JWT
// configuration for generating access tokens upon successful authentication.

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  verifyPassword,
} from "@/lib/auth";
import {  getJwtConfig } from "@/lib/jwt-keys";
import { loginSchema } from "@/lib/validations";

const ACCESS_TOKEN_SECONDS = 10 * 60;
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Request body is not valid JSON",
      },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please correct the login details",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  let user;

  try {
    const result = await pool.query(
      `SELECT
         id,
         bhid,
         email,
         password_hash,
         status,
         auth_version,
         email_verified_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    user = result.rows[0];
  } catch (error) {
    console.error("Login user lookup failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to sign in right now",
      },
      { status: 500 }
    );
  }

  // Keep the public response the same for unknown emails
  // and incorrect passwords.
  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid email or password",
      },
      { status: 401 }
    );
  }

  let passwordIsValid: boolean;

  try {
    passwordIsValid = await verifyPassword(
      user.password_hash,
      password
    );
  } catch (error) {
    console.error("Password verification failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to sign in right now",
      },
      { status: 500 }
    );
  }

  if (!passwordIsValid || user.status !== "ACTIVE") {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid email or password",
      },
      { status: 401 }
    );
  }

  try {
    const mfaResult = await pool.query(
      `SELECT 1
       FROM totp_methods
       WHERE user_id = $1
       LIMIT 1`,
      [user.id]
    );

    if (mfaResult.rowCount) {
      const challengeToken = randomBytes(32).toString("base64url");
      const challengeClient = await pool.connect();
      let challengeTransactionOpen = false;

      try {
        await challengeClient.query("BEGIN");
        challengeTransactionOpen = true;
        await challengeClient.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [user.id]
        );

        const recentChallenges = await challengeClient.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM totp_login_challenges
           WHERE user_id = $1
             AND created_at > NOW() - INTERVAL '15 minutes'`,
          [user.id]
        );

        if (Number(recentChallenges.rows[0]?.total ?? "0") >= 5) {
          await challengeClient.query("ROLLBACK");
          challengeTransactionOpen = false;
          return NextResponse.json(
            {
              success: false,
              message: "Too many authenticator attempts. Please try again later.",
            },
            { status: 429 }
          );
        }

        await challengeClient.query(
          `INSERT INTO totp_login_challenges (
             user_id,
             token_hash,
             expires_at
           )
           VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
          [user.id, hashToken(challengeToken)]
        );
        await challengeClient.query("COMMIT");
        challengeTransactionOpen = false;
      } catch (error) {
        if (challengeTransactionOpen) {
          await challengeClient.query("ROLLBACK");
        }

        throw error;
      } finally {
        challengeClient.release();
      }

      return NextResponse.json({
        success: true,
        mfaRequired: true,
        message: "Enter the code from your authenticator app",
        data: { challengeToken },
      });
    }
  } catch (error) {
    console.error("Login MFA lookup failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to sign in right now",
      },
      { status: 500 }
    );
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
  let sessionId = "";

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    const sessionResult = await client.query(
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
        user.id,
        refreshTokenHash,
        request.headers.get("user-agent"),
        refreshExpiresAt,
        absoluteExpiresAt,
      ]
    );

    sessionId = sessionResult.rows[0].id;

    accessToken = signAccessToken(
      {
        userId: user.id,
        sessionId,
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
        console.error(
          "Login transaction rollback failed:",
          rollbackError
        );
      }
    }

    console.error("Login session creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to sign in right now",
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }

  const response = NextResponse.json(
    {
      success: true,
      message: "Login successful",
      data: {
        id: user.id,
        bhid: user.bhid,
        email: user.email,
        emailVerified: user.email_verified_at !== null,
        sessionExpiresAt: refreshExpiresAt.toISOString(),
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

  response.cookies.set("bhid_refresh", refreshToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_IDLE_SECONDS,
  });

  return response;
}