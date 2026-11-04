import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import pool from "@/lib/db";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_ROLES = new Set(["owner", "admin", "developer", "member"]);

function isSameOrigin(request: NextRequest) {
  try {
    return request.headers.get("origin") === getAppBaseUrl();
  } catch {
    return false;
  }
}

async function getMembershipAccess(
  organizationId: string,
  actorId: string,
  targetId: string
) {
  const result = await pool.query<{
    actor_role: string;
    target_role: string;
    organization_status: string;
  }>(
    `SELECT
       actor.role_key AS actor_role,
       target.role_key AS target_role,
       o.status AS organization_status
     FROM public.organization_members AS actor
     JOIN public.organizations AS o ON o.id = actor.organization_id
     JOIN public.organization_members AS target
       ON target.organization_id = actor.organization_id
     WHERE actor.organization_id = $1
       AND actor.user_id = $2
       AND target.user_id = $3
     LIMIT 1`,
    [organizationId, actorId, targetId]
  );
  return result.rows[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; userId: string }> }
) {
  const { organizationId, userId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(userId) ||
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
  const role =
    typeof body === "object" &&
    body !== null &&
    "role" in body &&
    typeof body.role === "string"
      ? body.role
      : "";
  if (!EDITABLE_ROLES.has(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  try {
    if (role === "owner") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const orgResult = await client.query<{ status: string }>(
          `SELECT status
           FROM public.organizations
           WHERE id = $1
           FOR UPDATE`,
          [organizationId]
        );
        const rolesResult = await client.query<{
          actor_role: string;
          target_role: string;
        }>(
          `SELECT actor.role_key AS actor_role, target.role_key AS target_role
           FROM public.organization_members AS actor
           JOIN public.organization_members AS target
             ON target.organization_id = actor.organization_id
           WHERE actor.organization_id = $1
             AND actor.user_id = $2
             AND target.user_id = $3
           FOR UPDATE OF actor, target`,
          [organizationId, session.userId, userId]
        );
        const roles = rolesResult.rows[0];
        if (
          orgResult.rows[0]?.status !== "ACTIVE" ||
          roles?.actor_role !== "owner" ||
          roles.target_role !== "admin"
        ) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "ownership_transfer_not_allowed" },
            { status: 403 }
          );
        }

        await client.query(
          `UPDATE public.organization_members
           SET role_key = 'owner'
           WHERE organization_id = $1 AND user_id = $2`,
          [organizationId, userId]
        );
        await client.query(
          `UPDATE public.organization_members
           SET role_key = 'admin'
           WHERE organization_id = $1 AND user_id = $2`,
          [organizationId, session.userId]
        );
        await client.query(
          `INSERT INTO public.billing_events (organization_id, event_type, payload)
           VALUES ($1, 'organization.ownership_transferred',
                   jsonb_build_object('previous_owner_id', $2, 'new_owner_id', $3))`,
          [organizationId, session.userId, userId]
        );
        await client.query("COMMIT");
        return NextResponse.json({ success: true });
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Ownership transfer rollback failed:", rollbackError);
        }
        throw error;
      } finally {
        client.release();
      }
    }

    const access = await getMembershipAccess(
      organizationId,
      session.userId,
      userId
    );
    if (
      !access ||
      !["owner", "admin"].includes(access.actor_role) ||
      access.organization_status !== "ACTIVE"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (
      access.target_role === "owner" ||
      (access.actor_role !== "owner" &&
        (access.target_role === "admin" || role === "admin"))
    ) {
      return NextResponse.json({ error: "role_not_allowed" }, { status: 403 });
    }

    const result = await pool.query(
      `UPDATE public.organization_members AS target
       SET role_key = $3
       FROM public.organization_members AS actor
       JOIN public.organizations AS o
         ON o.id = actor.organization_id AND o.status = 'ACTIVE'
       WHERE actor.organization_id = $1
         AND actor.user_id = $4
         AND actor.role_key IN ('owner', 'admin')
         AND target.organization_id = actor.organization_id
         AND target.user_id = $2
         AND target.role_key <> 'owner'
         AND $3 <> 'owner'
         AND (
           actor.role_key = 'owner'
           OR target.role_key NOT IN ('owner', 'admin')
         )`,
      [organizationId, userId, role, session.userId]
    );
    if (result.rowCount !== 1) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.member_role_changed',
               jsonb_build_object('target_user_id', $2, 'role', $3))`,
      [organizationId, userId, role]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organization member role update failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string; userId: string }> }
) {
  const { organizationId, userId } = await context.params;
  if (
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(userId) ||
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

  try {
    const access = await getMembershipAccess(
      organizationId,
      session.userId,
      userId
    );
    if (
      !access ||
      !["owner", "admin"].includes(access.actor_role) ||
      access.organization_status !== "ACTIVE"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (
      access.target_role === "owner" ||
      (access.actor_role !== "owner" && access.target_role === "admin")
    ) {
      return NextResponse.json({ error: "role_not_allowed" }, { status: 403 });
    }

    const result = await pool.query(
      `DELETE FROM public.organization_members AS target
       USING public.organization_members AS actor
       JOIN public.organizations AS o
         ON o.id = actor.organization_id AND o.status = 'ACTIVE'
       WHERE actor.organization_id = $1
         AND actor.user_id = $3
         AND actor.role_key IN ('owner', 'admin')
         AND target.organization_id = actor.organization_id
         AND target.user_id = $2
         AND target.role_key <> 'owner'
         AND (
           actor.role_key = 'owner'
           OR target.role_key NOT IN ('owner', 'admin')
         )
       RETURNING target.id`,
      [organizationId, userId, session.userId]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.member_removed',
               jsonb_build_object('target_user_id', $2))`,
      [organizationId, userId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organization member removal failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
