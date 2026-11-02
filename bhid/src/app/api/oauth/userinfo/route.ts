import { NextRequest, NextResponse } from "next/server";

import {
  findActiveBhidSession,
  findOAuthApplication,
  getRegisteredPublicClientOrigin,
  getPrimaryOAuthWallet,
  readOAuthTokenAudience,
  type OAuthWallet,
  verifyOAuthToken,
} from "@/lib/oauth";
import { getVerificationTier } from "@/lib/verification";
import pool from "@/lib/db";

function userInfoHeaders(corsOrigin: string | null = null) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

function unauthorizedForOrigin(corsOrigin: string | null) {
  const headers = userInfoHeaders(corsOrigin);
  headers.set("WWW-Authenticate", 'Bearer error="invalid_token"');

  return NextResponse.json(
    { error: "invalid_token" },
    { status: 401, headers }
  );
}

function unauthorized() {
  return NextResponse.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    }
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const result = await pool.query<{ redirect_uris: string[] | null }>(
      `SELECT redirect_uris
       FROM applications
       WHERE status = 'ACTIVE'
         AND client_type = 'PUBLIC'`
    );
    const corsOrigin = result.rows.some(
      (application) =>
        getRegisteredPublicClientOrigin(origin, application.redirect_uris) ===
        origin
    )
      ? origin
      : null;

    if (!corsOrigin) {
      return new NextResponse(null, { status: 403 });
    }

    const headers = userInfoHeaders(corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization");
    headers.set("Access-Control-Max-Age", "600");
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("OAuth UserInfo preflight failed:", error);
    return new NextResponse(null, {
      status: 500,
      headers: userInfoHeaders(),
    });
  }
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const match = authorization
    ? /^Bearer\s+([^\s]+)$/i.exec(authorization)
    : null;

  if (!match) {
    return unauthorized();
  }

  const token = match[1];
  const audience = readOAuthTokenAudience(token);

  if (!audience) {
    return unauthorized();
  }

  try {
    const application = await findOAuthApplication(audience);

    if (!application) {
      return unauthorized();
    }

    const corsOrigin =
      application.client_type === "PUBLIC"
        ? getRegisteredPublicClientOrigin(
            request.headers.get("origin"),
            application.redirect_uris
          )
        : null;
    const claims = verifyOAuthToken(token, application.client_id);

    if (!claims) {
      return unauthorizedForOrigin(corsOrigin);
    }

    const scopes = claims.scope.split(/\s+/).filter(Boolean);
    const supportedScopes = new Set([
      "openid",
      "email",
      "profile",
      "bhid",
      "verification",
      "wallet",
      "membership",
    ]);
    const permittedScopes = new Set([
      "openid",
      ...(application.allowed_scopes ?? []),
    ]);

    if (
      !scopes.includes("openid") ||
      new Set(scopes).size !== scopes.length ||
      scopes.some(
        (scope) =>
          !supportedScopes.has(scope) || !permittedScopes.has(scope)
      )
    ) {
      return unauthorizedForOrigin(corsOrigin);
    }

    const user = await findActiveBhidSession(claims);

    if (!user) {
      return unauthorizedForOrigin(corsOrigin);
    }

    const grantedScopes = new Set(scopes);
    const userInfo: Record<string, string | boolean | number | OAuthWallet[]> = {
      sub: user.userId,
    };

    if (grantedScopes.has("email")) {
      userInfo.email = user.email;
      userInfo.email_verified = user.emailVerified;
    }

    if (grantedScopes.has("profile")) {
      if (user.displayName) {
        userInfo.name = user.displayName;
      }
      if (user.username) {
        userInfo.preferred_username = user.username;
      }
      if (user.avatarUrl) {
        userInfo.picture = user.avatarUrl;
      }
    }

    if (grantedScopes.has("bhid")) {
      userInfo.bhid = user.bhid;
    }

    if (grantedScopes.has("verification")) {
      userInfo.verification_level = user.verificationLevel;
      const verificationTier = getVerificationTier(
        user.verificationLevel
      );

      if (verificationTier) {
        userInfo.verification_tier = verificationTier;
      }
    }

    if (grantedScopes.has("wallet")) {
      const primaryWallet = getPrimaryOAuthWallet(user.wallets);
      const walletAddress =
        primaryWallet?.address ?? user.walletAddress;
      const walletVerified =
        primaryWallet?.verified ??
        (walletAddress !== null && user.walletVerifiedAt !== null);
      const walletVerifiedAt =
        primaryWallet?.verified_at ??
        user.walletVerifiedAt?.toISOString() ??
        null;

      userInfo.wallet_linked = walletAddress !== null;
      userInfo.wallet_verified = walletVerified;
      userInfo.wallets = user.wallets;

      if (walletAddress) {
        userInfo.wallet_address = walletAddress;
      }
      if (walletVerified && walletVerifiedAt) {
        userInfo.wallet_verified_at = walletVerifiedAt;
      }
    }

    if (grantedScopes.has("membership")) {
      userInfo.membership_tier = user.membershipTier;

      if (user.membershipExpiresAt) {
        userInfo.membership_expires_at =
          user.membershipExpiresAt.toISOString();
      }
    }

    return NextResponse.json(userInfo, {
      headers: userInfoHeaders(corsOrigin),
    });
  } catch (error) {
    console.error("OAuth UserInfo request failed:", error);
    return NextResponse.json(
      { error: "server_error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
  }
}
