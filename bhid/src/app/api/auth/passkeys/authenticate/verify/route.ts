import { Buffer } from "node:buffer";
import {
  verifyAuthenticationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { generateRefreshToken, hashToken, signAccessToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";
import {
  getWebAuthnConfig,
  isAuthenticationResponse,
} from "@/lib/webauthn";

const ACCESS_TOKEN_SECONDS = 10 * 60;
const REFRESH_IDLE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidRequest() {
  return NextResponse.json(
    { success: false, message: "Invalid passkey or expired sign-in request" },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("challengeId" in body) ||
    typeof body.challengeId !== "string" ||
    !UUID_PATTERN.test(body.challengeId) ||
    !("response" in body) ||
    !isAuthenticationResponse(body.response)
  ) {
    return invalidRequest();
  }

  const config = getWebAuthnConfig();
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
  let user:
    | {
        id: string;
        bhid: string;
        email: string;
        email_verified_at: Date | null;
        auth_version: number;
      }
    | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const challengeResult = await client.query<{ challenge: string }>(
      `SELECT challenge
       FROM webauthn_challenges
       WHERE id = $1
         AND purpose = 'authentication'
         AND session_id IS NULL
         AND consumed_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [body.challengeId]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    const userResult = await client.query<{
      id: string;
      bhid: string;
      email: string;
      email_verified_at: Date | null;
      auth_version: number;
      credential_row_id: string;
      credential_id: string;
      public_key: Buffer;
      sign_count: string;
      transports: string[];
    }>(
      `SELECT
         u.id,
         u.bhid,
         u.email,
         u.email_verified_at,
         u.auth_version,
         c.id AS credential_row_id,
         c.credential_id,
         c.public_key,
         c.sign_count,
         c.transports
       FROM webauthn_credentials AS c
       JOIN users AS u
         ON u.id = c.user_id
       WHERE c.credential_id = $1
         AND u.status = 'ACTIVE'
       FOR UPDATE OF c, u`,
      [body.response.id]
    );
    const credentialRow = userResult.rows[0];

    if (!credentialRow) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    const signCount = Number(credentialRow.sign_count);

    if (!Number.isSafeInteger(signCount) || signCount < 0) {
      throw new Error("Stored passkey signature counter is invalid");
    }

    let verification: VerifiedAuthenticationResponse;

    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        credential: {
          id: credentialRow.credential_id,
          publicKey: new Uint8Array(credentialRow.public_key),
          counter: signCount,
          transports: credentialRow.transports,
        },
        requireUserVerification: true,
      });
    } catch {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    if (
      !verification.verified ||
      !verification.authenticationInfo.userVerified
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    await client.query(
      `UPDATE webauthn_credentials
       SET sign_count = $2,
           device_type = $3,
           backed_up = $4,
           last_used_at = NOW()
       WHERE id = $1`,
      [
        credentialRow.credential_row_id,
        verification.authenticationInfo.newCounter,
        verification.authenticationInfo.credentialDeviceType,
        verification.authenticationInfo.credentialBackedUp,
      ]
    );
    await client.query(
      `UPDATE webauthn_challenges
       SET consumed_at = NOW()
       WHERE id = $1`,
      [body.challengeId]
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
        credentialRow.id,
        refreshTokenHash,
        request.headers.get("user-agent")?.slice(0, 512) ?? null,
        refreshExpiresAt,
        absoluteExpiresAt,
      ]
    );
    sessionId = sessionResult.rows[0].id;
    user = credentialRow;
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
        console.error("Passkey sign-in rollback failed:", rollbackError);
      }
    }

    console.error("Passkey sign-in verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to sign in with a passkey right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }

  if (!user || !sessionId || !accessToken) {
    return NextResponse.json(
      { success: false, message: "Unable to create your session" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({
    success: true,
    message: "Passkey sign-in successful",
    data: {
      id: user.id,
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
    expires: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
    maxAge: ACCESS_TOKEN_SECONDS,
  });
  response.cookies.set("bhid_refresh", refreshToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/api/auth",
    expires: refreshExpiresAt,
    maxAge: REFRESH_IDLE_SECONDS,
  });

  return response;
}
