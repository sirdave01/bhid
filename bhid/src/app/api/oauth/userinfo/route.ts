import { NextRequest, NextResponse } from "next/server";

import {
  findActiveBhidSession,
  findOAuthApplication,
  getVerificationTier,
  readOAuthTokenAudience,
  verifyOAuthToken,
} from "@/lib/oauth";

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

    const claims = verifyOAuthToken(token, application.client_id);

    if (!claims) {
      return unauthorized();
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
      return unauthorized();
    }

    const user = await findActiveBhidSession(claims);

    if (!user) {
      return unauthorized();
    }

    const grantedScopes = new Set(scopes);
    const userInfo: Record<string, string | boolean | number> = {
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
      userInfo.wallet_linked = user.walletAddress !== null;
      userInfo.wallet_verified =
        user.walletAddress !== null && user.walletVerifiedAt !== null;

      if (user.walletAddress) {
        userInfo.wallet_address = user.walletAddress;
      }
      if (user.walletAddress && user.walletVerifiedAt) {
        userInfo.wallet_verified_at = user.walletVerifiedAt.toISOString();
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
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
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
