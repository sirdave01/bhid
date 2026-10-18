
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import pool from "@/lib/db";
import { getJwtConfig } from "@/lib/jwt-keys";

export async function GET() {
  // Never expose this diagnostic endpoint in production.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, message: "Not found" },
      { status: 404 }
    );
  }

  const results = {
    keyLoading: false,
    jwtSignAndVerify: false,
    neonConnection: false,
  };

  let jwtConfig: ReturnType<typeof getJwtConfig>;

  try {
    jwtConfig = getJwtConfig();
    results.keyLoading = Boolean(
      jwtConfig.privateKey &&
      jwtConfig.publicKey &&
      jwtConfig.issuer &&
      jwtConfig.keyId
    );
  } catch (error) {
    console.error("Local key-loading test failed:", error);
    return NextResponse.json(
      { success: false, results, message: "Key loading failed" },
      { status: 500 }
    );
  }

  try {
    const audience = "bhid-local-self-test";

    const token = jwt.sign(
      { purpose: "local-self-test" },
      jwtConfig.privateKey,
      {
        algorithm: "RS256",
        issuer: jwtConfig.issuer,
        audience,
        expiresIn: "1m",
        keyid: jwtConfig.keyId,
      }
    );

    const verified = jwt.verify(token, jwtConfig.publicKey, {
      algorithms: ["RS256"],
      issuer: jwtConfig.issuer,
      audience,
    });

    results.jwtSignAndVerify =
      typeof verified !== "string" &&
      verified.purpose === "local-self-test";
  } catch (error) {
    console.error("Local JWT test failed:", error);
  }

  try {
    await pool.query("SELECT 1");
    results.neonConnection = true;
  } catch (error) {
    // Log diagnostics locally; never return credentials to the client.
    console.error("Local Neon connection test failed:", error);
  }

  const success = Object.values(results).every(Boolean);

  return NextResponse.json(
    {
      success,
      results,
      message: success
        ? "Local BHID foundation checks passed"
        : "One or more local checks failed. Inspect the terminal.",
    },
    { status: success ? 200 : 500 }
  );
}
