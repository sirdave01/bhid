import { createPublicKey } from "node:crypto";
import { connection, NextResponse } from "next/server";

import { getJwtConfig } from "@/lib/jwt-keys";

export async function GET() {
  await connection();
  const { keyId, publicKey } = getJwtConfig();
  const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });

  return NextResponse.json(
    {
      keys: [
        {
          ...publicJwk,
          kid: keyId,
          use: "sig",
          alg: "RS256",
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
