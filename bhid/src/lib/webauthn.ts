import "server-only";

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

export type WebAuthnConfig = {
  rpID: string;
  rpName: string;
  origins: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isBase64Url(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100_000 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function hasValidCredentialEnvelope(
  value: unknown
): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    value.type !== "public-key" ||
    !isBase64Url(value.id) ||
    !isBase64Url(value.rawId) ||
    !isRecord(value.response) ||
    !isRecord(value.clientExtensionResults)
  ) {
    return false;
  }

  const attachment = value.authenticatorAttachment;

  return (
    attachment === undefined ||
    attachment === null ||
    attachment === "platform" ||
    attachment === "cross-platform"
  );
}

export function isRegistrationResponse(
  value: unknown
): value is RegistrationResponseJSON {
  if (!hasValidCredentialEnvelope(value) || !isRecord(value.response)) {
    return false;
  }

  const response = value.response;
  const transports = response.transports;

  return (
    isBase64Url(response.clientDataJSON) &&
    isBase64Url(response.attestationObject) &&
    (transports === undefined ||
      (Array.isArray(transports) &&
        transports.every(
          (transport) =>
            typeof transport === "string" && transport.length <= 32
        )))
  );
}

export function isAuthenticationResponse(
  value: unknown
): value is AuthenticationResponseJSON {
  if (!hasValidCredentialEnvelope(value) || !isRecord(value.response)) {
    return false;
  }

  const response = value.response;

  return (
    isBase64Url(response.clientDataJSON) &&
    isBase64Url(response.authenticatorData) &&
    isBase64Url(response.signature) &&
    (response.userHandle === undefined ||
      response.userHandle === null ||
      isBase64Url(response.userHandle))
  );
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const issuer = process.env.JWT_ISSUER;

  if (!issuer) {
    throw new Error("JWT_ISSUER must be configured for passkey operations");
  }

  const issuerUrl = new URL(issuer);

  if (
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    (process.env.NODE_ENV === "production" &&
      issuerUrl.protocol !== "https:")
  ) {
    throw new Error("JWT_ISSUER must be a valid secure BHID URL");
  }

  const rpID = (process.env.WEBAUTHN_RP_ID ?? issuerUrl.hostname)
    .trim()
    .toLowerCase();
  const rpName = (process.env.WEBAUTHN_RP_NAME ?? "BHID").trim();
  const origins = (
    process.env.WEBAUTHN_ORIGINS ?? issuerUrl.origin
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (
    !rpID ||
    rpName.length < 1 ||
    rpName.length > 64 ||
    origins.length === 0
  ) {
    throw new Error("Invalid WebAuthn relying-party configuration");
  }

  for (const origin of origins) {
    const originUrl = new URL(origin);
    const hostMatches =
      originUrl.hostname === rpID ||
      originUrl.hostname.endsWith(`.${rpID}`);

    if (
      originUrl.origin !== origin ||
      originUrl.username ||
      originUrl.password ||
      originUrl.pathname !== "/" ||
      originUrl.search ||
      originUrl.hash ||
      !hostMatches ||
      (process.env.NODE_ENV === "production" &&
        originUrl.protocol !== "https:")
    ) {
      throw new Error("Invalid WebAuthn origin configuration");
    }
  }

  return { rpID, rpName, origins };
}