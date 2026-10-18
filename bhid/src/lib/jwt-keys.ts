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

  if (!issuer || !keyId) {
    throw new Error(
      "JWT_ISSUER and JWT_ACCESS_KEY_ID must be configured"
    );
  }

  cachedJwtConfig = {
    issuer,
    keyId,
    privateKey: readPemFile("JWT_ACCESS_PRIVATE_KEY_PATH"),
    publicKey: readPemFile("JWT_ACCESS_PUBLIC_KEY_PATH"),
  };

  return cachedJwtConfig;
}
