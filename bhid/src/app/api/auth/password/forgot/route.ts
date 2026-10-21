import { randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { hashToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";
import pool from "@/lib/db";
import { passwordResetRequestSchema } from "@/lib/validations";

const GENERIC_MESSAGE =
  "If the account is eligible for recovery, a code and reset link will be sent to its email address.";

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

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Enter a valid email address",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Password recovery email is not configured");
    return NextResponse.json(
      { success: false, message: "Password recovery email is not configured" },
      { status: 503 }
    );
  }

  let resetUrl: URL;
  try {
    resetUrl = new URL("/reset-password", getJwtConfig().issuer);
  } catch (error) {
    console.error("Password recovery issuer configuration failed:", error);
    return NextResponse.json(
      { success: false, message: "Password recovery is not configured" },
      { status: 503 }
    );
  }

  const challengeToken = randomBytes(32).toString("base64url");
  const emailCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
  let client: PoolClient | undefined;
  let challengeStored = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const userResult = await client.query<{ id: string; email: string }>(
      `SELECT u.id, u.email
       FROM users AS u
       JOIN totp_methods AS m
         ON m.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [parsed.data.email]
    );
    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        success: true,
        message: GENERIC_MESSAGE,
        data: { challengeToken },
      });
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [user.id]
    );
    const recentRequests = await client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM password_reset_challenges
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [user.id]
    );

    if (Number(recentRequests.rows[0]?.total ?? "0") >= 3) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        success: true,
        message: GENERIC_MESSAGE,
        data: { challengeToken },
      });
    }

    await client.query(
      `DELETE FROM password_reset_challenges
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id]
    );
    await client.query(
      `INSERT INTO password_reset_challenges (
         user_id,
         token_hash,
         email_code_hash,
         expires_at
       )
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
      [user.id, hashToken(challengeToken), hashToken(emailCode)]
    );
    await client.query("COMMIT");
    challengeStored = true;

    resetUrl.hash = challengeToken;
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Your BHID password reset code",
        html: `<p>Use this email code to reset your BHID password:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${emailCode}</p><p><a href="${resetUrl.toString()}">Continue password reset</a></p><p>This code and link expire in 10 minutes. Your authenticator-app code is also required. If you did not request this, you can ignore this email.</p>`,
      }),
      cache: "no-store",
    });

    if (!emailResponse.ok) {
      await pool.query(
        "DELETE FROM password_reset_challenges WHERE token_hash = $1",
        [hashToken(challengeToken)]
      );
      challengeStored = false;
      console.error(
        "Password recovery email delivery failed with status:",
        emailResponse.status
      );
      return NextResponse.json(
        { success: false, message: "Unable to send the password reset email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: GENERIC_MESSAGE,
      data: { challengeToken },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Password recovery request rollback failed:", rollbackError);
      }
    }
    if (challengeStored) {
      try {
        await pool.query(
          "DELETE FROM password_reset_challenges WHERE token_hash = $1",
          [hashToken(challengeToken)]
        );
      } catch (cleanupError) {
        console.error("Password recovery challenge cleanup failed:", cleanupError);
      }
    }

    console.error("Password recovery request failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to request password recovery" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
