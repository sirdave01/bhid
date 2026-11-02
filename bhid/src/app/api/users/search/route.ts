import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { getAvatarPublicUrl } from "@/lib/s3";

type MemberSearchResult = {
  bhid: string;
  username: string | null;
  display_name: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
  membership_tier: string | null;
};

export async function POST(request: NextRequest) {
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

    const submittedQuery =
      typeof body === "object" && body !== null && "query" in body
        ? body.query
        : undefined;

    if (typeof submittedQuery !== "string") {
      return NextResponse.json(
        { success: false, message: "Search query is required" },
        { status: 400 }
      );
    }

    const query = submittedQuery
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "");

    if (query.length < 3 || query.length > 100) {
      return NextResponse.json(
        { success: false, message: "Search must be 3 to 100 characters" },
        { status: 400 }
      );
    }

    const result = await pool.query<MemberSearchResult>(
      `SELECT
         u.bhid,
         p.username,
         p.display_name,
         p.avatar_key,
         p.avatar_url,
         CASE
           WHEN m.expires_at IS NOT NULL AND m.expires_at <= NOW()
             THEN 'BASIC'
           ELSE m.tier::text
         END AS membership_tier
       FROM users AS u
       LEFT JOIN profiles AS p
         ON p.user_id = u.id
       LEFT JOIN user_memberships AS m
         ON m.user_id = u.id
       WHERE u.status = 'ACTIVE'
         AND u.email_verified_at IS NOT NULL
         AND u.id <> $2
         AND (
           position(lower($1) in lower(COALESCE(p.username, ''))) > 0
           OR position(lower($1) in lower(u.email)) > 0
           OR position(lower($1) in lower(COALESCE(p.display_name, ''))) > 0
         )
       ORDER BY
         CASE
           WHEN lower(COALESCE(p.username, '')) = lower($1) THEN 0
           WHEN lower(u.email) = lower($1) THEN 1
           WHEN lower(COALESCE(p.display_name, '')) = lower($1) THEN 2
           ELSE 3
         END,
         p.display_name NULLS LAST,
         p.username NULLS LAST
       LIMIT 25`,
      [query, session.userId]
    );

    return NextResponse.json({
      success: true,
      data: {
        users: result.rows.map((user) => ({
          bhid: user.bhid,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: getAvatarPublicUrl(user.avatar_key, user.avatar_url),
          membershipTier: user.membership_tier ?? "BASIC",
        })),
      },
    });
  } catch (error) {
    console.error("Member search failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to search for people right now" },
      { status: 500 }
    );
  }
}
