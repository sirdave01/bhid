import { NextRequest, NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { isFounderAccount } from "@/lib/founder-access";
import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await context.params;
  if (!UUID_PATTERN.test(organizationId)) {
    return NextResponse.json({ error: "invalid_organization" }, { status: 400 });
  }

  try {
    if (request.headers.get("origin") !== getAppBaseUrl()) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const session = await getAuthenticatedSession(
      request.cookies.get("bhid_access")?.value
    );
    if (!session) {
      return NextResponse.json(
        { error: "authentication_required" },
        { status: 401 }
      );
    }
    if (!isFounderAccount(session)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const status =
      typeof body === "object" &&
      body !== null &&
      "status" in body &&
      typeof body.status === "string"
        ? body.status
        : "";
    if (!["ACTIVE", "SUSPENDED"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const result = await pool.query<{ status: string }>(
      `UPDATE public.organizations
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status <> $2
       RETURNING status`,
      [organizationId, status]
    );
    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "organization_not_found_or_unchanged" },
        { status: 404 }
      );
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, $2, jsonb_build_object('actor_user_id', $3))`,
      [
        organizationId,
        status === "SUSPENDED"
          ? "organization.suspended"
          : "organization.reactivated",
        session.userId,
      ]
    );
    return NextResponse.json({ success: true, status: result.rows[0].status });
  } catch (error) {
    console.error("Founder organization status update failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
