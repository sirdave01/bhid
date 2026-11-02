import { randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";

const allowedScopes = new Set([
  "email",
  "profile",
  "bhid",
  "verification",
  "wallet",
  "membership",
]);

function usage() {
  console.log(
    "Usage: npm run oauth:register-client -- --name NAME --slug SLUG --type public|confidential --redirect-uri URI [--redirect-uri URI ...] [--scopes email,profile,bhid,verification,wallet,membership]"
  );
}

function parseArguments(args) {
  const supportedOptions = new Set([
    "--name",
    "--slug",
    "--type",
    "--redirect-uri",
    "--scopes",
  ]);
  const values = new Map();
  const repeated = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];

    if (!name.startsWith("--")) {
      throw new Error(`Unexpected argument: ${name}`);
    }

    if (!supportedOptions.has(name)) {
      throw new Error(`Unknown option: ${name}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }

    index += 1;

    if (name === "--redirect-uri") {
      const current = repeated.get(name) ?? [];
      current.push(value);
      repeated.set(name, current);
    } else if (values.has(name)) {
      throw new Error(`Option may only be specified once: ${name}`);
    } else {
      values.set(name, value);
    }
  }

  return { values, repeated };
}

function validateRedirectUri(value, clientType) {
  let uri;

  try {
    uri = new URL(value);
  } catch {
    throw new Error(`Redirect URI must be an absolute URL: ${value}`);
  }

  if (uri.username || uri.password || uri.hash) {
    throw new Error("Redirect URIs cannot contain credentials or fragments.");
  }

  if (uri.protocol === "https:") {
    return;
  }

  const isLoopback =
    uri.hostname === "localhost" ||
    uri.hostname === "127.0.0.1" ||
    uri.hostname === "[::1]";

  if (uri.protocol === "http:" && isLoopback) {
    return;
  }

  if (
    clientType === "PUBLIC" &&
    uri.protocol !== "http:" &&
    !["javascript:", "data:", "file:"].includes(uri.protocol)
  ) {
    return;
  }

  throw new Error(
    "Production web redirect URIs must use HTTPS; HTTP is allowed only for loopback development."
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const { values, repeated } = parseArguments(process.argv.slice(2));
  const name = values.get("--name")?.trim();
  const slug = values.get("--slug")?.trim();
  const requestedType = values.get("--type")?.trim().toLowerCase();
  const redirectUris = repeated.get("--redirect-uri") ?? [];
  const requestedScopes = (
    values.get("--scopes") ?? "email,profile"
  )
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!name || name.length > 128) {
    throw new Error("--name must contain 1 to 128 characters.");
  }

  if (!slug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    throw new Error("--slug must be 2 to 63 lowercase letters, digits, or hyphens.");
  }

  if (!["public", "confidential"].includes(requestedType ?? "")) {
    throw new Error("--type must be either public or confidential.");
  }

  if (redirectUris.length === 0 || new Set(redirectUris).size !== redirectUris.length) {
    throw new Error("Provide one or more unique --redirect-uri values.");
  }

  const clientType = requestedType.toUpperCase();
  for (const uri of redirectUris) {
    validateRedirectUri(uri, clientType);
  }

  if (
    new Set(requestedScopes).size !== requestedScopes.length ||
    requestedScopes.some((scope) => !allowedScopes.has(scope))
  ) {
    throw new Error(
      "--scopes may contain only email, profile, bhid, verification, wallet, and membership."
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured.");
  }

  const clientId = `bhid_${randomBytes(24).toString("base64url")}`;
  const clientSecret =
    clientType === "CONFIDENTIAL"
      ? randomBytes(32).toString("base64url")
      : null;
  const clientSecretHash = clientSecret
    ? createHash("sha256").update(clientSecret).digest("hex")
    : null;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await pool.query(
      `INSERT INTO applications (
         name,
         slug,
         description,
         client_id,
         client_secret_hash,
         redirect_uris,
         allowed_scopes,
         client_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        name,
        slug,
        `${name} OIDC client`,
        clientId,
        clientSecretHash,
        redirectUris,
        requestedScopes,
        clientType,
      ]
    );
  } finally {
    await pool.end();
  }

  console.log("OIDC client registered. Copy the client ID and secret securely now.");
  console.log(`client_id: ${clientId}`);
  console.log(`client_type: ${clientType}`);
  console.log(`redirect_uris: ${JSON.stringify(redirectUris)}`);
  console.log(`allowed_scopes: ${requestedScopes.join(" ")}`);

  if (clientSecret) {
    console.log(`client_secret (shown once): ${clientSecret}`);
    console.log("Store this secret in HavenSocial's server-side secret manager.");
  } else {
    console.log("This public client has no client secret; use Authorization Code + PKCE.");
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "OAuth client registration failed."
  );
  process.exitCode = 1;
});
