import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getWebAuthnConfig } from "@/lib/webauthn";

const CHALLENGE_SECONDS = 5 * 60;

export async function POST() {
  try {
    const config = getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: "required",
    });

    await pool.query(
      `DELETE FROM webauthn_challenges
       WHERE expires_at <= NOW()
          OR consumed_at IS NOT NULL`
    );
    const challengeResult = await pool.query<{ id: string }>(
      `INSERT INTO webauthn_challenges (
         challenge,
         purpose,
         expires_at
       )
       VALUES ($1, 'authentication', NOW() + ($2 * INTERVAL '1 second'))
       RETURNING id`,
      [options.challenge, CHALLENGE_SECONDS]
    );

    return NextResponse.json({
      success: true,
      data: {
        challengeId: challengeResult.rows[0].id,
        options,
      },
    });
  } catch (error) {
    console.error("Passkey authentication options failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to start passkey sign-in" },
      { status: 500 }
    );
  }
}
