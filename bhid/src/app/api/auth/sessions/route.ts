import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

const PAGE_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionRow = {
  id: string;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  absolute_expires_at: Date;
};

type SessionCursor = {
  createdAt: Date;
  id: string;
};

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required" },
    { status: 401 }
  );
}

function decodeCursor(value: string | null): SessionCursor | null | false {
  if (value === null) {
    return null;
  }

  if (!value || value.length > 512) {
    return false;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("createdAt" in decoded) ||
      typeof decoded.createdAt !== "string" ||
      !("id" in decoded) ||
      typeof decoded.id !== "string" ||
      !UUID_PATTERN.test(decoded.id)
    ) {
      return false;
    }

    const createdAt = new Date(decoded.createdAt);

    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== decoded.createdAt
    ) {
      return false;
    }

    return { createdAt, id: decoded.id };
  } catch {
    return false;
  }
}

function encodeCursor(session: SessionRow): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: session.created_at.toISOString(),
      id: session.id,
    })
  ).toString("base64url");
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bhid_access")?.value;

  try {
    const currentSession = await getAuthenticatedSession(accessToken);

    if (!currentSession) {
      return unauthorized();
    }

    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));

    if (cursor === false) {
      return NextResponse.json(
        { success: false, message: "Invalid session cursor" },
        { status: 400 }
      );
    }

    const values: (string | Date | number)[] = [currentSession.userId];
    const cursorCondition = cursor
      ? (() => {
          values.push(cursor.createdAt, cursor.id);
          return `AND (s.created_at, s.id) < ($2, $3)`;
        })()
      : "";
    values.push(PAGE_SIZE + 1);

    const result = await pool.query<SessionRow>(
      `SELECT
         s.id,
         s.user_agent,
         s.created_at,
         s.last_used_at,
         s.expires_at,
         s.absolute_expires_at
       FROM sessions AS s
       WHERE s.user_id = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND s.absolute_expires_at > NOW()
         ${cursorCondition}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT $${values.length}`,
      values
    );

    const hasMore = result.rows.length > PAGE_SIZE;
    const sessions = result.rows.slice(0, PAGE_SIZE);
    const lastSession = sessions[sessions.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        sessions: sessions.map((session) => ({
          id: session.id,
          userAgent: session.user_agent,
          createdAt: session.created_at.toISOString(),
          lastUsedAt: session.last_used_at?.toISOString() ?? null,
          expiresAt: session.expires_at.toISOString(),
          absoluteExpiresAt: session.absolute_expires_at.toISOString(),
          isCurrent: session.id === currentSession.sessionId,
        })),
        nextCursor:
          hasMore && lastSession ? encodeCursor(lastSession) : null,
      },
    });
  } catch (error) {
    console.error("Session list lookup failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to load your sessions right now" },
      { status: 500 }
    );
  }
}
