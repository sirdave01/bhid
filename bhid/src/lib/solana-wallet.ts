import "server-only";

import { createPublicKey, verify } from "node:crypto";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function decodeBase58(value: string): Buffer {
  if (!value || value.length > 64) {
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
  const signatureBytes = decodeBase58(signature);

  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
    return false;
  }

  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki",
  });

  return verify(null, Buffer.from(message, "utf8"), publicKey, signatureBytes);
}
