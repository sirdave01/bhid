import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import pool from "@/lib/db";

function isSameOrigin(request: NextRequest) {
  try {
    return request.headers.get("origin") === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
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

  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof body.name === "string"
      ? body.name.trim()
      : "";
  const slug =
    typeof body === "object" &&
    body !== null &&
    "slug" in body &&
    typeof body.slug === "string"
      ? body.slug.trim().toLowerCase()
      : "";

  if (
    !name ||
    name.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length > 80
  ) {
    return NextResponse.json(
      { error: "invalid_organization" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const organizationResult = await client.query<{ id: string }>(
      `INSERT INTO public.organizations (name, slug, created_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, slug, session.userId]
    );
    const organizationId = organizationResult.rows[0].id;

    await client.query(
      `INSERT INTO public.organization_members (
         organization_id, user_id, role_key, added_by_user_id
       )
       VALUES ($1, $2, 'owner', $2)`,
      [organizationId, session.userId]
    );
    await client.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.created', jsonb_build_object('created_by', $2))`,
      [organizationId, session.userId]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { organization: { id: organizationId, name, slug } },
      { status: 201 }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Organization creation rollback failed:", rollbackError);
    }

    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      return NextResponse.json({ error: "slug_already_exists" }, { status: 409 });
    }

    console.error("Organization creation failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
