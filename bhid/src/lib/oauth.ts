import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { QueryResultRow } from "pg";

import pool from "@/lib/db";
import { hashToken, verifyAccessToken } from "@/lib/auth";
import { getJwtConfig } from "@/lib/jwt-keys";
import { getAvatarPublicUrl } from "@/lib/s3";
import { getVerificationTier } from "@/lib/verification";

export { getVerificationTier };

export const OIDC_ACCESS_TOKEN_SECONDS = 10 * 60;
export const OAUTH_AUTHORIZATION_CODE_SECONDS = 5 * 60;
export const OAUTH_AUTHORIZATION_REQUEST_SECONDS = 10 * 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OAuthWallet = {
  network: string;
  address: string;
  label: string | null;
  is_primary: boolean;
  connection_type: string;
  verified: boolean;
  verified_at: string | null;
};

export function getPrimaryOAuthWallet(
  wallets: OAuthWallet[]
): OAuthWallet | null {
  return wallets.find((wallet) => wallet.is_primary) ?? wallets[0] ?? null;
}

export type OAuthSessionRow = QueryResultRow & {
  user_id: string;
  session_id: string;
  auth_version: number;
  bhid: string;
  email: string;
  email_verified_at: Date | null;
  verification_level: number;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  date_of_birth: string | Date | null;
  avatar_key: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  wallet_verified_at: Date | null;
  wallets: OAuthWallet[];
  membership_tier: string | null;
  membership_expires_at: Date | null;
};

export const OAUTH_WALLETS_SELECT = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'network', wallet_data.network,
          'address', wallet_data.address,
          'label', wallet_data.label,
          'is_primary', wallet_data.is_primary,
          'connection_type', wallet_data.connection_type,
          'verified', wallet_data.verified_at IS NOT NULL,
          'verified_at', wallet_data.verified_at
        )
        ORDER BY wallet_data.is_primary DESC, wallet_data.created_at ASC NULLS LAST
      )
      FROM (
        SELECT
          w.network,
          w.address,
          w.label,
          (w.is_primary OR COALESCE(w.address = p.wallet_address, FALSE)) AS is_primary,
          w.connection_type::text AS connection_type,
          CASE
            WHEN w.address = p.wallet_address
              THEN COALESCE(w.verified_at, p.wallet_verified_at)
            ELSE w.verified_at
          END AS verified_at,
          w.created_at
        FROM wallets AS w
        WHERE w.user_id = u.id

        UNION ALL

        SELECT
          'SOLANA',
          p.wallet_address,
          NULL::varchar,
          TRUE,
          'MANUAL',
          p.wallet_verified_at,
          p.wallet_verified_at
        WHERE p.wallet_address IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM wallets AS w
            WHERE w.user_id = u.id
              AND w.address = p.wallet_address
          )
      ) AS wallet_data
    ),
    '[]'::json
  ) AS wallets`;

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

export function getRegisteredPublicClientOrigin(
  origin: string | null,
  redirects: string[] | null
): string | null {
  if (!origin || !redirects) {
    return null;
  }

  let requestedOrigin: URL;

  try {
    requestedOrigin = new URL(origin);
  } catch {
    return null;
  }

  const isLoopback =
    requestedOrigin.hostname === "localhost" ||
    requestedOrigin.hostname === "127.0.0.1" ||
    requestedOrigin.hostname === "[::1]";

  if (
    requestedOrigin.origin !== origin ||
    requestedOrigin.username ||
    requestedOrigin.password ||
    (requestedOrigin.protocol !== "https:" &&
      !(requestedOrigin.protocol === "http:" && isLoopback))
  ) {
    return null;
  }

  const redirectOrigins = new Set<string>();

  for (const redirect of redirects) {
    try {
      const redirectUrl = new URL(redirect);

      if (
        redirectUrl.protocol === "https:" ||
        (redirectUrl.protocol === "http:" &&
          (redirectUrl.hostname === "localhost" ||
            redirectUrl.hostname === "127.0.0.1" ||
            redirectUrl.hostname === "[::1]"))
      ) {
        redirectOrigins.add(redirectUrl.origin);
      }
    } catch {
      continue;
    }
  }

  return redirectOrigins.has(origin) ? origin : null;
}

export type ActiveBhidSession = {
  userId: string;
  sessionId: string;
  authVersion: number;
  bhid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  verificationLevel: number;
  walletAddress: string | null;
  walletVerifiedAt: Date | null;
  wallets: OAuthWallet[];
  membershipTier: string;
  membershipExpiresAt: Date | null;
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
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_applications AS oa
         JOIN public.organizations AS o ON o.id = oa.organization_id
         WHERE oa.application_id = applications.id
           AND o.status = 'SUSPENDED'
       )
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

  // Registered clients use high-entropy secrets, so a constant-time SHA-256 comparison is sufficient.
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

  const result = await pool.query<OAuthSessionRow>(
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
    if (session.bio) {
      claims.bio = session.bio;
    }
    if (session.dateOfBirth) {
      claims.birthdate = session.dateOfBirth;
    }
  }

  if (scopes.includes("bhid")) {
    claims.bhid = session.bhid;
  }

  if (scopes.includes("verification")) {
    claims.verification_level = session.verificationLevel;
    const verificationTier = getVerificationTier(session.verificationLevel);

    if (verificationTier) {
      claims.verification_tier = verificationTier;
    }
  }

  if (scopes.includes("wallet")) {
    const primaryWallet = getPrimaryOAuthWallet(session.wallets);
    const walletAddress =
      primaryWallet?.address ?? session.walletAddress;
    const walletVerified =
      primaryWallet?.verified ??
      (walletAddress !== null && session.walletVerifiedAt !== null);
    const walletVerifiedAt =
      primaryWallet?.verified_at ??
      session.walletVerifiedAt?.toISOString() ??
      null;

    claims.wallet_linked = walletAddress !== null;
    claims.wallet_verified = walletVerified;

    if (walletAddress) {
      claims.wallet_address = walletAddress;
    }
    if (walletVerified && walletVerifiedAt) {
      claims.wallet_verified_at = walletVerifiedAt;
    }
  }

  if (scopes.includes("membership")) {
    claims.membership_tier = session.membershipTier;

    if (session.membershipExpiresAt) {
      claims.membership_expires_at =
        session.membershipExpiresAt.toISOString();
    }
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
  // The decoded audience is only a lookup hint; callers must verify the JWT afterward.
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
