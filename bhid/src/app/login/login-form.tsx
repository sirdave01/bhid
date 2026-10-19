"use client";

import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { useState, type FormEvent } from "react";

type LoginFormProps = {
  continueTo: string;
};

export default function LoginForm({ continueTo }: LoginFormProps) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {error ? (
        <p aria-live="polite" className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
        <button
          className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wide text-gray-500">or</span>
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
