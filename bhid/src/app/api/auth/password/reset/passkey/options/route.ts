import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";

import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";
import { getWebAuthnConfig } from "@/lib/webauthn";

const CHALLENGE_SECONDS = 5 * 60;
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

function invalidChallenge() {
  return NextResponse.json(
    {
      success: false,
      message: "The reset details are invalid, expired, or already used",
    },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidChallenge();
  }

  const challengeToken =
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "challengeToken" in body &&
    typeof body.challengeToken === "string"
      ? body.challengeToken
      : "";

  if (!RESET_TOKEN_PATTERN.test(challengeToken)) {
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
      [hashToken(challengeToken)]
    );
    const resetChallenge = resetResult.rows[0];

    if (!resetChallenge) {
      await client.query("ROLLBACK");
      return invalidChallenge();
    }

    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: "required",
    });

    await client.query(
      `DELETE FROM webauthn_challenges
       WHERE expires_at <= NOW()
          OR consumed_at IS NOT NULL`
    );

    const challengeResult = await client.query<{ id: string }>(
      `INSERT INTO webauthn_challenges (
         challenge,
         purpose,
         user_id,
         password_reset_challenge_id,
         expires_at
       )
       VALUES ($1, 'authentication', $2, $3, NOW() + ($4 * INTERVAL '1 second'))
       RETURNING id`,
      [
        options.challenge,
        resetChallenge.user_id,
        resetChallenge.id,
        CHALLENGE_SECONDS,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        data: {
          challengeId: challengeResult.rows[0].id,
          options,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Password reset passkey options rollback failed:", rollbackError);
    }

    console.error("Password reset passkey options failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to start passkey verification" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
