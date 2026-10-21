// creating JWT keys for authentication


import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n");
}

function readPemFile(environmentVariable: string): string {
  const configuredPath = process.env[environmentVariable];

  if (!configuredPath) {
    throw new Error(
      `${environmentVariable} is missing from the environment`
    );
  }

  return readFileSync(
    resolve(process.cwd(), configuredPath),
    "utf8"
  );
}

function readPemKey(keyVariable: string, pathVariable: string): string {
  const configuredKey = process.env[keyVariable];

  if (configuredKey) {
    return normalizePem(configuredKey);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${keyVariable} is missing from the environment`);
  }

  return normalizePem(readPemFile(pathVariable));
}

type JwtConfig = {
  issuer: string;
  audience: string;
  keyId: string;
  privateKey: string;
  publicKey: string;
};

let cachedJwtConfig: JwtConfig | undefined;

export function getJwtConfig(): JwtConfig {
  if (cachedJwtConfig) {
    return cachedJwtConfig;
  }

  const issuer = process.env.JWT_ISSUER;
  const keyId = process.env.JWT_ACCESS_KEY_ID;
  const audience = process.env.JWT_ACCESS_AUDIENCE;

  if (!issuer || !keyId || !audience) {
    throw new Error(
      "JWT_ISSUER, JWT_ACCESS_KEY_ID, and JWT_ACCESS_AUDIENCE must be configured"
    );
  }

  const issuerUrl = new URL(issuer);
  const localIssuerHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

  if (
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    (issuerUrl.protocol !== "https:" &&
      !localIssuerHosts.has(issuerUrl.hostname))
  ) {
    throw new Error("JWT_ISSUER must be HTTPS except for local development");
  }

  cachedJwtConfig = {
    issuer,
    audience,
    keyId,
    privateKey: readPemKey(
      "JWT_ACCESS_PRIVATE_KEY",
      "JWT_ACCESS_PRIVATE_KEY_PATH"
    ),
    publicKey: readPemKey(
      "JWT_ACCESS_PUBLIC_KEY",
      "JWT_ACCESS_PUBLIC_KEY_PATH"
    ),
  };

  return cachedJwtConfig;
}
