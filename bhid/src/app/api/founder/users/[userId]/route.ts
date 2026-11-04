import { NextRequest, NextResponse } from "next/server";

import { isFounderAccount } from "@/lib/founder-access";
import { getAppBaseUrl } from "@/lib/app-base-url";
import pool from "@/lib/db";
import { permanentlyDeleteUser } from "@/lib/permanently-delete-user";
import { getAuthenticatedSession } from "@/lib/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actions = {
  suspend: {
    nextStatus: "SUSPENDED",
    allowedStatuses: ["ACTIVE"],
    revokedReason: "account_suspended_by_founder",
  },
  unsuspend: {
    nextStatus: "ACTIVE",
    allowedStatuses: ["SUSPENDED"],
    revokedReason: "account_unsuspended_by_founder",
  },
  delete: {
    nextStatus: "DELETED",
    allowedStatuses: ["ACTIVE", "SUSPENDED"],
    revokedReason: "account_deleted_by_founder",
  },
  restore: {
    nextStatus: "ACTIVE",
    allowedStatuses: ["DELETED"],
    revokedReason: "account_restored_by_founder",
  },
} as const;

type UserAction = keyof typeof actions;

function isUserAction(value: unknown): value is UserAction {
  return typeof value === "string" && value in actions;
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/founder/users/[userId]">
) {
  const { userId } = await context.params;

  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID" },
      { status: 400 }
    );
  }

  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== getAppBaseUrl()) {
      return NextResponse.json(
        { success: false, message: "Invalid request origin" },
        { status: 400 }
      );
    }

    const session = await getAuthenticatedSession(
      request.cookies.get("bhid_access")?.value
    );

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    if (!isFounderAccount(session)) {
      return NextResponse.json(
        { success: false, message: "Not found" },
        { status: 404 }
      );
    }

    if (userId === session.userId) {
      return NextResponse.json(
        { success: false, message: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const result = await permanentlyDeleteUser(userId);

    if (!result.deleted) {
      if (result.blockedByOrganizations > 0) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Transfer ownership of this user's organization(s) before deleting the account.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      avatarCleanupWarning: result.avatarCleanupWarning,
    });
  } catch (error) {
    console.error("Founder permanent account deletion failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to permanently delete this account" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/founder/users/[userId]">
) {
  const { userId } = await context.params;

  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json(
      { success: false, message: "Invalid user ID" },
      { status: 400 }
    );
  }

  try {
    const session = await getAuthenticatedSession(
      request.cookies.get("bhid_access")?.value
    );

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    if (!isFounderAccount(session)) {
      return NextResponse.json(
        { success: false, message: "Not found" },
        { status: 404 }
      );
    }

    if (userId === session.userId) {
      return NextResponse.json(
        { success: false, message: "You cannot change your own account" },
        { status: 400 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Request body is not valid JSON" },
        { status: 400 }
      );
    }

    const actionValue =
      typeof body === "object" && body !== null && "action" in body
        ? body.action
        : undefined;

    if (!isUserAction(actionValue)) {
      return NextResponse.json(
        { success: false, message: "Invalid account action" },
        { status: 400 }
      );
    }

    const action = actions[actionValue];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<{ status: string }>(
        `UPDATE users
         SET status = $2,
             auth_version = auth_version + 1,
             updated_at = NOW()
         WHERE id = $1
           AND status = ANY($3::public.user_status[])
         RETURNING status`,
        [userId, action.nextStatus, action.allowedStatuses]
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            success: false,
            message: "Account not found or its status has already changed",
          },
          { status: 409 }
        );
      }

      await client.query(
        `UPDATE sessions
         SET revoked_at = NOW(),
             revoked_reason = $2,
             last_used_at = NOW()
         WHERE user_id = $1
           AND revoked_at IS NULL`,
        [userId, action.revokedReason]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        data: { status: result.rows[0].status },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Founder account action rollback failed:", rollbackError);
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Founder account action failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update this account right now" },
      { status: 500 }
    );
  }
}
