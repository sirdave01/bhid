import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ENCRYPTION_KEY_ENV = "MFA_TOTP_ENCRYPTION_KEY";

function getEncryptionKey(): Buffer {
  const configuredKey = process.env[ENCRYPTION_KEY_ENV];

  if (!configuredKey) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is missing from the environment`);
  }

  const key = Buffer.from(configuredKey, "base64");

  if (key.length !== 32) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key`);
  }

  return key;
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let encoded = "";

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(accumulator >>> bits) & 31];
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  }

  return encoded;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const decoded: number[] = [];

  for (const character of value.replace(/=+$/, "").toUpperCase()) {
    const digit = BASE32_ALPHABET.indexOf(character);

    if (digit === -1) {
      throw new Error("Stored TOTP secret is invalid");
    }

    accumulator = (accumulator << 5) | digit;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      decoded.push((accumulator >>> bits) & 255);
    }
  }

  return Buffer.from(decoded);
}

export function createTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function encryptTotpSecret(secret: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64"
  );
}

export function decryptTotpSecret(encrypted: string): string {
  const packed = Buffer.from(encrypted, "base64");

  if (packed.length < 29) {
    throw new Error("Stored TOTP secret is invalid");
  }

  const nonce = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function codeForCounter(secret: string, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(
  secret: string,
  code: string,
  now = Date.now()
): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const currentCounter = BigInt(Math.floor(now / 30_000));
  const submitted = Buffer.from(code);

  for (let adjustment = -1n; adjustment <= 1n; adjustment++) {
    const expected = Buffer.from(
      codeForCounter(secret, currentCounter + adjustment)
    );

    if (timingSafeEqual(expected, submitted)) {
      return true;
    }
  }

  return false;
}

export function createTotpUri(secret: string, account: string): string {
  const label = encodeURIComponent(`BHID:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer: "BHID",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}
