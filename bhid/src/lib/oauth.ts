import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { QueryResultRow } from "pg";

import pool from "@/lib/db";
import { hashToken, verifyAccessToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";

export const OIDC_ACCESS_TOKEN_SECONDS = 10 * 60;
export const OAUTH_AUTHORIZATION_CODE_SECONDS = 5 * 60;
export const OAUTH_AUTHORIZATION_REQUEST_SECONDS = 10 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OAuthApplication = QueryResultRow & {
  id: string;
  name: string;
  client_id: string;
  client_secret_hash: string | null;
  redirect_uris: string[] | null;
  allowed_scopes: string[] | null;
  status: string;
  client_type: "PUBLIC" | "CONFIDENTIAL";
};

export type ActiveBhidSession = {
  userId: string;
  sessionId: string;
  authVersion: number;
  bhid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type OAuthTokenClaims = JwtPayload & {
  sub: string;
  sid: string;
  auth_version: number;
  scope: string;
};

export type SessionTokenClaims = JwtPayload & {
  sub: string;
  sid: string;
  auth_version: number;
};

function isSessionTokenClaims(
  claims: JwtPayload | string
): claims is SessionTokenClaims {
  return (
    typeof claims === "object" &&
    claims !== null &&
    typeof claims.sub === "string" &&
    UUID_PATTERN.test(claims.sub) &&
    typeof claims.sid === "string" &&
    UUID_PATTERN.test(claims.sid) &&
    typeof claims.auth_version === "number" &&
    Number.isInteger(claims.auth_version)
  );
}

function isOAuthTokenClaims(
  claims: JwtPayload | string
): claims is OAuthTokenClaims {
  return (
    typeof claims === "object" &&
    claims !== null &&
    typeof claims.sub === "string" &&
    UUID_PATTERN.test(claims.sub) &&
    typeof claims.sid === "string" &&
    UUID_PATTERN.test(claims.sid) &&
    typeof claims.auth_version === "number" &&
    Number.isInteger(claims.auth_version) &&
    typeof claims.scope === "string"
  );
}

export async function findOAuthApplication(
  clientId: string
): Promise<OAuthApplication | undefined> {
  if (!clientId || clientId.length > 256) {
    return undefined;
  }

  const result = await pool.query<OAuthApplication>(
    `SELECT
       id,
       name,
       client_id,
       client_secret_hash,
       redirect_uris,
       allowed_scopes,
       status,
       client_type
     FROM applications
     WHERE client_id = $1
       AND status = 'ACTIVE'
     LIMIT 1`,
    [clientId]
  );

  return result.rows[0];
}

export function hasValidClientSecret(
  suppliedSecret: string,
  storedHash: string | null
): boolean {
  if (
    !suppliedSecret ||
    suppliedSecret.length > 1024 ||
    !storedHash ||
    !/^[0-9a-f]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const suppliedHash = Buffer.from(hashToken(suppliedSecret), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  return timingSafeEqual(suppliedHash, expectedHash);
}

export function verifyOAuthToken(
  token: string,
  audience: string
): OAuthTokenClaims | null {
  let claims: JwtPayload | string;

  try {
    claims = verifyAccessToken(token, audience);
  } catch {
    return null;
  }

  if (!isOAuthTokenClaims(claims)) {
    return null;
  }

  return claims;
}

export function verifyBhidSessionToken(
  token: string
): SessionTokenClaims | null {
  let claims: JwtPayload | string;

  try {
    claims = verifyAccessToken(token, getJwtConfig().audience);
  } catch {
    return null;
  }

  return isSessionTokenClaims(claims) ? claims : null;
}

export async function findActiveBhidSession(
  claims: Pick<JwtPayload, "sub" | "sid" | "auth_version">
): Promise<ActiveBhidSession | null> {
  if (
    typeof claims.sub !== "string" ||
    !UUID_PATTERN.test(claims.sub) ||
    typeof claims.sid !== "string" ||
    !UUID_PATTERN.test(claims.sid) ||
    typeof claims.auth_version !== "number" ||
    !Number.isInteger(claims.auth_version)
  ) {
    return null;
  }

  const result = await pool.query(
    `SELECT
       u.id AS user_id,
       u.bhid,
       u.email,
       u.email_verified_at,
       u.auth_version,
       s.id AS session_id,
       p.display_name,
       p.username,
       p.avatar_url
     FROM sessions AS s
     JOIN users AS u
       ON u.id = s.user_id
     LEFT JOIN profiles AS p
       ON p.user_id = u.id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND s.absolute_expires_at > NOW()
       AND u.status = 'ACTIVE'
       AND u.auth_version = $3
     LIMIT 1`,
    [claims.sid, claims.sub, claims.auth_version]
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  return {
    userId: user.user_id,
    sessionId: user.session_id,
    authVersion: user.auth_version,
    bhid: user.bhid,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    displayName: user.display_name,
    username: user.username,
    avatarUrl: user.avatar_url,
  };
}

export function signOAuthAccessToken(
  session: ActiveBhidSession,
  clientId: string,
  scopes: string[]
): string {
  const { issuer, keyId, privateKey } = getJwtConfig();

  return jwt.sign(
    {
      sid: session.sessionId,
      auth_version: session.authVersion,
      scope: scopes.join(" "),
    },
    privateKey,
    {
      algorithm: "RS256",
      subject: session.userId,
      issuer,
      audience: clientId,
      expiresIn: OIDC_ACCESS_TOKEN_SECONDS,
      keyid: keyId,
    }
  );
}

export function signOidcIdToken(
  session: ActiveBhidSession,
  clientId: string,
  nonce: string,
  scopes: string[]
): string {
  const { issuer, keyId, privateKey } = getJwtConfig();
  const claims: Record<string, string | boolean | number> = {
    sid: session.sessionId,
    auth_version: session.authVersion,
    nonce,
  };

  if (scopes.includes("email")) {
    claims.email = session.email;
    claims.email_verified = session.emailVerified;
  }

  if (scopes.includes("profile")) {
    if (session.displayName) {
      claims.name = session.displayName;
    }
    if (session.username) {
      claims.preferred_username = session.username;
    }
    if (session.avatarUrl) {
      claims.picture = session.avatarUrl;
    }
  }

  if (scopes.includes("bhid")) {
    claims.bhid = session.bhid;
  }

  return jwt.sign(claims, privateKey, {
    algorithm: "RS256",
    subject: session.userId,
    issuer,
    audience: clientId,
    expiresIn: OIDC_ACCESS_TOKEN_SECONDS,
    keyid: keyId,
  });
}

export function readOAuthTokenAudience(token: string): string | null {
  const decoded = jwt.decode(token);

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.aud !== "string"
  ) {
    return null;
  }

  return decoded.aud;
}

export function generateAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

export function oidcEndpoint(path: string): string {
  const issuer = getJwtConfig().issuer.replace(/\/+$/, "");
  return `${issuer}${path}`;
}
