import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import {
  PAID_MEMBERSHIP_PRICES,
  type MembershipTier,
} from "@/lib/membership";
import pool from "@/lib/db";
import {
  getHbtPaymentConfig,
  InvalidPaymentError,
  PaymentPendingError,
  verifyHbtPayment,
} from "@/lib/solana-payments";
import { decodeBase58 } from "@/lib/solana-wallet";

const PAID_TIERS = ["PREMIUM", "GOLD", "PLATINUM", "DIAMOND"] as const;
type PaidTier = (typeof PAID_TIERS)[number];

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    return origin === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Membership session lookup failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }

  if (!session) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  try {
    const [membershipResult, walletResult] = await Promise.all([
      pool.query(
        `SELECT
           CASE
             WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW()
               THEN 'BASIC'
             ELSE m.tier::text
           END AS tier,
           CASE
             WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW()
               THEN NULL
             ELSE m.expires_at
           END AS expires_at,
           u.verification_level,
           p.display_name,
           p.username
         FROM user_memberships AS m
         JOIN users AS u
           ON u.id = m.user_id
         LEFT JOIN profiles AS p
           ON p.user_id = u.id
         WHERE m.user_id = $1
         LIMIT 1`,
        [session.userId]
      ),
      pool.query(
        `SELECT wallet_address, wallet_verified_at
         FROM profiles
         WHERE user_id = $1
         LIMIT 1`,
        [session.userId]
      ),
    ]);

    let paymentConfig: ReturnType<typeof getHbtPaymentConfig> | null = null;
    try {
      paymentConfig = getHbtPaymentConfig();
    } catch (error) {
      console.error("HBT membership payment configuration is unavailable:", error);
    }

    return NextResponse.json(
      {
        membership: membershipResult.rows[0] ?? {
          tier: "BASIC",
          expires_at: null,
          verification_level: 0,
          display_name: null,
          username: null,
        },
        wallet: {
          address: walletResult.rows[0]?.wallet_address ?? null,
          verified: walletResult.rows[0]?.wallet_verified_at != null,
        },
        payment: {
          configured: paymentConfig !== null,
          mint: paymentConfig?.mint ?? null,
          treasury: paymentConfig?.treasury ?? null,
          prices: Object.fromEntries(
            Object.entries(PAID_MEMBERSHIP_PRICES).map(([tier, price]) => [
              tier,
              price.toString(),
            ])
          ),
          durationDays: 30,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Membership details lookup failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Membership payment session lookup failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }

  if (!session) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("signature" in body) ||
    typeof body.signature !== "string" ||
    !("tier" in body) ||
    typeof body.tier !== "string" ||
    !PAID_TIERS.includes(body.tier as PaidTier)
  ) {
    return NextResponse.json({ error: "invalid_payment" }, { status: 400 });
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeBase58(body.signature);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (signatureBytes.length !== 64) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const walletResult = await pool.query<{
      wallet_address: string | null;
      wallet_verified_at: Date | null;
    }>(
      `SELECT wallet_address, wallet_verified_at
       FROM profiles
       WHERE user_id = $1
       LIMIT 1`,
      [session.userId]
    );
    const wallet = walletResult.rows[0];

    if (!wallet?.wallet_address || !wallet.wallet_verified_at) {
      return NextResponse.json(
        { error: "verified_wallet_required" },
        { status: 409 }
      );
    }

    const attemptResult = await pool.query<{ attempts: number }>(
      `INSERT INTO membership_payment_attempt_limits AS limits (
         user_id,
         window_started_at,
         attempts
       )
       VALUES ($1, NOW(), 1)
       ON CONFLICT (user_id)
       DO UPDATE SET
         window_started_at = CASE
           WHEN limits.window_started_at <= NOW() - INTERVAL '15 minutes'
             THEN NOW()
           ELSE limits.window_started_at
         END,
         attempts = CASE
           WHEN limits.window_started_at <= NOW() - INTERVAL '15 minutes'
             THEN 1
           ELSE limits.attempts + 1
         END
       RETURNING attempts`,
      [session.userId]
    );

    if (attemptResult.rows[0].attempts > 10) {
      return NextResponse.json(
        { error: "too_many_payment_checks" },
        { status: 429 }
      );
    }

    let payment;
    try {
      payment = await verifyHbtPayment(
        getHbtPaymentConfig(),
        body.signature,
        wallet.wallet_address,
        body.tier as PaidTier
      );
    } catch (error) {
      if (error instanceof PaymentPendingError) {
        return NextResponse.json(
          { error: "payment_pending", message: error.message },
          { status: 202, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (error instanceof InvalidPaymentError) {
        return NextResponse.json(
          { error: "payment_not_valid", message: error.message },
          { status: 400 }
        );
      }
      throw error;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const membershipResult = await client.query<{
        tier: MembershipTier;
        expires_at: Date | null;
        database_now: Date;
      }>(
        `SELECT tier, expires_at, NOW() AS database_now
         FROM user_memberships
         WHERE user_id = $1
         FOR UPDATE`,
        [session.userId]
      );

      if (!membershipResult.rows[0]) {
        throw new Error("User membership row is missing.");
      }

      const currentMembership = membershipResult.rows[0];
      const now = currentMembership.database_now;
      const activeExpiry =
        currentMembership.expires_at &&
        currentMembership.expires_at.getTime() > now.getTime()
          ? currentMembership.expires_at
          : now;
      const expiresAt = new Date(activeExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO membership_payments (
           signature,
           user_id,
           tier,
           amount_base_units,
           token_mint,
           source_wallet,
           paid_at,
           membership_expires_at
         )
         VALUES ($1, $2, $3::public.membership_tier, $4, $5, $6, $7, $8)`,
        [
          body.signature,
          session.userId,
          body.tier,
          payment.amountBaseUnits,
          getHbtPaymentConfig().mint,
          wallet.wallet_address,
          payment.paidAt,
          expiresAt,
        ]
      );

      await client.query(
        `UPDATE user_memberships
         SET tier = $2::public.membership_tier,
             started_at = CASE
               WHEN expires_at IS NOT NULL AND expires_at > NOW()
                 THEN started_at
               ELSE $3
             END,
             expires_at = $4,
             updated_at = NOW()
         WHERE user_id = $1`,
        [session.userId, body.tier, now, expiresAt]
      );
      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          membership: { tier: body.tier, expiresAt: expiresAt.toISOString() },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      const databaseError = error as { code?: string };

      if (databaseError.code === "23505") {
        return NextResponse.json(
          { error: "payment_already_used" },
          { status: 409 }
        );
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("HBT membership payment verification failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
