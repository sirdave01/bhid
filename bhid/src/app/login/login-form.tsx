"use client";

import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type LoginFormProps = {
  continueTo: string;
};

export default function LoginForm({ continueTo }: LoginFormProps) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  async function handlePasskeySignIn() {
    setError("");
    setIsSubmitting(true);

    try {
      const optionsResponse = await fetch(
        "/api/auth/passkeys/authenticate/options",
        { method: "POST" }
      );
      const optionsPayload: unknown = await optionsResponse.json();

      if (!optionsResponse.ok || !isAuthenticationOptions(optionsPayload)) {
        throw new Error("Unable to start passkey sign-in.");
      }

      const credential = await startAuthentication({
        optionsJSON: optionsPayload.data.options,
      });
      const verifyResponse = await fetch(
        "/api/auth/passkeys/authenticate/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: optionsPayload.data.challengeId,
            response: credential,
          }),
        }
      );

      if (!verifyResponse.ok) {
        throw new Error("Unable to sign in with that passkey.");
      }

      window.location.replace(continueTo);
    } catch (passkeyError) {
      setError(
        passkeyError instanceof Error
          ? passkeyError.message
          : "Passkey sign-in failed. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      if (mfaChallengeToken) {
        const response = await fetch("/api/auth/mfa/totp/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeToken: mfaChallengeToken,
            code: mfaCode,
          }),
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
              ? payload.message
              : "Unable to verify the authenticator code.";
          throw new Error(message);
        }

        window.location.replace(continueTo);
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      const payload: unknown = await response.json();

      if (
        response.ok &&
        typeof payload === "object" &&
        payload !== null &&
        "mfaRequired" in payload &&
        payload.mfaRequired === true &&
        "data" in payload &&
        typeof payload.data === "object" &&
        payload.data !== null &&
        "challengeToken" in payload.data &&
        typeof payload.data.challengeToken === "string"
      ) {
        setMfaChallengeToken(payload.data.challengeToken);
        return;
      }

      if (!response.ok) {
        setError("Unable to sign in with those details.");
        return;
      }

      window.location.replace(continueTo);
    } catch {
      setError("Unable to reach BHID. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <form className="space-y-5" onSubmit={handleSubmit}>
      {mfaChallengeToken ? (
        <div>
          <p className="text-sm text-white">
            Enter the six-digit code from your authenticator app.
          </p>
          <label
            className="mt-4 block text-sm font-medium text-white"
            htmlFor="mfa-code"
          >
            Authenticator code
          </label>
          <input
            autoComplete="one-time-code"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="mfa-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            pattern="\d{6}"
            required
            value={mfaCode}
          />
          <button
            className="mt-3 text-sm text-white underline"
            onClick={() => {
              setMfaChallengeToken("");
              setMfaCode("");
            }}
            type="button"
          >
            Use a different sign-in method
          </button>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white placeholder:text-zinc-400"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white" htmlFor="password">
              Password
            </label>
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white placeholder:text-zinc-400"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>
        </>
      )}
      {error ? (
        <p aria-live="polite" className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
        <button
          className="rounded-md bg-white px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
          disabled={isSubmitting || (Boolean(mfaChallengeToken) && mfaCode.length !== 6)}
          type="submit"
        >
          {isSubmitting
            ? mfaChallengeToken
              ? "Verifying…"
              : "Signing in..."
            : mfaChallengeToken
              ? "Verify and sign in"
              : "Sign in"}
        </button>
      </form>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wide text-white">or</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <button
        className="w-full rounded-md border border-gray-300 px-4 py-2 font-medium disabled:opacity-60"
        disabled={isSubmitting}
        onClick={() => void handlePasskeySignIn()}
        type="button"
      >
        Sign in with a passkey
      </button>
      <p className="text-center text-sm text-white">
        New to BHID?{" "}
        <Link className="font-medium text-white underline" href="/register">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function isAuthenticationOptions(
  value: unknown
): value is {
  data: {
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  };
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null ||
    !("challengeId" in value.data) ||
    typeof value.data.challengeId !== "string" ||
    !("options" in value.data) ||
    typeof value.data.options !== "object" ||
    value.data.options === null
  ) {
    return false;
  }

  return (
    "challenge" in value.data.options &&
    typeof value.data.options.challenge === "string" &&
    "rpId" in value.data.options &&
    typeof value.data.options.rpId === "string"
  );
}
