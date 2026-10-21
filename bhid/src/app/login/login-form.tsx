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
  const [showPassword, setShowPassword] = useState(false);

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

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to sign in with those details.";
        setError(message);
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
          <div className="relative mt-1">
            <input
              autoComplete="current-password"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 pr-12 text-white placeholder:text-zinc-400"
              id="password"
              name="password"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-3 text-zinc-300 hover:text-white"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <div className="text-right">
          <Link className="text-sm text-white underline" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
      {error ? (
        <p aria-live="polite" className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
        <button
          className="rounded-md bg-white px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
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

function EyeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="m3 3 18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.8 15.8 0 0 1-3 3.5M6.2 6.9C3.8 8.3 2.5 12 2.5 12s3.4 6 9.5 6c1.1 0 2.1-.2 3-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
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
