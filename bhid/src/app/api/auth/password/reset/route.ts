import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { hashPassword, hashToken } from "@/lib/auth";
import { decryptTotpSecret, matchTotpCounter } from "@/lib/totp";
import pool from "@/lib/db";
import { passwordResetSchema } from "@/lib/validations";

type ResetChallenge = {
  id: string;
  user_id: string;
  email_code_hash: string;
  attempts: number;
  secret_encrypted: string;
  last_used_step: string | null;
};

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
    return NextResponse.json(
      { success: false, message: "Request body is not valid JSON" },
      { status: 400 }
    );
  }

  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please correct the password reset details",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const challengeResult = await client.query<ResetChallenge>(
      `SELECT
         c.id,
         c.user_id,
         c.email_code_hash,
         c.attempts,
         m.secret_encrypted,
         m.last_used_step
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
       FOR UPDATE OF c, u, m`,
      [hashToken(parsed.data.challengeToken)]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return invalidChallenge();
    }

    const storedCodeHash = Buffer.from(challenge.email_code_hash, "hex");
    const submittedCodeHash = Buffer.from(hashToken(parsed.data.emailCode), "hex");
    const emailCodeIsValid =
      storedCodeHash.length === submittedCodeHash.length &&
      timingSafeEqual(storedCodeHash, submittedCodeHash);
    const matchedStep = matchTotpCounter(
      decryptTotpSecret(challenge.secret_encrypted),
      parsed.data.totpCode
    );
    const totpCodeIsValid =
      matchedStep !== null &&
      (challenge.last_used_step === null ||
        matchedStep > BigInt(challenge.last_used_step));

    if (!emailCodeIsValid || !totpCodeIsValid || matchedStep === null) {
      await client.query(
        `UPDATE password_reset_challenges
         SET attempts = attempts + 1,
             used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
         WHERE id = $1`,
        [challenge.id]
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return invalidChallenge();
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await client.query(
      `UPDATE users
       SET password_hash = $2,
           auth_version = auth_version + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challenge.user_id, passwordHash]
    );
    await client.query(
      `UPDATE totp_methods
       SET last_used_step = $2
       WHERE user_id = $1`,
      [challenge.user_id, matchedStep.toString()]
    );
    await client.query(
      `UPDATE password_reset_challenges
       SET used_at = NOW()
       WHERE id = $1`,
      [challenge.id]
    );
    await client.query(
      `UPDATE sessions
       SET revoked_at = NOW(),
           revoked_reason = 'password_reset'
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [challenge.user_id]
    );
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Password reset rollback failed:", rollbackError);
      }
    }

    console.error("Password reset failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to reset your password right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }

  const response = NextResponse.json({
    success: true,
    message: "Password reset successfully. Sign in with your new password.",
  });
  response.cookies.set("bhid_access", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("bhid_refresh", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
  return response;
}
