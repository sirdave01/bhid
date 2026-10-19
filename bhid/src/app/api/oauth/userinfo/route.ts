import { NextRequest, NextResponse } from "next/server";

import {
  findActiveBhidSession,
  findOAuthApplication,
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

    if (!claims || !claims.scope.split(/\s+/).includes("openid")) {
      return unauthorized();
    }

    const user = await findActiveBhidSession(claims);

    if (!user) {
      return unauthorized();
    }

    const scopes = new Set(claims.scope.split(/\s+/));
    const userInfo: Record<string, string | boolean> = {
      sub: user.userId,
    };

    if (scopes.has("email")) {
      userInfo.email = user.email;
      userInfo.email_verified = user.emailVerified;
    }

    if (scopes.has("profile")) {
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

    if (scopes.has("bhid")) {
      userInfo.bhid = user.bhid;
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
