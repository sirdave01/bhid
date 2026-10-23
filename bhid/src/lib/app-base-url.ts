import "server-only";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function getAppBaseUrl(): string {
  const configured =
    process.env.APP_BASE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined);
  const value =
    configured ?? (process.env.NODE_ENV !== "production"
      ? "http://localhost:3000"
      : undefined);

  if (!value) {
    throw new Error("APP_BASE_URL must be configured");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_BASE_URL must be an absolute URL");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && localHosts.has(url.hostname)))
  ) {
    throw new Error("APP_BASE_URL must be HTTPS except for local development");
  }

  return url.origin;
}
