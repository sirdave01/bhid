import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";
import { getWebAuthnConfig } from "@/lib/webauthn";

const CHALLENGE_SECONDS = 5 * 60;

function readLabel(body: unknown): string | null {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("label" in body)
  ) {
    return "Passkey";
  }

  if (typeof body.label !== "string") {
    return null;
  }

  const label = body.label.trim();

  if (
    label.length < 1 ||
    label.length > 50 ||
    /[\u0000-\u001f\u007f]/.test(label)
  ) {
    return null;
  }

  return label;
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;

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
      return NextResponse.json(
        { success: false, message: "Invalid passkey label" },
        { status: 400 }
      );
    }

    const label = readLabel(body);

    if (!label) {
      return NextResponse.json(
        { success: false, message: "Passkey label must be 1 to 50 characters" },
        { status: 400 }
      );
    }

    const config = getWebAuthnConfig();
    const userResult = await pool.query<{
      email: string;
      display_name: string | null;
    }>(
      `SELECT u.email, p.display_name
       FROM users AS u
       LEFT JOIN profiles AS p
         ON p.user_id = u.id
       WHERE u.id = $1
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [session.userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const existingCredentials = await pool.query<{
      credential_id: string;
      transports: string[];
    }>(
      `SELECT credential_id, transports
       FROM webauthn_credentials
       WHERE user_id = $1`,
      [session.userId]
    );

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: Buffer.from(session.userId.replaceAll("-", ""), "hex"),
      userName: user.email,
      userDisplayName: user.display_name || user.email,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existingCredentials.rows.map((credential) => ({
        id: credential.credential_id,
        transports: credential.transports,
      })),
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
         user_id,
         session_id,
         label,
         expires_at
       )
       VALUES ($1, 'registration', $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))
       RETURNING id`,
      [
        options.challenge,
        session.userId,
        session.sessionId,
        label,
        CHALLENGE_SECONDS,
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        challengeId: challengeResult.rows[0].id,
        options,
      },
    });
  } catch (error) {
    console.error("Passkey registration options failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to start passkey registration" },
      { status: 500 }
    );
  }
}
