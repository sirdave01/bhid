import { Buffer } from "node:buffer";
import {
  verifyRegistrationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";
import {
  getWebAuthnConfig,
  isRegistrationResponse,
} from "@/lib/webauthn";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidRequest() {
  return NextResponse.json(
    { success: false, message: "Passkey registration could not be verified" },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;
  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    const session = await getAuthenticatedSession(accessToken);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

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
      !isRegistrationResponse(body.response)
    ) {
      return invalidRequest();
    }

    const config = getWebAuthnConfig();
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const challengeResult = await client.query<{
      challenge: string;
      label: string;
    }>(
      `SELECT c.challenge, c.label
       FROM webauthn_challenges AS c
       JOIN sessions AS s
         ON s.id = c.session_id
       JOIN users AS u
         ON u.id = c.user_id
       WHERE c.id = $1
         AND c.purpose = 'registration'
         AND c.user_id = $2
         AND c.session_id = $3
         AND c.consumed_at IS NULL
         AND c.expires_at > NOW()
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         AND u.status = 'ACTIVE'
         AND u.auth_version = $4
       FOR UPDATE OF c, s, u`,
      [
        body.challengeId,
        session.userId,
        session.sessionId,
        session.authVersion,
      ]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    let verification: VerifiedRegistrationResponse;

    try {
      verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: true,
      });
    } catch {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    if (!verification.verified || !verification.registrationInfo.userVerified) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidRequest();
    }

    const credential = verification.registrationInfo.credential;

    const savedCredential = await client.query<{ id: string }>(
      `INSERT INTO webauthn_credentials (
         user_id,
         credential_id,
         public_key,
         sign_count,
         transports,
         device_type,
         backed_up,
         label
       )
       RETURNING id
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        session.userId,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        credential.transports ?? [],
        verification.registrationInfo.credentialDeviceType,
        verification.registrationInfo.credentialBackedUp,
        challenge.label,
      ]
    );

    await client.query(
      `UPDATE webauthn_challenges
       SET consumed_at = NOW()
       WHERE id = $1`,
      [body.challengeId]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      success: true,
      message: "Passkey added",
      data: {
        passkeyId: savedCredential.rows[0].id,
        label: challenge.label,
      },
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Passkey registration rollback failed:", rollbackError);
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "This passkey is already registered" },
        { status: 409 }
      );
    }

    console.error("Passkey registration verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to save this passkey right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
