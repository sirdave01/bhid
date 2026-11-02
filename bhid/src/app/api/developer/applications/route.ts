import { NextRequest, NextResponse } from "next/server";

import {
  createOAuthClientCredentials,
  parseDeveloperApplicationInput,
} from "@/lib/developer-applications";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { getDeveloperSession } from "@/lib/developer-session";
import pool from "@/lib/db";

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    return origin === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
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
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [session.userId]
    );

    return NextResponse.json(
      { applications: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Developer application list failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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

  const input = parseDeveloperApplicationInput(body);

  if (!input) {
    return NextResponse.json({ error: "invalid_application" }, { status: 400 });
  }

  try {
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM applications
       WHERE owner_user_id = $1`,
      [session.userId]
    );

    if (Number(countResult.rows[0]?.count ?? 0) >= 20) {
      return NextResponse.json(
        { error: "application_limit_reached" },
        { status: 429 }
      );
    }

    const credentials = createOAuthClientCredentials(input.clientType);
    const result = await pool.query(
      `INSERT INTO applications (
         owner_user_id,
         name,
         slug,
         description,
         client_id,
         client_secret_hash,
         redirect_uris,
         allowed_scopes,
         client_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, slug, description, client_id, redirect_uris,
                 allowed_scopes, status, client_type, created_at, updated_at`,
      [
        session.userId,
        input.name,
        input.slug,
        input.description,
        credentials.clientId,
        credentials.clientSecretHash,
        input.redirectUris,
        input.allowedScopes,
        input.clientType,
      ]
    );

    return NextResponse.json(
      {
        application: result.rows[0],
        clientSecret: credentials.clientSecret,
        secretShownOnce: credentials.clientSecret !== null,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const databaseError = error as { code?: string };

    if (databaseError.code === "23505") {
      return NextResponse.json({ error: "slug_already_exists" }, { status: 409 });
    }

    console.error("Developer application creation failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
