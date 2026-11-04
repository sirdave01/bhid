import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";
import { getAvatarPublicUrl } from "@/lib/s3";
import { hashToken } from "@/lib/auth";
import {
  findOAuthApplication,
  getRegisteredPublicClientOrigin,
  hasValidClientSecret,
  OAUTH_WALLETS_SELECT,
  OIDC_ACCESS_TOKEN_SECONDS,
  type OAuthSessionRow,
  signOAuthAccessToken,
  signOidcIdToken,
} from "@/lib/oauth";

function tokenError(
  error: string,
  status = 400,
  corsOrigin?: string | null
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
  }

  return NextResponse.json(
    { error },
    { status, headers }
  );
}

function getFormParameter(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function decodeBasicValue(value: string) {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

function readBasicCredentials(header: string | null) {
  if (!header) {
    return null;
  }

  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header);

  if (!match) {
    return null;
  }

  try {
    const credentials = Buffer.from(match[1], "base64").toString("utf8");
    const separator = credentials.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      clientId: decodeBasicValue(credentials.slice(0, separator)),
      clientSecret: decodeBasicValue(credentials.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    return false;
  }

  const calculated = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const calculatedBytes = Buffer.from(calculated);
  const challengeBytes = Buffer.from(challenge);

  return (
    calculatedBytes.length === challengeBytes.length &&
    timingSafeEqual(calculatedBytes, challengeBytes)
  );
}

function buildTokenResponse(
  accessToken: string,
  idToken: string,
  scopes: string[],
  corsOrigin: string | null
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
  }

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: OIDC_ACCESS_TOKEN_SECONDS,
      scope: scopes.join(" "),
      id_token: idToken,
    },
    { headers }
  );
}

export async function POST(request: NextRequest) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  ) {
    return tokenError("invalid_request");
  }

  let form: URLSearchParams;

  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return tokenError("invalid_request");
  }

  const grantType = getFormParameter(form, "grant_type");
  const code = getFormParameter(form, "code");
  const redirectUri = getFormParameter(form, "redirect_uri");
  const verifier = getFormParameter(form, "code_verifier");
  const bodyClientId = getFormParameter(form, "client_id");
  const authorizationHeader = request.headers.get("authorization");
  const basicCredentials = readBasicCredentials(
    authorizationHeader
  );

  if (
    (authorizationHeader !== null && !basicCredentials) ||
    grantType !== "authorization_code" ||
    !code ||
    !/^[A-Za-z0-9_-]{43}$/.test(code) ||
    !redirectUri ||
    !verifier ||
    form.has("client_secret") ||
    (basicCredentials && form.has("client_id"))
  ) {
    return tokenError("invalid_request");
  }

  const clientId = basicCredentials?.clientId ?? bodyClientId;

  if (!clientId) {
    return tokenError("invalid_client", 401);
  }

  let application;

  try {
    application = await findOAuthApplication(clientId);
  } catch (error) {
    console.error("OAuth client lookup failed:", error);
    return tokenError("server_error", 500);
  }

  if (!application) {
    return tokenError("invalid_client", 401);
  }

  const requestOrigin = request.headers.get("origin");
  const corsOrigin = requestOrigin
    ? getRegisteredPublicClientOrigin(
        requestOrigin,
        application.redirect_uris
      )
    : null;

  if (
    requestOrigin &&
    (application.client_type !== "PUBLIC" || !corsOrigin)
  ) {
    return tokenError("invalid_request");
  }

  if (application.client_type === "CONFIDENTIAL") {
    if (
      !basicCredentials ||
      !hasValidClientSecret(
        basicCredentials.clientSecret,
        application.client_secret_hash
      )
    ) {
      const headers = new Headers({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "WWW-Authenticate": 'Basic realm="BHID OAuth"',
      });

      return NextResponse.json(
        { error: "invalid_client" },
        { status: 401, headers }
      );
    }
  } else if (basicCredentials || application.client_secret_hash) {
    return tokenError("invalid_client", 401);
  }

  const codeHash = hashToken(code);
  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    const codeResult = await client.query(
      `SELECT
         ac.id,
         ac.user_id,
         ac.session_id,
         ac.auth_version,
         ac.redirect_uri,
         ac.scopes,
         ac.code_challenge,
         ac.nonce,
         app.allowed_scopes
       FROM oauth_authorization_codes AS ac
       JOIN applications AS app
         ON app.id = ac.application_id
       WHERE ac.code_hash = $1
         AND ac.application_id = $2
         AND ac.redirect_uri = $3
         AND ac.used_at IS NULL
         AND ac.expires_at > NOW()
         AND app.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1
           FROM public.organization_applications AS oa
           JOIN public.organizations AS o ON o.id = oa.organization_id
           WHERE oa.application_id = app.id
             AND o.status = 'SUSPENDED'
         )
         AND app.redirect_uris @> ARRAY[ac.redirect_uri]
       FOR UPDATE OF ac, app`,
      [codeHash, application.id, redirectUri]
    );
    const authorizationCode = codeResult.rows[0];

    // Locking the stored code makes redemption one-time even under concurrent requests.
    const supportedScopes = new Set([
      "openid",
      "email",
      "profile",
      "bhid",
      "verification",
      "wallet",
      "membership",
    ]);
    const scopesAllowedNow =
      authorizationCode &&
      authorizationCode.scopes.every(
        (scope: string) =>
          supportedScopes.has(scope) &&
          (scope === "openid" ||
            (authorizationCode.allowed_scopes ?? []).includes(scope))
      );

    if (
      !authorizationCode ||
      !scopesAllowedNow ||
      !verifyPkce(verifier, authorizationCode.code_challenge)
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return tokenError("invalid_grant", 400, corsOrigin);
    }

    const sessionResult = await client.query<OAuthSessionRow>(
      `SELECT
         u.id AS user_id,
         u.bhid,
         u.email,
         u.email_verified_at,
         u.auth_version,
         u.verification_level,
         s.id AS session_id,
         p.display_name,
         p.username,
         p.bio,
         p.date_of_birth,
         p.avatar_key,
         p.avatar_url,
         p.wallet_address,
         p.wallet_verified_at,
         ${OAUTH_WALLETS_SELECT},
         CASE
           WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW()
             THEN 'BASIC'
           ELSE m.tier::text
         END AS membership_tier,
         CASE
           WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW()
             THEN NULL
           ELSE m.expires_at
         END AS membership_expires_at
       FROM sessions AS s
       JOIN users AS u
         ON u.id = s.user_id
       LEFT JOIN profiles AS p
         ON p.user_id = u.id
       LEFT JOIN user_memberships AS m
         ON m.user_id = u.id
       WHERE s.id = $1
         AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         AND u.status = 'ACTIVE'
         AND u.auth_version = $3
       FOR UPDATE OF s, u`,
      [
        authorizationCode.session_id,
        authorizationCode.user_id,
        authorizationCode.auth_version,
      ]
    );
    const user = sessionResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return tokenError("invalid_grant", 400, corsOrigin);
    }

    await client.query(
      `UPDATE oauth_authorization_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [authorizationCode.id]
    );

    await client.query(
      `INSERT INTO public.application_authentication_logs (
         organization_id, application_id, user_id, event_type
       )
       SELECT organization_id, application_id, $2, 'LOGIN_SUCCESS'
       FROM public.organization_applications
       WHERE application_id = $1`,
      [application.id, authorizationCode.user_id]
    );

    const activeSession = {
      userId: user.user_id,
      sessionId: user.session_id,
      authVersion: user.auth_version,
      bhid: user.bhid,
      email: user.email,
      emailVerified: user.email_verified_at !== null,
      displayName: user.display_name,
      username: user.username,
      bio: user.bio,
      dateOfBirth:
        user.date_of_birth instanceof Date
          ? user.date_of_birth.toISOString().slice(0, 10)
          : user.date_of_birth,
      avatarUrl: getAvatarPublicUrl(user.avatar_key, user.avatar_url),
      verificationLevel: user.verification_level,
      walletAddress: user.wallet_address,
      walletVerifiedAt: user.wallet_verified_at,
      wallets: user.wallets,
      membershipTier: user.membership_tier ?? "BASIC",
      membershipExpiresAt: user.membership_expires_at,
    };
    const scopes: string[] = authorizationCode.scopes;
    const accessToken = signOAuthAccessToken(
      activeSession,
      clientId,
      scopes
    );
    const idToken = signOidcIdToken(
      activeSession,
      clientId,
      authorizationCode.nonce,
      scopes
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return buildTokenResponse(accessToken, idToken, scopes, corsOrigin);
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "OAuth token transaction rollback failed:",
          rollbackError
        );
      }
    }

    console.error("OAuth authorization-code exchange failed:", error);
    return tokenError("server_error", 500, corsOrigin);
  } finally {
    client?.release();
  }
}
