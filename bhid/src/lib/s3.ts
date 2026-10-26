import "server-only";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

type S3Configuration = {
  bucket: string;
  publicBaseUrl: URL;
  region: string;
};

export class S3ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "S3ConfigurationError";
  }
}

let client: S3Client | undefined;
let clientRegion: string | undefined;

export function getS3Configuration(): S3Configuration {
  const region = process.env.AWS_REGION?.trim();
  const bucket =
    process.env.S3_BUCKET_NAME?.trim() ||
    process.env.AWS_S3_BUCKET?.trim();
  const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL?.trim();

  if (!region || !bucket || !publicBaseUrl) {
    throw new S3ConfigurationError(
      "AWS_REGION, S3_BUCKET_NAME, and AWS_S3_PUBLIC_BASE_URL must be configured"
    );
  }

  let parsedPublicBaseUrl: URL;
  try {
    parsedPublicBaseUrl = new URL(publicBaseUrl);
  } catch {
    throw new S3ConfigurationError(
      "AWS_S3_PUBLIC_BASE_URL must be an absolute URL"
    );
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    parsedPublicBaseUrl.username ||
    parsedPublicBaseUrl.password ||
    parsedPublicBaseUrl.search ||
    parsedPublicBaseUrl.hash ||
    (parsedPublicBaseUrl.protocol !== "https:" &&
      !(
        parsedPublicBaseUrl.protocol === "http:" &&
        localHosts.has(parsedPublicBaseUrl.hostname)
      ))
  ) {
    throw new S3ConfigurationError(
      "AWS_S3_PUBLIC_BASE_URL must use HTTPS except for local development"
    );
  }

  return {
    bucket,
    publicBaseUrl: parsedPublicBaseUrl,
    region,
  };
}

function getS3Client(region: string): S3Client {
  if (!client || clientRegion !== region) {
    const roleArn = process.env.AWS_ROLE_ARN?.trim();

    if (!roleArn) {
      // Fail early with a clear message instead of the generic CredentialsProviderError
      throw new S3ConfigurationError(
        "AWS_ROLE_ARN is missing. Connect the S3 bucket to the Vercel project (OIDC)."
      );
    }

    client = new S3Client({
      region,
      credentials: awsCredentialsProvider({
        roleArn,
      }),
    });
    clientRegion = region;
  }

  return client;
}

export function getAvatarPublicUrl(
  avatarKey: string | null,
  legacyAvatarUrl: string | null
): string | null {
  if (!avatarKey) {
    return legacyAvatarUrl;
  }

  const { publicBaseUrl } = getS3Configuration();
  const base = new URL(publicBaseUrl);
  if (!base.pathname.endsWith("/")) {
    base.pathname += "/";
  }

  return new URL(
    avatarKey.split("/").map(encodeURIComponent).join("/"),
    base
  ).toString();
}

export async function putAvatarObject(input: {
  body: Buffer;
  contentType: string;
  key: string;
}): Promise<void> {
  const { bucket, region } = getS3Configuration();
  await getS3Client(region).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentLength: input.body.length,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function deleteAvatarObject(key: string): Promise<void> {
  const { bucket, region } = getS3Configuration();
  await getS3Client(region).send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}