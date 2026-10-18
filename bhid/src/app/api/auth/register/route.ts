// this file is the registration route for the application.
// It handles the registration of new users by validating the input data, checking for existing users, hashing passwords,
// and storing the new user in the database.
// The route uses Zod for schema validation to ensure that the input data meets the required format and constraints.

import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import pool from "@/lib/db";

import { generateBhid, hashPassword } from "@/lib/auth";

import { registerSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  // 1. Parse the request body.
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body is not valid JSON" },
      { status: 400 }
    );
  }

  // 2. Validate the submitted fields.
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Please, correct the registration details",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { firstName, lastName, email, password, username } = parsed.data;

  // 3. Hash the password before storing it.
  let hashedPassword: string;

  try {
    hashedPassword = await hashPassword(password);
  } catch (error) {
    console.error("Password hashing failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  }

  // 4. Connect to PostgreSQL.
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error("Registration Database connection failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  }

  try {
    // A BHID collision is extraordinarily unlikely, but the database
    // remains the final authority on uniqueness.
    for (let attempt = 0; attempt < 3; attempt++) {
      await client!.query("BEGIN");

      try {
        const bhid = generateBhid();

        // 5. Create the main account record.
        const userResult = await client!.query(
          `INSERT INTO users (bhid, email, password_hash, status, verification_level)
          VALUES ($1, $2, $3, 'ACTIVE', 0)
          RETURNING id, bhid, email, status, verification_level, created_at`,
          [bhid, email, hashedPassword]
        );

        const user = userResult.rows[0];

        // 6. Create the profile record.
        const displayName = `${firstName} ${lastName}`;

        await client!.query(
          `INSERT INTO profiles (user_id, username, display_name)
          VALUES ($1, $2, $3)`,
          [user.id, username ?? null, displayName]
        );

        // 7. Commit both records together.
        await client!.query("COMMIT");

        return NextResponse.json(
          {
            success: true,
            message: "Account created successfully",
            data: {
              id: user.id,
              bhid: user.bhid,
              email: user.email,
              status: user.status,
              verification_level: user.verification_level,
              created_at: user.created_at,
            },
          },
          { status: 201 }
        );
      } catch (error: unknown) {
        await client!.query("ROLLBACK");

        const dbError = error as { code?: string; constraint?: string };

        // Retry only a collision on the generated BHID.
        if (
          dbError.code === "23505" &&
          dbError.constraint === "users_bhid_key" &&
          attempt < 2
        ) {
          continue;
        }

        if (
          dbError.code === "23505" &&
          dbError.constraint === "users_email_unique"
        ) {
          return NextResponse.json(
            { success: false, message: "Email is already registered" },
            { status: 409 }
          );
        }

        if (
          dbError.constraint === "profiles_username_lower_unique" ||
          dbError.constraint === "profiles_username_key"
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "That username is unavailable",
            },
            { status: 409 }
          );
        }

        if (dbError.code === "23505") {
          return NextResponse.json(
            {
              success: false,
              message: "Unable to register with those details",
            },
            { status: 409 }
          );
        }

        console.error("Registration database operation failed:", error);
        return NextResponse.json(
          { success: false, message: "Unable to create account right now" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, message: "Unable to create a unique BHID" },
      { status: 503 }
    );
  } catch (error) {
    console.error("Registration failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to create account right now" },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}
