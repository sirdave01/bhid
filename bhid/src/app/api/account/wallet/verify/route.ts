import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/account-session";
import pool from "@/lib/db";
import { verifySolanaMessage } from "@/lib/solana-wallet";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidChallenge() {
  return NextResponse.json(
    { success: false, message: "Wallet proof is invalid or expired" },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    console.error("Wallet verification session lookup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify wallet ownership right now" },
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
    return invalidChallenge();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("challengeId" in body) ||
    typeof body.challengeId !== "string" ||
    !UUID_PATTERN.test(body.challengeId) ||
    !("signature" in body) ||
    typeof body.signature !== "string" ||
    body.signature.length > 120
  ) {
    return invalidChallenge();
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const challengeResult = await client.query<{
      id: string;
      wallet_address: string;
      nonce: string;
    }>(
      `SELECT id, wallet_address, nonce
       FROM wallet_link_challenges
       WHERE id = $1
         AND user_id = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [body.challengeId, session.userId]
    );
    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");
      return invalidChallenge();
    }

    await client.query(
      `UPDATE wallet_link_challenges
       SET used_at = NOW()
       WHERE id = $1`,
      [challenge.id]
    );

    const message = [
      "Sign this message to link a Solana wallet to your BHID account.",
      `BHID account: ${session.userId}`,
      `Wallet: ${challenge.wallet_address}`,
      `Nonce: ${challenge.nonce}`,
      `Challenge: ${challenge.id}`,
    ].join("\n");
    let isValidSignature = false;

    try {
      isValidSignature = verifySolanaMessage(
        challenge.wallet_address,
        message,
        body.signature
      );
    } catch {
      isValidSignature = false;
    }

    if (!isValidSignature) {
      await client.query("COMMIT");
      return invalidChallenge();
    }

    await client.query(
      `INSERT INTO profiles (user_id, wallet_address, wallet_verified_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET wallet_address = EXCLUDED.wallet_address,
           wallet_verified_at = NOW(),
           updated_at = NOW()`,
      [session.userId, challenge.wallet_address]
    );
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Solana wallet ownership verified",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    const dbError = error as { code?: string; constraint?: string };

    if (
      dbError.code === "23505" &&
      dbError.constraint === "profiles_wallet_address_unique"
    ) {
      return NextResponse.json(
        { success: false, message: "That wallet is already linked to an account" },
        { status: 409 }
      );
    }

    console.error("Wallet verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify wallet ownership right now" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
