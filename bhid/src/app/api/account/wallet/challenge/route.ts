import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { isSolanaAddress } from "@/lib/solana-wallet";

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Wallet challenge session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to link a wallet right now" },
      { status: 500 }
    );
  }

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
    !("address" in body) ||
    typeof body.address !== "string" ||
    !isSolanaAddress(body.address)
  ) {
    return NextResponse.json(
      { success: false, message: "Enter a valid Solana wallet address" },
      { status: 400 }
    );
  }

  try {
    const recentChallenges = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM wallet_link_challenges
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [session.userId]
    );

    if (Number(recentChallenges.rows[0]?.total ?? "0") >= 5) {
      return NextResponse.json(
        { success: false, message: "Please wait before trying to link a wallet again" },
        { status: 429 }
      );
    }

    const nonce = randomBytes(24).toString("base64url");
    const challenge = await pool.query<{ id: string }>(
      `INSERT INTO wallet_link_challenges (
         user_id,
         wallet_address,
         nonce,
         expires_at
       )
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')
       RETURNING id`,
      [session.userId, body.address, nonce]
    );
    const challengeId = challenge.rows[0].id;
    const message = [
      "Sign this message to link a Solana wallet to your BHID account.",
      `BHID account: ${session.userId}`,
      `Wallet: ${body.address}`,
      `Nonce: ${nonce}`,
      `Challenge: ${challengeId}`,
    ].join("\n");

    return NextResponse.json({
      success: true,
      data: { challengeId, message, expiresInSeconds: 300 },
    });
  } catch (error) {
    console.error("Wallet challenge creation failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to link a wallet right now" },
      { status: 500 }
    );
  }
}
