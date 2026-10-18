// creating the basic authentication module for the project. This module will handle
// user login, logout, and session management. It will also provide utility functions for checking authentication
// status and retrieving user information. The module will be designed to be easily integrated with the existing
// application architecture and will follow best practices for security and performance.


import argon2 from "argon2";

import jwt, { type JwtPayload } from "jsonwebtoken";

import {
  randomInt,
  randomBytes,
  createHash,
} from "node:crypto";

import { getJwtConfig } from "@/lib/jwt-keys";

// --------------------------------------------------
// JWT CONFIGURATION
// --------------------------------------------------

// --------------------------------------------------
// BHID GENERATION
// --------------------------------------------------

export function generateBhid(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";

  for (let i = 0; i < 16; i++) {
    suffix += chars[randomInt(chars.length)];
  }

  return `BHID-${suffix}`;
}

// --------------------------------------------------
// PASSWORD HASHING
// --------------------------------------------------

export async function hashPassword(
  password: string
): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}

// --------------------------------------------------
// ACCESS TOKENS
// --------------------------------------------------

type AccessTokenInput = {
  userId: string;
  sessionId: string;
  authVersion: number;
};

export function signAccessToken(
  input: AccessTokenInput,
  audience: string
): string {
  const { issuer, keyId, privateKey } = getJwtConfig();

  return jwt.sign(
    {
      sid: input.sessionId,
      auth_version: input.authVersion,
    },
    privateKey,
    {
      algorithm: "RS256",
      subject: input.userId,
      issuer,
      audience,
      expiresIn: "10m",
      keyid: keyId,
    }
  );
}

export function verifyAccessToken(
  token: string,
  audience: string
): JwtPayload | string {
  const { issuer, publicKey } = getJwtConfig();

  return jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer,
    audience,
  });
}

// --------------------------------------------------
// OPAQUE REFRESH TOKENS
// --------------------------------------------------

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

// --------------------------------------------------
// TOKEN HASHING
// --------------------------------------------------

export function hashToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}