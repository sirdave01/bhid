import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getRequestSession } from "@/lib/account-session";
import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";
import { getJwtConfig } from "@/lib/jwt-keys";

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Email verification session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to request verification right now" },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  if (session.emailVerified) {
    return NextResponse.json({
      success: true,
      message: "Your email address is already verified",
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Email verification is not configured. Contact the BHID administrator.",
      },
      { status: 503 }
    );
  }

  let verificationUrl: URL;

  try {
    verificationUrl = new URL("/verify-email", getJwtConfig().issuer);
  } catch (error) {
    console.error("Email verification issuer configuration failed:", error);
    return NextResponse.json(
      { success: false, message: "Email verification is not configured" },
      { status: 503 }
    );
  }

  const verificationToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(verificationToken);
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let tokenStored = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [session.userId]
    );

    const recentRequest = await client.query(
      `SELECT 1
       FROM email_verification_tokens
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '2 minutes'
       LIMIT 1`,
      [session.userId]
    );

    if (recentRequest.rowCount) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          message: "Please wait before requesting another verification email",
        },
        { status: 429 }
      );
    }

    await client.query(
      `DELETE FROM email_verification_tokens
       WHERE user_id = $1
         AND used_at IS NULL`,
      [session.userId]
    );
    await client.query(
      `INSERT INTO email_verification_tokens (
         user_id,
         token_hash,
         expires_at
       )
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [session.userId, tokenHash]
    );
    await client.query("COMMIT");
    transactionOpen = false;
    tokenStored = true;

    verificationUrl.hash = new URLSearchParams({
      token: verificationToken,
    }).toString();
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [session.email],
        subject: "Verify your BHID email address",
        html: `<p>Confirm your email address for BHID by using the button below.</p><p><a href="${verificationUrl.toString()}">Verify email address</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this message.</p>`,
      }),
      cache: "no-store",
    });

    if (!emailResponse.ok) {
      await pool.query(
        `DELETE FROM email_verification_tokens
         WHERE token_hash = $1`,
        [tokenHash]
      );
      tokenStored = false;
      console.error(
        "Resend email delivery failed with status:",
        emailResponse.status
      );
      return NextResponse.json(
        { success: false, message: "Unable to send a verification email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "A verification link has been sent to your email address",
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Email verification rollback failed:", rollbackError);
      }
    }

    if (tokenStored) {
      try {
        await pool.query(
          "DELETE FROM email_verification_tokens WHERE token_hash = $1",
          [tokenHash]
        );
      } catch (cleanupError) {
        console.error("Email verification token cleanup failed:", cleanupError);
      }
    }

    console.error("Email verification request failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to request verification right now" },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
