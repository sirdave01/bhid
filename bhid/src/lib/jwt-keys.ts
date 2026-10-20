// creating JWT keys for authentication


import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    privateKey: readPemFile("JWT_ACCESS_PRIVATE_KEY_PATH"),
    publicKey: readPemFile("JWT_ACCESS_PUBLIC_KEY_PATH"),
  };

  return cachedJwtConfig;
}
