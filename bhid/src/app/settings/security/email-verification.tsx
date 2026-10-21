"use client";

import { useEffect, useState } from "react";

export default function EmailVerification() {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/auth/me", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();

        if (
          !response.ok ||
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload) ||
          typeof payload.data !== "object" ||
          payload.data === null ||
          !("emailVerified" in payload.data) ||
          typeof payload.data.emailVerified !== "boolean"
        ) {
          throw new Error(
            response.status === 401
              ? "Sign in to manage email verification."
              : "Unable to check email verification."
          );
        }

        setVerified(payload.data.emailVerified);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to check email verification."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  async function requestVerification() {
    setSending(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/email/verification", {
        method: "POST",
      });
      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        throw new Error("Unable to request email verification.");
      }

      if (!response.ok) {
        throw new Error(payload.message);
      }

      setMessage(payload.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to request email verification."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">Email verification</h2>
      <p className="mt-1 text-sm text-zinc-300">
        {verified
          ? "Your email address is verified."
          : "Verify your email address using a one-time link."}
      </p>
      {!verified && (
        <button
          className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          disabled={loading || sending}
          onClick={() => void requestVerification()}
          type="button"
        >
          {loading
            ? "Checking status…"
            : sending
              ? "Sending link…"
              : "Send verification link"}
        </button>
      )}
      {message && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-200" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
