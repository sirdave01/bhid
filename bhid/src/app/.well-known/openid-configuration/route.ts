import { connection, NextResponse } from "next/server";

import { getJwtConfig } from "@/lib/jwt-keys";
import { oidcEndpoint } from "@/lib/oauth";

export async function GET() {
  await connection();
  const { issuer } = getJwtConfig();

  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: oidcEndpoint("/api/oauth/authorize"),
      token_endpoint: oidcEndpoint("/api/oauth/token"),
      userinfo_endpoint: oidcEndpoint("/api/oauth/userinfo"),
      jwks_uri: oidcEndpoint("/.well-known/jwks.json"),
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "none",
      ],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile", "email", "bhid"],
      claims_supported: [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "nonce",
        "sid",
        "auth_version",
        "email",
        "email_verified",
        "name",
        "preferred_username",
        "picture",
        "bhid",
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
