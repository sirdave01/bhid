// creating JWT keys for authentication


import "server-only";

import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").replace(/^\uFEFF/, "").trim();
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
  const configuredKey = process.env[keyVariable]?.trim();

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

  const issuer = process.env.JWT_ISSUER?.trim();
  const keyId = process.env.JWT_ACCESS_KEY_ID?.trim();
  const audience = process.env.JWT_ACCESS_AUDIENCE?.trim();

  if (!issuer || !keyId || !audience) {
    throw new Error(
      "JWT_ISSUER, JWT_ACCESS_KEY_ID, and JWT_ACCESS_AUDIENCE must be configured"
    );
  }

  let issuerUrl: URL;

  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new Error("JWT_ISSUER must be an absolute URL");
  }

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

  const privateKey = readPemKey(
    "JWT_ACCESS_PRIVATE_KEY",
    "JWT_ACCESS_PRIVATE_KEY_PATH"
  );
  const publicKey = readPemKey(
    "JWT_ACCESS_PUBLIC_KEY",
    "JWT_ACCESS_PUBLIC_KEY_PATH"
  );

  let privateKeyFingerprint: string;
  let publicKeyFingerprint: string;

  try {
    privateKeyFingerprint = createHash("sha256")
      .update(
        createPublicKey(createPrivateKey(privateKey)).export({
          type: "spki",
          format: "der",
        })
      )
      .digest("hex");
    publicKeyFingerprint = createHash("sha256")
      .update(
        createPublicKey(publicKey).export({
          type: "spki",
          format: "der",
        })
      )
      .digest("hex");
  } catch {
    throw new Error(
      "JWT_ACCESS_PRIVATE_KEY and JWT_ACCESS_PUBLIC_KEY must be valid PEM keys"
    );
  }

  if (privateKeyFingerprint !== publicKeyFingerprint) {
    throw new Error(
      "JWT_ACCESS_PRIVATE_KEY and JWT_ACCESS_PUBLIC_KEY do not match"
    );
  }

  cachedJwtConfig = {
    issuer,
    audience,
    keyId,
    privateKey,
    publicKey,
  };

  return cachedJwtConfig;
}
