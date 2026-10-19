import "server-only";

import type { JwtPayload } from "jsonwebtoken";

import { verifyAccessToken } from "@/lib/auth";
import pool from "@/lib/db";
import { getJwtConfig } from "@/lib/jwt-keys";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionClaims = JwtPayload & {
  sub: string;
  sid: string;
  auth_version: number;
};

type AuthenticatedSessionRow = {
  id: string;
  bhid: string;
  email: string;
  email_verified_at: Date | null;
  status: string;
  auth_version: number;
  session_id: string;
};

export type AuthenticatedSession = {
  userId: string;
  sessionId: string;
  authVersion: number;
  bhid: string;
  email: string;
  emailVerified: boolean;
  status: string;
};

function isSessionClaims(
  claims: JwtPayload | string
): claims is SessionClaims {
  return (
    typeof claims === "object" &&
    claims !== null &&
    typeof claims.sub === "string" &&
    UUID_PATTERN.test(claims.sub) &&
    typeof claims.sid === "string" &&
    UUID_PATTERN.test(claims.sid) &&
    typeof claims.auth_version === "number" &&
    Number.isInteger(claims.auth_version) &&
    claims.auth_version >= 0
  );
}

export async function getAuthenticatedSession(
  accessToken: string | undefined
): Promise<AuthenticatedSession | null> {
  if (!accessToken) {
    return null;
  }

  let claims: JwtPayload | string;

  try {
    claims = verifyAccessToken(accessToken, getJwtConfig().audience);
  } catch {
    return null;
  }

  if (!isSessionClaims(claims)) {
    return null;
  }

  const result = await pool.query<AuthenticatedSessionRow>(
    `SELECT
       u.id,
       u.bhid,
       u.email,
       u.email_verified_at,
       u.status,
       u.auth_version,
       s.id AS session_id
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
     LIMIT 1`,
    [claims.sid, claims.sub, claims.auth_version]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    userId: row.id,
    sessionId: row.session_id,
    authVersion: row.auth_version,
    bhid: row.bhid,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    status: row.status,
  };
}