import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import {
  type ActiveBhidSession,
  findActiveBhidSession,
  findOAuthApplication,
  generateAuthorizationCode,
  OAUTH_AUTHORIZATION_CODE_SECONDS,
  OAUTH_AUTHORIZATION_REQUEST_SECONDS,
  verifyBhidSessionToken,
} from "@/lib/oauth";
import { hashToken } from "@/lib/auth";

type AuthorizationRequest = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
  nonce: string;
  code_challenge: string;
  code_challenge_method: string;
  prompt?: string;
};

function oauthError(error: string) {
  return NextResponse.json(
    {
      error,
      error_description: "The authorization request could not be completed",
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    }
  );
}

function redirectWithError(
  redirectUri: string,
  state: string,
  error: string
) {
  const callback = new URL(redirectUri);
  callback.searchParams.set("error", error);
  callback.searchParams.set("state", state);

  const response = NextResponse.redirect(callback, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function isSafeRedirectUri(
  redirectUri: string,
  clientType: "PUBLIC" | "CONFIDENTIAL"
) {
  try {
    const uri = new URL(redirectUri);

    if (uri.hash || uri.username || uri.password) {
      return false;
    }

    if (uri.protocol === "https:") {
      return true;
    }

    if (uri.protocol === "http:") {
      return (
        uri.hostname === "localhost" ||
        uri.hostname === "127.0.0.1" ||
        uri.hostname === "[::1]"
      );
    }

    return (
      clientType === "PUBLIC" &&
      !["javascript:", "data:", "file:"].includes(uri.protocol)
    );
  } catch {
    return false;
  }
}

function readAuthorizationRequest(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const names = [
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "nonce",
    "code_challenge",
    "code_challenge_method",
    "prompt",
    "response_mode",
    "request",
    "request_uri",
  ];

  for (const name of names) {
    if (params.getAll(name).length > 1) {
      return null;
    }
  }

  if (params.has("response_mode") || params.has("request") || params.has("request_uri")) {
    return null;
  }

  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const scope = params.get("scope");
  const state = params.get("state");
  const nonce = params.get("nonce");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const prompt = params.get("prompt") ?? undefined;

  if (
    !clientId ||
    !redirectUri ||
    !responseType ||
    !scope ||
    !state ||
    !nonce ||
    !codeChallenge ||
    !codeChallengeMethod
  ) {
    return null;
  }

  return {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    prompt,
  } satisfies AuthorizationRequest;
}

function redirectToLogin(request: NextRequest) {
  const continueTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("continue", continueTo);
  return NextResponse.redirect(loginUrl, { status: 303 });
}

async function issueAuthorizationCode(
  input: AuthorizationRequest,
  applicationId: string,
  session: ActiveBhidSession,
  scopes: string[]
) {
  const code = generateAuthorizationCode();
  const codeHash = hashToken(code);

  await pool.query(
    `INSERT INTO oauth_authorization_codes (
       code_hash,
       application_id,
       user_id,
       session_id,
       auth_version,
       redirect_uri,
       scopes,
       code_challenge,
       nonce,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             NOW() + ($10 * INTERVAL '1 second'))`,
    [
      codeHash,
      applicationId,
      session.userId,
      session.sessionId,
      session.authVersion,
      input.redirect_uri,
      scopes,
      input.code_challenge,
      input.nonce,
      OAUTH_AUTHORIZATION_CODE_SECONDS,
    ]
  );

  const callback = new URL(input.redirect_uri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", input.state);

  const response = NextResponse.redirect(callback, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const params = readAuthorizationRequest(request);

  if (!params || params.response_type !== "code") {
    return oauthError("invalid_request");
  }

  const stateIsValid = params.state.length <= 512;
  const nonceIsValid = params.nonce.length <= 512;
  const challengeIsValid =
    /^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge);

  if (
    !stateIsValid ||
    !nonceIsValid ||
    !challengeIsValid ||
    params.code_challenge_method !== "S256"
  ) {
    return oauthError("invalid_request");
  }

  const prompts = params.prompt?.split(/\s+/).filter(Boolean) ?? [];

  if (
    prompts.some((value) => !["none", "login", "consent"].includes(value)) ||
    (prompts.includes("none") && prompts.length > 1)
  ) {
    return oauthError("invalid_request");
  }

  try {
    const application = await findOAuthApplication(params.client_id);

    if (
      !application ||
      !application.redirect_uris?.includes(params.redirect_uri) ||
      !isSafeRedirectUri(params.redirect_uri, application.client_type)
    ) {
      return oauthError("invalid_request");
    }

    if (params.response_type !== "code") {
      return redirectWithError(
        params.redirect_uri,
        params.state,
        "unsupported_response_type"
      );
    }

    const scopes = params.scope.split(/\s+/).filter(Boolean);
    const permittedScopes = new Set([
      "openid",
      ...(application.allowed_scopes ?? []),
    ]);

    if (
      !scopes.includes("openid") ||
      new Set(scopes).size !== scopes.length ||
      scopes.some((scope) => !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope)) ||
      scopes.some((scope) => !permittedScopes.has(scope))
    ) {
      return redirectWithError(params.redirect_uri, params.state, "invalid_scope");
    }

    const accessToken = request.cookies.get("bhid_access")?.value;
    const tokenClaims = accessToken
      ? verifyBhidSessionToken(accessToken)
      : null;
    const session = tokenClaims
      ? await findActiveBhidSession(tokenClaims)
      : null;

    if (!session || prompts.includes("login")) {
      if (prompts.includes("none")) {
        return redirectWithError(
          params.redirect_uri,
          params.state,
          "login_required"
        );
      }

      return redirectToLogin(request);
    }

    const consentResult = await pool.query(
      `SELECT scopes
       FROM oauth_consents
       WHERE application_id = $1
         AND user_id = $2
         AND revoked_at IS NULL
       LIMIT 1`,
      [application.id, session.userId]
    );

    const previouslyGranted = new Set<string>(
      consentResult.rows[0]?.scopes ?? []
    );
    const needsConsent =
      prompts.includes("consent") ||
      scopes.some((scope) => !previouslyGranted.has(scope));

    if (needsConsent) {
      if (prompts.includes("none")) {
        return redirectWithError(
          params.redirect_uri,
          params.state,
          "consent_required"
        );
      }

      const pendingResult = await pool.query(
        `INSERT INTO oauth_authorization_requests (
           application_id,
           user_id,
           session_id,
           auth_version,
           redirect_uri,
           scopes,
           state,
           nonce,
           code_challenge,
           expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 NOW() + ($10 * INTERVAL '1 second'))
         RETURNING id`,
        [
          application.id,
          session.userId,
          session.sessionId,
          session.authVersion,
          params.redirect_uri,
          scopes,
          params.state,
          params.nonce,
          params.code_challenge,
          OAUTH_AUTHORIZATION_REQUEST_SECONDS,
        ]
      );

      const consentUrl = new URL("/oauth/consent", request.url);
      consentUrl.searchParams.set(
        "request_id",
        pendingResult.rows[0].id
      );

      const response = NextResponse.redirect(consentUrl, { status: 303 });
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }

    return issueAuthorizationCode(
      params,
      application.id,
      session,
      scopes
    );
  } catch (error) {
    console.error("OAuth authorization request failed:", error);
    return NextResponse.json(
      { error: "server_error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
  }
}
