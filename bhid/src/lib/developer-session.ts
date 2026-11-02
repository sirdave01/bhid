import "server-only";

import type { NextRequest } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import type { AuthenticatedSession } from "@/lib/session";

type DeveloperAccess =
  | { session: AuthenticatedSession; error: null; status: 200 }
  | {
      session: null;
      error:
        | "authentication_required"
        | "email_verification_required"
        | "server_error";
      status: 401 | 403 | 503;
    };

export async function getDeveloperSession(
  request: NextRequest
): Promise<DeveloperAccess> {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Developer session validation failed:", error);
    return { session: null, error: "server_error", status: 503 };
  }

  if (!session) {
    return {
      session: null,
      error: "authentication_required",
      status: 401,
    };
  }
  if (!session.emailVerified) {
    return {
      session: null,
      error: "email_verification_required",
      status: 403,
    };
  }

  return { session, error: null, status: 200 };
}
