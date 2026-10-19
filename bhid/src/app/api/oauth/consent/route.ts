import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import { hashToken } from "@/lib/auth";
import {
  findActiveBhidSession,
  generateAuthorizationCode,
  OAUTH_AUTHORIZATION_CODE_SECONDS,
  verifyBhidSessionToken,
} from "@/lib/oauth";
import { getJwtConfig } from "@/lib/jwt-keys";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    { error: "authentication_required" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

function invalidRequest() {
  return NextResponse.json(
    { error: "invalid_request" },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

async function getCurrentSession(request: NextRequest) {
  const token = request.cookies.get("bhid_access")?.value;
  const claims = token ? verifyBhidSessionToken(token) : null;
  return claims ? findActiveBhidSession(claims) : null;
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    return origin === new URL(getJwtConfig().issuer).origin;
  } catch {
    return false;
  }
}

function callbackUrl(redirectUri: string, state: string, code?: string) {
  const callback = new URL(redirectUri);

  if (code) {
    callback.searchParams.set("code", code);
  } else {
    callback.searchParams.set("error", "access_denied");
  }

  callback.searchParams.set("state", state);
  return callback.toString();
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("request_id");

  if (!requestId || !UUID_PATTERN.test(requestId)) {
    return invalidRequest();
  }

  try {
    const session = await getCurrentSession(request);

    if (!session) {
      return unauthorized();
    }

    const result = await pool.query(
      `SELECT
         ar.id,
         app.name AS application_name,
         ar.scopes
       FROM oauth_authorization_requests AS ar
       JOIN applications AS app
         ON app.id = ar.application_id
       WHERE ar.id = $1
         AND ar.user_id = $2
         AND ar.session_id = $3
         AND ar.auth_version = $4
         AND ar.consumed_at IS NULL
         AND ar.expires_at > NOW()
         AND app.status = 'ACTIVE'
       LIMIT 1`,
      [
        requestId,
        session.userId,
        session.sessionId,
        session.authVersion,
      ]
    );
    const pending = result.rows[0];

    if (!pending) {
      return invalidRequest();
    }

    return NextResponse.json(
      {
        applicationName: pending.application_name,
        scopes: pending.scopes,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("OAuth consent details lookup failed:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  // The JSON consent action rejects cross-origin form posts before touching state.
  if (!isSameOrigin(request)) {
    return invalidRequest();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("requestId" in body) ||
    typeof body.requestId !== "string" ||
    !UUID_PATTERN.test(body.requestId) ||
    !("decision" in body) ||
    (body.decision !== "approve" && body.decision !== "deny")
  ) {
    return invalidRequest();
  }

  try {
    const session = await getCurrentSession(request);

    if (!session) {
      return unauthorized();
    }

    const client: PoolClient = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      const lockedSessionResult = await client.query(
        `SELECT s.id
         FROM sessions AS s
         JOIN users AS u
           ON u.id = s.user_id
         WHERE s.id = $1
           AND s.user_id = $2
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()
           AND s.absolute_expires_at > NOW()
           AND u.status = 'ACTIVE'
           AND u.auth_version = $3
         FOR UPDATE OF s, u`,
        [session.sessionId, session.userId, session.authVersion]
      );

      if (!lockedSessionResult.rows[0]) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return unauthorized();
      }

      const requestResult = await client.query(
        `SELECT
           ar.application_id,
           ar.redirect_uri,
           ar.scopes,
           ar.state,
           ar.nonce,
           ar.code_challenge,
           app.redirect_uris
         FROM oauth_authorization_requests AS ar
         JOIN applications AS app
           ON app.id = ar.application_id
         WHERE ar.id = $1
           AND ar.user_id = $2
           AND ar.session_id = $3
           AND ar.auth_version = $4
           AND ar.consumed_at IS NULL
           AND ar.expires_at > NOW()
           AND app.status = 'ACTIVE'
           AND app.redirect_uris @> ARRAY[ar.redirect_uri]
         FOR UPDATE OF ar`,
        [
          body.requestId,
          session.userId,
          session.sessionId,
          session.authVersion,
        ]
      );
      const authorizationRequest = requestResult.rows[0];

      // The pending request is single-use and bound to the same authenticated session.
      if (!authorizationRequest) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return invalidRequest();
      }

      await client.query(
        `UPDATE oauth_authorization_requests
         SET consumed_at = NOW()
         WHERE id = $1`,
        [body.requestId]
      );

      if (body.decision === "deny") {
        await client.query("COMMIT");
        transactionOpen = false;

        return NextResponse.json(
          {
            redirectUrl: callbackUrl(
              authorizationRequest.redirect_uri,
              authorizationRequest.state
            ),
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      await client.query(
        `INSERT INTO oauth_consents (
           application_id,
           user_id,
           scopes
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (application_id, user_id)
         DO UPDATE SET
           scopes = ARRAY(
             SELECT DISTINCT scope
             FROM unnest(
               oauth_consents.scopes || EXCLUDED.scopes
             ) AS granted(scope)
           ),
           granted_at = NOW(),
           revoked_at = NULL`,
        [
          authorizationRequest.application_id,
          session.userId,
          authorizationRequest.scopes,
        ]
      );

      const authorizationCode = generateAuthorizationCode();
      await client.query(
        `INSERT INTO oauth_authorization_codes (
           code_hash,
           application_id,
           user_id,
           session_id,
           auth_version,
           redirect_uri,
           scopes,
           code_challenge,
           nonce,
           expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 NOW() + ($10 * INTERVAL '1 second'))`,
        [
          hashToken(authorizationCode),
          authorizationRequest.application_id,
          session.userId,
          session.sessionId,
          session.authVersion,
          authorizationRequest.redirect_uri,
          authorizationRequest.scopes,
          authorizationRequest.code_challenge,
          authorizationRequest.nonce,
          OAUTH_AUTHORIZATION_CODE_SECONDS,
        ]
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        {
          redirectUrl: callbackUrl(
            authorizationRequest.redirect_uri,
            authorizationRequest.state,
            authorizationCode
          ),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "OAuth consent transaction rollback failed:",
            rollbackError
          );
        }
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("OAuth consent decision failed:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
