import { Buffer } from "node:buffer";
import {
  verifyAuthenticationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";

import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";
import {
  getWebAuthnConfig,
  isAuthenticationResponse,
} from "@/lib/webauthn";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

function invalidChallenge() {
  return NextResponse.json(
    {
      success: false,
      message: "The passkey could not be verified for this password reset",
    },
    { status: 401 }
  );
}

async function consumeFailedAttempt(
  client: PoolClient,
  resetChallengeId: string
) {
  await client.query(
    `UPDATE password_reset_challenges
     SET attempts = attempts + 1,
         used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
     WHERE id = $1`,
    [resetChallengeId]
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidChallenge();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("challengeToken" in body) ||
    typeof body.challengeToken !== "string" ||
    !RESET_TOKEN_PATTERN.test(body.challengeToken) ||
    !("challengeId" in body) ||
    typeof body.challengeId !== "string" ||
    !UUID_PATTERN.test(body.challengeId) ||
    !("response" in body) ||
    !isAuthenticationResponse(body.response)
  ) {
    return invalidChallenge();
  }

  let config;
  try {
    config = getWebAuthnConfig();
  } catch (error) {
    console.error("Password reset passkey configuration failed:", error);
    return NextResponse.json(
      { success: false, message: "Passkey recovery is unavailable right now" },
      { status: 503 }
    );
  }

  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const resetResult = await client.query<{
      id: string;
      user_id: string;
    }>(
      `SELECT c.id, c.user_id
       FROM password_reset_challenges AS c
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
    const resetChallenge = resetResult.rows[0];

    if (!resetChallenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidChallenge();
    }

    const webAuthnChallengeResult = await client.query<{
      id: string;
      challenge: string;
    }>(
      `SELECT id, challenge
       FROM webauthn_challenges
       WHERE id = $1
         AND purpose = 'authentication'
         AND user_id = $2
         AND session_id IS NULL
         AND password_reset_challenge_id = $3
         AND consumed_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [body.challengeId, resetChallenge.user_id, resetChallenge.id]
    );
    const webAuthnChallenge = webAuthnChallengeResult.rows[0];

    if (!webAuthnChallenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidChallenge();
    }

    await client.query(
      `UPDATE webauthn_challenges
       SET consumed_at = NOW()
       WHERE id = $1`,
      [webAuthnChallenge.id]
    );

    const credentialResult = await client.query<{
      id: string;
      credential_id: string;
      public_key: Buffer;
      sign_count: string;
      transports: string[];
    }>(
      `SELECT id, credential_id, public_key, sign_count, transports
       FROM webauthn_credentials
       WHERE user_id = $1
         AND credential_id = $2
       FOR UPDATE`,
      [resetChallenge.user_id, body.response.id]
    );
    const credential = credentialResult.rows[0];

    if (!credential) {
      await consumeFailedAttempt(client, resetChallenge.id);
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidChallenge();
    }

    const signCount = Number(credential.sign_count);
    if (!Number.isSafeInteger(signCount) || signCount < 0) {
      throw new Error("Stored passkey signature counter is invalid");
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: webAuthnChallenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        credential: {
          id: credential.credential_id,
          publicKey: new Uint8Array(credential.public_key),
          counter: signCount,
          transports: credential.transports,
        },
        requireUserVerification: true,
      });
    } catch {
      await consumeFailedAttempt(client, resetChallenge.id);
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidChallenge();
    }

    if (
      !verification.verified ||
      !verification.authenticationInfo.userVerified
    ) {
      await consumeFailedAttempt(client, resetChallenge.id);
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidChallenge();
    }

    await client.query(
      `UPDATE webauthn_credentials
       SET sign_count = $2,
           device_type = $3,
           backed_up = $4,
           last_used_at = NOW()
       WHERE id = $1`,
      [
        credential.id,
        verification.authenticationInfo.newCounter,
        verification.authenticationInfo.credentialDeviceType,
        verification.authenticationInfo.credentialBackedUp,
      ]
    );
    await client.query(
      `UPDATE password_reset_challenges
       SET passkey_verified_at = NOW()
       WHERE id = $1`,
      [resetChallenge.id]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      success: true,
      message: "Passkey verified",
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Password reset passkey verification rollback failed:",
          rollbackError
        );
      }
    }

    console.error("Password reset passkey verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify this passkey right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
