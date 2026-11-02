import { NextRequest, NextResponse } from "next/server";

import { createOAuthClientCredentials } from "@/lib/developer-applications";
import { getDeveloperSession } from "@/lib/developer-session";
import { getAppBaseUrl } from "@/lib/app-base-url";
import pool from "@/lib/db";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/developer/applications/[applicationId]/secret">
) {
  const origin = request.headers.get("origin");

  try {
    if (!origin || origin !== getAppBaseUrl()) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const { applicationId } = await context.params;

  if (!UUID_PATTERN.test(applicationId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await getDeveloperSession(request);

  if (!access.session) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { session } = access;

  const credentials = createOAuthClientCredentials("CONFIDENTIAL");

  try {
    const result = await pool.query(
      `UPDATE applications
       SET client_secret_hash = $3,
           updated_at = NOW()
       WHERE id = $1
         AND owner_user_id = $2
         AND client_type = 'CONFIDENTIAL'
         AND status <> 'SUSPENDED'
       RETURNING id, client_id`,
      [applicationId, session.userId, credentials.clientSecretHash]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "not_found_or_not_confidential" }, { status: 404 });
    }

    return NextResponse.json(
      {
        clientId: result.rows[0].client_id,
        clientSecret: credentials.clientSecret,
        secretShownOnce: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Developer client-secret rotation failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
