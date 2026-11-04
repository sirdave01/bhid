import "server-only";

import type { PoolClient } from "pg";

import pool from "@/lib/db";

export async function recordOrganizationUsage(
  applicationId: string,
  userId: string
) {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO public.usage_records (
         organization_id,
         application_id,
         metric,
         period_start,
         period_end,
         quantity
       )
       SELECT
         oa.organization_id,
         oa.application_id,
         'API_CALLS',
         date_trunc('month', current_date)::date,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
         1
       FROM public.organization_applications AS oa
       WHERE oa.application_id = $1`,
      [applicationId]
    );

    await client.query(
      `INSERT INTO public.usage_records (
         organization_id,
         metric,
         period_start,
         period_end,
         subject_user_id,
         quantity
       )
       SELECT
         oa.organization_id,
         'MAU',
         date_trunc('month', current_date)::date,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
         $2,
         1
       FROM public.organization_applications AS oa
       WHERE oa.application_id = $1
       ON CONFLICT DO NOTHING`,
      [applicationId, userId]
    );

    await client.query(
      `INSERT INTO public.usage_records (
         organization_id,
         application_id,
         metric,
         period_start,
         period_end,
         subject_user_id,
         quantity
       )
       SELECT
         oa.organization_id,
         oa.application_id,
         'MAU',
         date_trunc('month', current_date)::date,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
         $2,
         1
       FROM public.organization_applications AS oa
       WHERE oa.application_id = $1
       ON CONFLICT DO NOTHING`,
      [applicationId, userId]
    );

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Organization usage rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
