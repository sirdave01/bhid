// this route verifies access token, checks neon and checks account status.
// It also uses the getJwtConfig function to retrieve the JWT configuration for verifying access tokens.

import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedSession } from "@/lib/session";

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      message: "Authentication required",
    },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;

  try {
    const session = await getAuthenticatedSession(accessToken);

    if (!session) {
      return unauthorized();
    }

    return NextResponse.json({
      success: true,
      data: {
        id: session.userId,
        bhid: session.bhid,
        email: session.email,
        emailVerified: session.emailVerified,
        status: session.status,
        sessionId: session.sessionId,
      },
    });
  } catch (error) {
    console.error("Authenticated-user lookup failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to verify your session right now",
      },
      { status: 500 }
    );
  }
}