import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth";
import {
  createTotpSecret,
  createTotpUri,
  encryptTotpSecret,
} from "@/lib/totp";
import { registerSchema } from "@/lib/validations";

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

  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please correct the registration details",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { firstName, lastName, email, password, username } = parsed.data;
  let passwordHash: string;

  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    console.error("Registration credential preparation failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  }

  const secret = createTotpSecret();
  let secretEncrypted: string;

  try {
    secretEncrypted = encryptTotpSecret(secret);
  } catch (error) {
    console.error("Registration MFA secret encryption failed:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to start registration. Check the authenticator encryption configuration.",
      },
      { status: 503 }
    );
  }

  const challengeToken = randomBytes(32).toString("base64url");
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error("Registration database connection failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  }

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [email]
    );

    const existingUser = await client.query(
      "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (existingUser.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Unable to register with those details" },
        { status: 409 }
      );
    }

    await client.query(
      `DELETE FROM signup_mfa_challenges
       WHERE expires_at <= NOW()`
    );
    await client.query(
      `INSERT INTO signup_mfa_challenges (
         token_hash,
         email,
         first_name,
         last_name,
         username,
         password_hash,
         secret_encrypted,
         expires_at,
         attempts
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '15 minutes', 0)
       ON CONFLICT (email) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           secret_encrypted = EXCLUDED.secret_encrypted,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           created_at = NOW()`,
      [
        hashToken(challengeToken),
        email,
        firstName,
        lastName,
        username ?? null,
        passwordHash,
        secretEncrypted,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      {
        success: true,
        message: "Set up your authenticator to finish creating your account",
        data: {
          challengeToken,
          secret,
          otpauthUri: createTotpUri(secret, email),
          expiresInSeconds: 900,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Registration start rollback failed:", rollbackError);
    }

    const dbError = error as { code?: string; constraint?: string };
    if (dbError.code === "23505") {
      return NextResponse.json(
        { success: false, message: "Unable to register with those details" },
        { status: 409 }
      );
    }

    console.error("Registration start failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
