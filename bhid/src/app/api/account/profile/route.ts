import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { getAvatarPublicUrl } from "@/lib/s3";
import { accountProfileSchema } from "@/lib/validations";

type ProfileRow = {
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_key: string | null;
  date_of_birth: string | Date | null;
  wallet_address: string | null;
  wallet_verified_at: Date | null;
};

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required" },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);

    if (!session) {
      return unauthorized();
    }

    const result = await pool.query<ProfileRow>(
      `SELECT
         display_name,
         username,
         bio,
         avatar_url,
         avatar_key,
         date_of_birth,
         wallet_address,
         wallet_verified_at
       FROM profiles
       WHERE user_id = $1
       LIMIT 1`,
      [session.userId]
    );

    const profile = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        displayName: profile?.display_name ?? "",
        username: profile?.username ?? "",
        bio: profile?.bio ?? "",
        avatarUrl: getAvatarPublicUrl(
          profile?.avatar_key ?? null,
          profile?.avatar_url ?? null
        ) ?? "",
        dateOfBirth:
          profile?.date_of_birth instanceof Date
            ? profile.date_of_birth.toISOString().slice(0, 10)
            : profile?.date_of_birth ?? "",
        walletAddress: profile?.wallet_address ?? null,
        walletVerifiedAt: profile?.wallet_verified_at?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("Account profile lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load your profile right now" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getRequestSession(request);

    if (!session) {
      return unauthorized();
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

    const parsed = accountProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Please correct the profile details",
          errors: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const profile = parsed.data;

    await pool.query(
      `INSERT INTO profiles (
         user_id,
         display_name,
         username,
         bio,
         date_of_birth
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           username = EXCLUDED.username,
           bio = EXCLUDED.bio,
           date_of_birth = EXCLUDED.date_of_birth,
           updated_at = NOW()`,
      [
        session.userId,
        profile.displayName,
        profile.username,
        profile.bio,
        profile.dateOfBirth,
      ]
    );

    return NextResponse.json({
      success: true,
      message: "Profile updated",
    });
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string };

    if (
      dbError.code === "23505" &&
      (dbError.constraint === "profiles_username_lower_unique" ||
        dbError.constraint === "profiles_username_key")
    ) {
      return NextResponse.json(
        { success: false, message: "That username is already in use" },
        { status: 409 }
      );
    }

    console.error("Account profile update failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update your profile right now" },
      { status: 500 }
    );
  }
}
