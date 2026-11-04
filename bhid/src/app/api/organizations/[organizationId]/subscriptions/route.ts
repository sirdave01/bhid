import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { isFounderAccount } from "@/lib/founder-access";
import pool from "@/lib/db";

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
  context: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await context.params;
  if (!UUID_PATTERN.test(organizationId) || !isSameOrigin(request)) {
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
  const planId =
    typeof body === "object" &&
    body !== null &&
    "planId" in body &&
    typeof body.planId === "string"
      ? body.planId
      : "";
  if (!UUID_PATTERN.test(planId)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orgResult = await client.query<{ status: string }>(
      `SELECT status FROM public.organizations WHERE id = $1 FOR UPDATE`,
      [organizationId]
    );
    if (orgResult.rows[0]?.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "organization_unavailable" }, { status: 404 });
    }

    const founder = isFounderAccount(session);
    const membershipResult = await client.query<{ role_key: string }>(
      `SELECT role_key
       FROM public.organization_members
       WHERE organization_id = $1 AND user_id = $2
       FOR UPDATE`,
      [organizationId, session.userId]
    );
    if (
      !founder &&
      !["owner", "admin"].includes(membershipResult.rows[0]?.role_key ?? "")
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const planResult = await client.query<{
      name: string;
      monthly_price_hbt: string;
      is_active: boolean;
    }>(
      `SELECT name, monthly_price_hbt::text, is_active
       FROM public.subscription_plans
       WHERE id = $1
       FOR UPDATE`,
      [planId]
    );
    const plan = planResult.rows[0];
    if (!plan?.is_active || plan.monthly_price_hbt === null) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "plan_unavailable" }, { status: 409 });
    }

    const subscriptionResult = await client.query<{ id: string }>(
      `INSERT INTO public.subscriptions (organization_id, plan_id, status)
       VALUES ($1, $2, 'INCOMPLETE')
       RETURNING id`,
      [organizationId, planId]
    );
    const subscriptionId = subscriptionResult.rows[0].id;
    const invoiceNumber = `BH-${new Date()
      .toISOString()
      .slice(0, 7)
      .replace("-", "")}-${randomBytes(5).toString("hex").toUpperCase()}`;
    const invoiceResult = await client.query<{ id: string }>(
      `INSERT INTO public.invoices (
         organization_id, subscription_id, invoice_number, amount_hbt,
         status, issued_at, due_at
       )
       VALUES (
         $1, $2, $3, $4, 'OPEN', now(), now() + interval '7 days'
       )
       RETURNING id`,
      [
        organizationId,
        subscriptionId,
        invoiceNumber,
        plan.monthly_price_hbt,
      ]
    );

    await client.query(
      `INSERT INTO public.billing_events (
         organization_id, subscription_id, invoice_id, event_type, payload
       )
       VALUES ($1, $2, $3, 'subscription.plan_selected',
               jsonb_build_object('plan_id', $4))`,
      [organizationId, subscriptionId, invoiceResult.rows[0].id, planId]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      {
        invoiceId: invoiceResult.rows[0].id,
        invoiceNumber,
        status: "OPEN",
      },
      { status: 201 }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Organization plan change rollback failed:", rollbackError);
    }
    console.error("Organization plan change failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
