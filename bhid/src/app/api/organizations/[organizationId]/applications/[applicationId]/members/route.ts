import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
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
  context: {
    params: Promise<{ organizationId: string; applicationId: string }>;
  }
) {
  const { organizationId, applicationId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(applicationId) ||
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
  const userId =
    typeof body === "object" &&
    body !== null &&
    "userId" in body &&
    typeof body.userId === "string"
      ? body.userId
      : "";
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "invalid_member" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `INSERT INTO public.organization_application_members (
         organization_id, application_id, user_id, assigned_by_user_id
       )
       SELECT $1, $2, m.user_id, $4
       FROM public.organization_members AS actor
       JOIN public.organizations AS o
         ON o.id = actor.organization_id AND o.status = 'ACTIVE'
       JOIN public.organization_members AS m
         ON m.organization_id = actor.organization_id
       WHERE actor.organization_id = $1
         AND actor.user_id = $4
         AND actor.role_key IN ('owner', 'admin')
         AND m.user_id = $3
         AND m.role_key = 'developer'
         AND EXISTS (
           SELECT 1
           FROM public.organization_applications AS oa
           WHERE oa.organization_id = $1
             AND oa.application_id = $2
         )
       ON CONFLICT (organization_id, application_id, user_id) DO NOTHING
       RETURNING user_id`,
      [organizationId, applicationId, userId, session.userId]
    );
    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "member_not_assignable_or_already_assigned" },
        { status: 409 }
      );
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.application_member_assigned',
               jsonb_build_object('application_id', $2, 'user_id', $3))`,
      [organizationId, applicationId, userId]
    );
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Developer application assignment failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; applicationId: string }>;
  }
) {
  const { organizationId, applicationId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(applicationId) ||
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const userId =
    typeof body === "object" &&
    body !== null &&
    "userId" in body &&
    typeof body.userId === "string"
      ? body.userId
      : "";
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "invalid_member" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `DELETE FROM public.organization_application_members AS assignment
       USING public.organization_members AS actor
       JOIN public.organizations AS o
         ON o.id = actor.organization_id AND o.status = 'ACTIVE'
       WHERE actor.organization_id = $1
         AND actor.user_id = $4
         AND actor.role_key IN ('owner', 'admin')
         AND assignment.organization_id = actor.organization_id
         AND assignment.application_id = $2
         AND assignment.user_id = $3
       RETURNING assignment.user_id`,
      [organizationId, applicationId, userId, session.userId]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "assignment_not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Developer application unassignment failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
