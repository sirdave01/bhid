import "server-only";

import { createPublicKey, verify } from "node:crypto";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function decodeBase58(value: string): Buffer {
  if (!value || value.length > 100) {
    throw new Error("Invalid Solana address or signature");
  }

  let number = BigInt(0);

  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);

    if (digit < 0) {
      throw new Error("Invalid Solana address or signature");
    }

    number = number * BigInt(58) + BigInt(digit);
  }

  const bytes: number[] = [];

  while (number > BigInt(0)) {
    bytes.unshift(Number(number & BigInt(0xff)));
    number >>= BigInt(8);
  }

  let leadingZeroes = 0;

  while (leadingZeroes < value.length && value[leadingZeroes] === "1") {
    leadingZeroes += 1;
  }

  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

export function isSolanaAddress(value: string): boolean {
  try {
    return decodeBase58(value).length === 32;
  } catch {
    return false;
  }
}

export function verifySolanaMessage(
  address: string,
  message: string,
  signature: string
): boolean {
  const publicKeyBytes = decodeBase58(address);

  if (publicKeyBytes.length !== 32) {
    return false;
  }

  const signatureCandidates: Buffer[] = [];

  try {
    signatureCandidates.push(decodeBase58(signature));
  } catch {
    // Wallet adapters commonly expose the same signature as Base64 bytes.
  }

  try {
    if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(signature)) {
      const normalized = signature
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .replace(/=+$/, "");
      const bytes = Buffer.from(normalized, "base64");
      const canonical = bytes.toString("base64").replace(/=+$/, "");

      if (canonical === normalized) {
        signatureCandidates.push(bytes);
      }
    }
  } catch {
    // Invalid Base64 is ignored; the other candidate format may still be valid.
  }

  const validSignatures = signatureCandidates.filter(
    (candidate) => candidate.length === 64
  );
  if (!validSignatures.length) {
    return false;
  }

  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki",
  });

  return validSignatures.some((candidate) =>
    verify(null, Buffer.from(message, "utf8"), publicKey, candidate)
  );
}
