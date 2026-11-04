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
  const applicationId =
    typeof body === "object" &&
    body !== null &&
    "applicationId" in body &&
    typeof body.applicationId === "string"
      ? body.applicationId
      : "";
  if (!UUID_PATTERN.test(applicationId)) {
    return NextResponse.json({ error: "invalid_application" }, { status: 400 });
  }

  try {
    const founder = isFounderAccount(session);
    const accessResult = await pool.query<{
      role_key: string;
      organization_status: string;
    }>(
      `SELECT m.role_key, o.status AS organization_status
       FROM public.organization_members AS m
       JOIN public.organizations AS o ON o.id = m.organization_id
       WHERE m.organization_id = $1 AND m.user_id = $2
       LIMIT 1`,
      [organizationId, session.userId]
    );
    const access = accessResult.rows[0];
    if (
      !founder &&
      (!access ||
        !["owner", "admin"].includes(access.role_key) ||
        access.organization_status !== "ACTIVE")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const applicationResult = await pool.query(
      `SELECT id
       FROM public.applications
       WHERE id = $1
         AND (
           $2::boolean
           OR owner_user_id = $3
           OR EXISTS (
             SELECT 1
             FROM public.organization_members AS owner_members
             WHERE owner_members.organization_id = $4
               AND owner_members.user_id = applications.owner_user_id
           )
         )
       LIMIT 1`,
      [applicationId, founder, session.userId, organizationId]
    );
    if (!applicationResult.rows[0]) {
      return NextResponse.json({ error: "application_not_found" }, { status: 404 });
    }

    const result = await pool.query(
      `INSERT INTO public.organization_applications (
         organization_id, application_id, linked_by_user_id
       )
       SELECT $1, $2, $3
       WHERE EXISTS (
         SELECT 1
         FROM public.organizations
         WHERE id = $1 AND status = 'ACTIVE'
       )
       ON CONFLICT (organization_id, application_id) DO NOTHING
       RETURNING id`,
      [organizationId, applicationId, session.userId]
    );
    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "application_already_linked_or_organization_unavailable" },
        { status: 409 }
      );
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.application_linked',
               jsonb_build_object('application_id', $2))`,
      [organizationId, applicationId]
    );
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Organization application link failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
