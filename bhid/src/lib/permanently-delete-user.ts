import "server-only";

import type { PoolClient } from "pg";

import { deleteAvatarObject } from "@/lib/s3";
import pool from "@/lib/db";

export async function permanentlyDeleteUser(userId: string): Promise<{
  deleted: boolean;
  avatarCleanupWarning: boolean;
  blockedByOrganizations: number;
}> {
  const client: PoolClient = await pool.connect();
  let avatarKey: string | null = null;

  try {
    await client.query("BEGIN");

    const ownedOrganizationsResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM public.organization_members AS owner_members
       WHERE owner_members.user_id = $1
         AND owner_members.role_key = 'owner'
         AND NOT EXISTS (
           SELECT 1
           FROM public.organization_members AS other_owners
           WHERE other_owners.organization_id = owner_members.organization_id
             AND other_owners.role_key = 'owner'
             AND other_owners.user_id <> $1
         )`,
      [userId]
    );
    const blockedByOrganizations = Number(
      ownedOrganizationsResult.rows[0]?.count ?? 0
    );
    if (blockedByOrganizations > 0) {
      await client.query("ROLLBACK");
      return {
        deleted: false,
        avatarCleanupWarning: false,
        blockedByOrganizations,
      };
    }

    const profileResult = await client.query<{ avatar_key: string | null }>(
      `SELECT avatar_key
       FROM profiles
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    avatarKey = profileResult.rows[0]?.avatar_key ?? null;

    await client.query(
      `UPDATE verification_requests
       SET reviewed_by = NULL
       WHERE reviewed_by = $1`,
      [userId]
    );

    const deleteResult = await client.query(
      `DELETE FROM users
       WHERE id = $1
       RETURNING id`,
      [userId]
    );

    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        deleted: false,
        avatarCleanupWarning: false,
        blockedByOrganizations: 0,
      };
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Permanent account deletion rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }

  if (!avatarKey) {
    return {
      deleted: true,
      avatarCleanupWarning: false,
      blockedByOrganizations: 0,
    };
  }

  try {
    await deleteAvatarObject(avatarKey);
    return {
      deleted: true,
      avatarCleanupWarning: false,
      blockedByOrganizations: 0,
    };
  } catch (error) {
    console.error("Deleted account avatar cleanup failed:", error);
    return {
      deleted: true,
      avatarCleanupWarning: true,
      blockedByOrganizations: 0,
    };
  }
}
