import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getRequestSession } from "@/lib/account-session";
import {
  deleteAvatarObject,
  getAvatarPublicUrl,
  getS3Configuration,
  putAvatarObject,
  S3ConfigurationError,
} from "@/lib/s3";
import pool from "@/lib/db";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const formats = {
  "image/jpeg": {
    extension: "jpg",
    isValid: (data: Buffer) =>
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    isValid: (data: Buffer) =>
      data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  "image/webp": {
    extension: "webp",
    isValid: (data: Buffer) =>
      data.length >= 12 &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP",
  },
} as const;

type AvatarFormat = keyof typeof formats;

function isAvatarFormat(value: string): value is AvatarFormat {
  return Object.hasOwn(formats, value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Profile avatar session lookup failed:", error);
    return errorResponse("Unable to upload your profile picture right now", 500);
  }

  if (!session) {
    return errorResponse("Authentication required", 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_AVATAR_SIZE + 64 * 1024) {
    return errorResponse("Profile pictures must be 5 MB or smaller", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Profile avatar form parsing failed:", error);
    return errorResponse("Choose a valid image file to upload", 400);
  }

  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return errorResponse("Choose an image file to upload", 400);
  }

  if (!file.size || file.size > MAX_AVATAR_SIZE) {
    return errorResponse("Profile pictures must be between 1 byte and 5 MB", 413);
  }

  if (!isAvatarFormat(file.type)) {
    return errorResponse("Upload a JPEG, PNG, or WebP image", 415);
  }

  const contentType = file.type;
  const format = formats[contentType];
  const body = Buffer.from(await file.arrayBuffer());

  if (!format.isValid(body)) {
    return errorResponse("The uploaded file is not a valid image", 415);
  }

  try {
    getS3Configuration();
  } catch (error) {
    if (error instanceof S3ConfigurationError) {
      console.error("Profile avatar S3 configuration failed:", error.message);
      return errorResponse(
        "Profile picture storage is not configured. Contact the BHID administrator.",
        503
      );
    }

    console.error("Profile avatar S3 configuration failed:", error);
    return errorResponse("Unable to upload your profile picture right now", 500);
  }

  const key = `avatars/${session.userId}/${randomUUID()}.${format.extension}`;
  let objectStored = false;
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let previousKey: string | null = null;

  try {
    await putAvatarObject({ body, contentType, key });
    objectStored = true;

    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const previous = await client.query<{ avatar_key: string | null }>(
      "SELECT avatar_key FROM profiles WHERE user_id = $1 FOR UPDATE",
      [session.userId]
    );
    previousKey = previous.rows[0]?.avatar_key ?? null;

    await client.query(
      `INSERT INTO profiles (user_id, avatar_key, avatar_url)
       VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE
       SET avatar_key = EXCLUDED.avatar_key,
           avatar_url = NULL,
           updated_at = NOW()`,
      [session.userId, key]
    );
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Profile avatar update rollback failed:", rollbackError);
      }
    }

    if (objectStored) {
      try {
        await deleteAvatarObject(key);
      } catch (cleanupError) {
        console.error("Uploaded profile avatar cleanup failed:", cleanupError);
      }
    }

    console.error("Profile avatar update failed:", error);
    return errorResponse("Unable to update your profile picture right now", 500);
  } finally {
    client?.release();
  }

  if (previousKey && previousKey !== key) {
    try {
      await deleteAvatarObject(previousKey);
    } catch (error) {
      console.error("Previous profile avatar cleanup failed:", error);
    }
  }

  try {
    return NextResponse.json({
      success: true,
      message: "Profile picture updated",
      data: {
        avatarUrl: getAvatarPublicUrl(key, null),
      },
    });
  } catch (error) {
    console.error("Profile avatar URL configuration failed:", error);
    return errorResponse(
      "Your picture was uploaded, but its public URL is not configured",
      503
    );
  }
}
