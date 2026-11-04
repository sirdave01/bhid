import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { hashToken } from "@/lib/auth";
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

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const requestedRole =
    typeof body === "object" &&
    body !== null &&
    "role" in body &&
    typeof body.role === "string"
      ? body.role
      : "";

  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["admin", "developer", "member"].includes(requestedRole)
  ) {
    return NextResponse.json({ error: "invalid_invitation" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const membershipResult = await client.query<{ role_key: string }>(
      `SELECT role_key
       FROM public.organization_members
       WHERE organization_id = $1 AND user_id = $2
       FOR UPDATE`,
      [organizationId, session.userId]
    );
    const inviterRole = membershipResult.rows[0]?.role_key;
    if (!["owner", "admin"].includes(inviterRole ?? "")) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (requestedRole === "admin" && inviterRole !== "owner") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "role_not_allowed" }, { status: 403 });
    }

    const organizationResult = await client.query<{ status: string }>(
      `SELECT status
       FROM public.organizations
       WHERE id = $1
       FOR UPDATE`,
      [organizationId]
    );
    if (organizationResult.rows[0]?.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "organization_unavailable" },
        { status: 409 }
      );
    }

    const sentResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM public.organization_invitations
       WHERE invited_by_user_id = $1
         AND created_at > now() - interval '1 day'`,
      [session.userId]
    );
    if (Number(sentResult.rows[0]?.count ?? 0) >= 20) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "invitation_limit_reached" }, { status: 429 });
    }

    const existingMemberResult = await client.query(
      `SELECT 1
       FROM public.organization_members AS m
       JOIN public.users AS u ON u.id = m.user_id
       WHERE m.organization_id = $1
         AND lower(u.email) = $2
       LIMIT 1`,
      [organizationId, email]
    );
    if (existingMemberResult.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "already_a_member" }, { status: 409 });
    }

    const token = randomBytes(32).toString("base64url");
    const invitationResult = await client.query<{ expires_at: Date }>(
      `INSERT INTO public.organization_invitations (
         organization_id,
         email,
         role_key,
         token_hash,
         invited_by_user_id,
         expires_at
       )
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
       RETURNING expires_at`,
      [
        organizationId,
        email,
        requestedRole,
        hashToken(token),
        session.userId,
      ]
    );
    await client.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.invitation_created',
               jsonb_build_object('role', $2))`,
      [organizationId, requestedRole]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      {
        invitationUrl: `${getAppBaseUrl()}/organizations/invitations/${token}`,
        expiresAt: invitationResult.rows[0].expires_at,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Organization invitation rollback failed:", rollbackError);
    }

    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      return NextResponse.json(
        { error: "invitation_already_pending" },
        { status: 409 }
      );
    }

    console.error("Organization invitation creation failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
