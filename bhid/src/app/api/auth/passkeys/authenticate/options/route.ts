import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getWebAuthnConfig } from "@/lib/webauthn";

const CHALLENGE_SECONDS = 5 * 60;

export async function POST(request: NextRequest) {
  let useAnotherDevice = false;

  if (request.body) {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid passkey sign-in request" },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      ("useAnotherDevice" in body &&
        typeof body.useAnotherDevice !== "boolean")
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid passkey sign-in request" },
        { status: 400 }
      );
    }

    useAnotherDevice =
      "useAnotherDevice" in body && body.useAnotherDevice === true;
  }

  try {
    const config = getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: "required",
    });

    if (useAnotherDevice) {
      options.hints = ["hybrid"];
    }

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
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Passkey authentication options failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to start passkey sign-in" },
      { status: 500 }
    );
  }
}
