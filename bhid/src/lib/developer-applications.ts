import "server-only";

import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";

export const DEVELOPER_ALLOWED_SCOPES = [
  "email",
  "profile",
  "bhid",
  "verification",
  "wallet",
  "membership",
] as const;

export type DeveloperClientType = "PUBLIC" | "CONFIDENTIAL";

export type DeveloperApplicationInput = {
  name: string;
  slug: string;
  description: string | null;
  clientType: DeveloperClientType;
  redirectUris: string[];
  allowedScopes: string[];
};

export function parseDeveloperApplicationInput(
  value: unknown
): DeveloperApplicationInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const clientType =
    typeof body.clientType === "string"
      ? body.clientType.toUpperCase()
      : "";
  const redirectUris = body.redirectUris;
  const allowedScopes = body.allowedScopes;

  if (
    !name ||
    name.length > 128 ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ||
    (description !== null && description.length > 1000) ||
    !["PUBLIC", "CONFIDENTIAL"].includes(clientType) ||
    !Array.isArray(redirectUris) ||
    redirectUris.length < 1 ||
    redirectUris.length > 20 ||
    !redirectUris.every(
      (uri) => typeof uri === "string" && isAllowedRedirectUri(uri)
    ) ||
    new Set(redirectUris).size !== redirectUris.length ||
    !Array.isArray(allowedScopes) ||
    new Set(allowedScopes).size !== allowedScopes.length ||
    !allowedScopes.every(
      (scope) =>
        typeof scope === "string" &&
        DEVELOPER_ALLOWED_SCOPES.includes(
          scope as (typeof DEVELOPER_ALLOWED_SCOPES)[number]
        )
    )
  ) {
    return null;
  }

  return {
    name,
    slug,
    description,
    clientType: clientType as DeveloperClientType,
    redirectUris: redirectUris as string[],
    allowedScopes: allowedScopes as string[],
  };
}

export function parseDeveloperApplicationUpdate(
  value: unknown
): Pick<
  DeveloperApplicationInput,
  "name" | "slug" | "description" | "redirectUris" | "allowedScopes"
> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const redirectUris = body.redirectUris;
  const allowedScopes = body.allowedScopes;

  if (
    !name ||
    name.length > 128 ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ||
    (description !== null && description.length > 1000) ||
    !Array.isArray(redirectUris) ||
    redirectUris.length < 1 ||
    redirectUris.length > 20 ||
    !redirectUris.every(
      (uri) => typeof uri === "string" && isAllowedRedirectUri(uri)
    ) ||
    new Set(redirectUris).size !== redirectUris.length ||
    !Array.isArray(allowedScopes) ||
    new Set(allowedScopes).size !== allowedScopes.length ||
    !allowedScopes.every(
      (scope) =>
        typeof scope === "string" &&
        DEVELOPER_ALLOWED_SCOPES.includes(
          scope as (typeof DEVELOPER_ALLOWED_SCOPES)[number]
        )
    )
  ) {
    return null;
  }

  return {
    name,
    slug,
    description,
    redirectUris: redirectUris as string[],
    allowedScopes: allowedScopes as string[],
  };
}

export function isAllowedRedirectUri(value: string) {
  try {
    const uri = new URL(value);

    if (uri.username || uri.password || uri.hash) {
      return false;
    }

    if (uri.protocol === "https:") {
      return true;
    }

    return (
      uri.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname)
    );
  } catch {
    return false;
  }
}

export function createOAuthClientCredentials(clientType: DeveloperClientType) {
  const clientId = `bhid_${randomBytes(24).toString("base64url")}`;
  const clientSecret =
    clientType === "CONFIDENTIAL"
      ? randomBytes(32).toString("base64url")
      : null;

  return {
    clientId,
    clientSecret,
    clientSecretHash: clientSecret
      ? createHash("sha256").update(clientSecret).digest("hex")
      : null,
  };
}
