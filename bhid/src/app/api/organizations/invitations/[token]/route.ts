import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,50}$/;

function isSameOrigin(request: NextRequest) {
  try {
    return request.headers.get("origin") === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!TOKEN_PATTERN.test(token) || !isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_invitation" }, { status: 400 });
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invitationResult = await client.query<{
      id: string;
      organization_id: string;
      email: string;
      role_key: string;
      invited_by_user_id: string | null;
    }>(
      `SELECT i.id, i.organization_id, i.email, i.role_key, i.invited_by_user_id
       FROM public.organization_invitations AS i
       JOIN public.organizations AS o ON o.id = i.organization_id
       WHERE i.token_hash = $1
         AND i.status = 'PENDING'
         AND i.expires_at > now()
         AND o.status = 'ACTIVE'
       FOR UPDATE OF i`,
      [hashToken(token)]
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "invitation_expired_or_invalid" },
        { status: 404 }
      );
    }
    if (invitation.email.toLowerCase() !== session.email.toLowerCase()) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "invitation_email_mismatch" },
        { status: 403 }
      );
    }

    await client.query(
      `INSERT INTO public.organization_members (
         organization_id, user_id, role_key, added_by_user_id
       )
       VALUES ($1, $2, $3, $4)`,
      [
        invitation.organization_id,
        session.userId,
        invitation.role_key,
        invitation.invited_by_user_id,
      ]
    );
    await client.query(
      `UPDATE public.organization_invitations
       SET status = 'ACCEPTED',
           accepted_by_user_id = $2,
           updated_at = now()
       WHERE id = $1`,
      [invitation.id, session.userId]
    );
    await client.query(
      `INSERT INTO public.billing_events (organization_id, event_type, payload)
       VALUES ($1, 'organization.invitation_accepted',
               jsonb_build_object('role', $2))`,
      [invitation.organization_id, invitation.role_key]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Organization invitation acceptance rollback failed:", rollbackError);
    }

    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      return NextResponse.json({ error: "already_a_member" }, { status: 409 });
    }

    console.error("Organization invitation acceptance failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
