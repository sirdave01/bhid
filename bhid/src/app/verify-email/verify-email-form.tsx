"use client";

import { useState } from "react";

export default function VerifyEmailForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verifyEmail() {
    setBusy(true);
    setMessage("");

    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");

      if (!token) {
        throw new Error("This link is missing its verification token.");
      }

      window.history.replaceState(null, "", window.location.pathname);
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        throw new Error("Unable to verify your email right now");
      }

      setMessage(payload.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify your email right now"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {message && (
        <p
          aria-live="polite"
          className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-white"
          role="status"
        >
          {message}
        </p>
      )}
      <button
        className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy}
        onClick={() => void verifyEmail()}
        type="button"
      >
        {busy ? "Verifying…" : "Confirm email address"}
      </button>
    </div>
  );
}
