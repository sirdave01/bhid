import { NextRequest, NextResponse } from "next/server";

import { getDeveloperSession } from "@/lib/developer-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { parseDeveloperApplicationUpdate } from "@/lib/developer-applications";
import pool from "@/lib/db";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    return origin === getAppBaseUrl();
  } catch {
    return false;
  }
}

function invalidApplicationId(applicationId: string) {
  return !UUID_PATTERN.test(applicationId);
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/developer/applications/[applicationId]">
) {
  const { applicationId } = await context.params;

  if (invalidApplicationId(applicationId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await getDeveloperSession(request);

  if (!access.session) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { session } = access;

  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         slug,
         description,
         client_id,
         redirect_uris,
         allowed_scopes,
         status,
         client_type,
         created_at,
         updated_at
       FROM applications
       WHERE id = $1
         AND owner_user_id = $2
       LIMIT 1`,
      [applicationId, session.userId]
    );
    const application = result.rows[0];

    if (!application) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { application },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Developer application lookup failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/developer/applications/[applicationId]">
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { applicationId } = await context.params;

  if (invalidApplicationId(applicationId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await getDeveloperSession(request);

  if (!access.session) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { session } = access;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const input = parseDeveloperApplicationUpdate(body);
  const requestedStatus =
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    typeof body.status === "string"
      ? body.status.toUpperCase()
      : null;

  if (
    !input ||
    (requestedStatus !== null &&
      !["ACTIVE", "INACTIVE"].includes(requestedStatus))
  ) {
    return NextResponse.json({ error: "invalid_application" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `UPDATE applications
       SET name = $3,
           description = $4,
           redirect_uris = $5,
           allowed_scopes = $6,
           status = COALESCE($7::public.application_status, status),
           updated_at = NOW()
       WHERE id = $1
         AND owner_user_id = $2
         AND status <> 'SUSPENDED'
       RETURNING id, name, slug, description, client_id, redirect_uris,
                 allowed_scopes, status, client_type, created_at, updated_at`,
      [
        applicationId,
        session.userId,
        input.name,
        input.description,
        input.redirectUris,
        input.allowedScopes,
        requestedStatus,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { application: result.rows[0] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Developer application update failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/developer/applications/[applicationId]">
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { applicationId } = await context.params;

  if (invalidApplicationId(applicationId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await getDeveloperSession(request);

  if (!access.session) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { session } = access;

  try {
    const result = await pool.query(
      `UPDATE applications
       SET status = 'INACTIVE',
           updated_at = NOW()
       WHERE id = $1
         AND owner_user_id = $2
         AND status <> 'SUSPENDED'
       RETURNING id`,
      [applicationId, session.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Developer application deactivation failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
