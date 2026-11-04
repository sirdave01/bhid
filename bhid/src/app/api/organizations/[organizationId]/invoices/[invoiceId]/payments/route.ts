import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { isFounderAccount } from "@/lib/founder-access";
import pool from "@/lib/db";
import {
  getHbtPaymentConfig,
  InvalidPaymentError,
  PaymentPendingError,
  verifyHbtTransfer,
} from "@/lib/solana-payments";
import { decodeBase58 } from "@/lib/solana-wallet";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSameOrigin(request: NextRequest) {
  try {
    return request.headers.get("origin") === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; invoiceId: string }>;
  }
) {
  const { organizationId, invoiceId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(invoiceId) ||
    !isSameOrigin(request)
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 }
    );
  }
  if (!session.emailVerified) {
    return NextResponse.json({ error: "verified_email_required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const signature =
    typeof body === "object" &&
    body !== null &&
    "signature" in body &&
    typeof body.signature === "string"
      ? body.signature.trim()
      : "";
  if (signature.length > 100) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeBase58(signature);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (signatureBytes.length !== 64) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const founder = isFounderAccount(session);
    const membershipResult = await pool.query<{ role_key: string }>(
      `SELECT role_key
       FROM public.organization_members
       WHERE organization_id = $1 AND user_id = $2
       LIMIT 1`,
      [organizationId, session.userId]
    );
    if (
      !founder &&
      !["owner", "admin"].includes(membershipResult.rows[0]?.role_key ?? "")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const invoiceResult = await pool.query<{
      amount_hbt: string;
      status: string;
      subscription_status: string;
      organization_status: string;
    }>(
      `SELECT
         i.amount_hbt::text,
         i.status,
         s.status AS subscription_status,
         o.status AS organization_status
       FROM public.invoices AS i
       JOIN public.subscriptions AS s
         ON s.id = i.subscription_id AND s.organization_id = i.organization_id
       JOIN public.organizations AS o ON o.id = i.organization_id
       WHERE i.id = $1 AND i.organization_id = $2
       LIMIT 1`,
      [invoiceId, organizationId]
    );
    const invoice = invoiceResult.rows[0];
    if (
      !invoice ||
      !["OPEN", "OVERDUE"].includes(invoice.status) ||
      invoice.subscription_status !== "INCOMPLETE" ||
      invoice.organization_status !== "ACTIVE"
    ) {
      return NextResponse.json(
        { error: "invoice_unavailable" },
        { status: 409 }
      );
    }

    const walletResult = await pool.query<{
      wallet_address: string | null;
      wallet_verified_at: Date | null;
    }>(
      `SELECT wallet_address, wallet_verified_at
       FROM public.profiles
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

    const attemptsResult = await pool.query<{ attempts: number }>(
      `INSERT INTO public.organization_payment_attempt_limits AS limits (
         user_id, window_started_at, attempts
       )
       VALUES ($1, now(), 1)
       ON CONFLICT (user_id)
       DO UPDATE SET
         window_started_at = CASE
           WHEN limits.window_started_at <= now() - interval '15 minutes'
             THEN now()
           ELSE limits.window_started_at
         END,
         attempts = CASE
           WHEN limits.window_started_at <= now() - interval '15 minutes'
             THEN 1
           ELSE limits.attempts + 1
         END
       RETURNING attempts`,
      [session.userId]
    );
    if (attemptsResult.rows[0].attempts > 10) {
      return NextResponse.json({ error: "too_many_payment_checks" }, { status: 429 });
    }

    let paymentConfig: ReturnType<typeof getHbtPaymentConfig>;
    try {
      paymentConfig = getHbtPaymentConfig();
    } catch (error) {
      console.error("Organization HBT payment configuration is unavailable:", error);
      return NextResponse.json(
        { error: "payment_configuration_unavailable" },
        { status: 503 }
      );
    }

    let payment: Awaited<ReturnType<typeof verifyHbtTransfer>>;
    try {
      payment = await verifyHbtTransfer(
        paymentConfig,
        signature,
        wallet.wallet_address,
        BigInt(invoice.amount_hbt)
      );
    } catch (error) {
      if (error instanceof PaymentPendingError) {
        return NextResponse.json(
          { error: "payment_pending", message: error.message },
          { status: 409 }
        );
      }
      if (error instanceof InvalidPaymentError) {
        return NextResponse.json(
          { error: "invalid_payment", message: error.message },
          { status: 400 }
        );
      }
      console.error("Organization HBT payment verification failed:", error);
      return NextResponse.json(
        { error: "payment_verification_unavailable" },
        { status: 503 }
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockedInvoiceResult = await client.query<{
        subscription_id: string;
        amount_hbt: string;
        status: string;
      }>(
        `SELECT subscription_id, amount_hbt::text, status
         FROM public.invoices
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [invoiceId, organizationId]
      );
      const lockedInvoice = lockedInvoiceResult.rows[0];
      if (
        !lockedInvoice ||
        !["OPEN", "OVERDUE"].includes(lockedInvoice.status) ||
        lockedInvoice.amount_hbt !== invoice.amount_hbt
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "invoice_unavailable" },
          { status: 409 }
        );
      }

      const paymentInsert = await client.query<{ id: string }>(
        `INSERT INTO public.payments (
           organization_id, invoice_id, amount_hbt, status, solana_signature,
           token_mint, payer_wallet, payer_user_id, verified_at
         )
         VALUES ($1, $2, $3, 'VERIFIED', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          organizationId,
          invoiceId,
          invoice.amount_hbt,
          signature,
          paymentConfig.mint,
          wallet.wallet_address,
          session.userId,
          payment.paidAt,
        ]
      );
      await client.query(
        `UPDATE public.invoices
         SET status = 'PAID'
         WHERE id = $1 AND organization_id = $2`,
        [invoiceId, organizationId]
      );
      await client.query(
        `UPDATE public.subscriptions
         SET status = 'CANCELED', canceled_at = now(), updated_at = now()
         WHERE organization_id = $1
           AND status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')`,
        [organizationId]
      );
      await client.query(
        `UPDATE public.subscriptions
         SET status = 'CANCELED', canceled_at = now(), updated_at = now()
         WHERE organization_id = $1
           AND status = 'INCOMPLETE'
           AND id <> $2`,
        [organizationId, lockedInvoice.subscription_id]
      );
      await client.query(
        `UPDATE public.invoices
         SET status = 'VOID'
         WHERE organization_id = $1
           AND status IN ('OPEN', 'OVERDUE')
           AND subscription_id IN (
             SELECT id
             FROM public.subscriptions
             WHERE organization_id = $1
               AND status = 'CANCELED'
               AND id <> $2
           )`,
        [organizationId, lockedInvoice.subscription_id]
      );
      await client.query(
        `UPDATE public.subscriptions
         SET status = 'ACTIVE',
             current_period_start = current_date,
             current_period_end = (current_date + interval '1 month')::date,
             updated_at = now()
         WHERE id = $1
           AND organization_id = $2
           AND status = 'INCOMPLETE'`,
        [lockedInvoice.subscription_id, organizationId]
      );
      await client.query(
        `INSERT INTO public.billing_events (
           organization_id, subscription_id, invoice_id, payment_id,
           event_type, payload
         )
         VALUES ($1, $2, $3, $4, 'payment.verified',
                 jsonb_build_object('signature', $5))`,
        [
          organizationId,
          lockedInvoice.subscription_id,
          invoiceId,
          paymentInsert.rows[0].id,
          signature,
        ]
      );
      await client.query("COMMIT");

      return NextResponse.json({ success: true });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Organization payment rollback failed:", rollbackError);
      }
      const databaseError = error as { code?: string };
      if (databaseError.code === "23505") {
        return NextResponse.json(
          { error: "signature_already_used" },
          { status: 409 }
        );
      }
      console.error("Organization payment record failed:", error);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Organization payment request failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
