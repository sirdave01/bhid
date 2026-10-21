import "server-only";

import type { NextRequest } from "next/server";

import { getAuthenticatedSession } from "@/lib/session";

export function getRequestSession(request: NextRequest) {
  return getAuthenticatedSession(request.cookies.get("bhid_access")?.value);
}
