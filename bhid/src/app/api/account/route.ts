import { NextRequest, NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { verifyPassword } from "@/lib/auth";
import { getRequestSession } from "@/lib/account-session";
import { permanentlyDeleteUser } from "@/lib/permanently-delete-user";
import pool from "@/lib/db";

function isSameOrigin(request: NextRequest) {
  try {
    return request.headers.get("origin") === getAppBaseUrl();
  } catch {
    return false;
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid request origin" },
      { status: 400 }
    );
  }

  try {
    const session = await getRequestSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Request body is not valid JSON" },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("confirmation" in body) ||
      body.confirmation !== "DELETE" ||
      !("password" in body) ||
      typeof body.password !== "string" ||
      body.password.length < 1 ||
      body.password.length > 256
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Enter your password and type DELETE to confirm",
        },
        { status: 400 }
      );
    }

    const userResult = await pool.query<{ password_hash: string }>(
      `SELECT password_hash
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [session.userId]
    );
    const user = userResult.rows[0];

    if (!user || !(await verifyPassword(user.password_hash, body.password))) {
      return NextResponse.json(
        { success: false, message: "The password is incorrect" },
        { status: 401 }
      );
    }

    const result = await permanentlyDeleteUser(session.userId);

    if (!result.deleted) {
      if (result.blockedByOrganizations > 0) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Transfer ownership of every organization you solely own before deleting this account.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, message: "Account not found" },
        { status: 404 }
      );
    }

    const secureCookies = process.env.NODE_ENV === "production";
    const response = NextResponse.json({
      success: true,
      avatarCleanupWarning: result.avatarCleanupWarning,
    });

    response.cookies.set("bhid_access", "", {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("bhid_refresh", "", {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to delete your account right now" },
      { status: 500 }
    );
  }
}
