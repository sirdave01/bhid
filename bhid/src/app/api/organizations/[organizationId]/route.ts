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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
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
  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof body.name === "string"
      ? body.name.trim()
      : "";
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    return NextResponse.json({ error: "invalid_organization_name" }, { status: 400 });
  }

  try {
    const result = await pool.query<{ id: string }>(
      `UPDATE public.organizations AS o
       SET name = $3, updated_at = now()
       WHERE o.id = $1
         AND o.status = 'ACTIVE'
         AND EXISTS (
           SELECT 1
           FROM public.organization_members AS m
           WHERE m.organization_id = o.id
             AND m.user_id = $2
             AND m.role_key IN ('owner', 'admin')
         )
       RETURNING o.id`,
      [organizationId, session.userId, name]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.profile_updated',
               jsonb_build_object('name', $2))`,
      [organizationId, name]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organization profile update failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
