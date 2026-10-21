"use client";

import { useEffect, useState } from "react";

type TotpSetup = {
  secret: string;
  otpauthUri: string;
};

function isTotpSetup(value: unknown): value is { data: TotpSetup } {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "secret" in value.data &&
    typeof value.data.secret === "string" &&
    "otpauthUri" in value.data &&
    typeof value.data.otpauthUri === "string"
  );
}

export default function TotpManager() {
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshStatus(signal?: AbortSignal) {
    const response = await fetch("/api/auth/mfa/totp", {
      cache: "no-store",
      signal,
    });
    const payload: unknown = await response.json();

    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      !("data" in payload) ||
      typeof payload.data !== "object" ||
      payload.data === null ||
      !("enabled" in payload.data) ||
      typeof payload.data.enabled !== "boolean"
    ) {
      throw new Error("Unable to check authenticator MFA status.");
    }

    setEnabled(payload.data.enabled);
  }

  useEffect(() => {
    const controller = new AbortController();

    void refreshStatus(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to check authenticator MFA status."
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

  async function startSetup() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/mfa/totp/setup", {
        method: "POST",
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isTotpSetup(payload)) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to set up authenticator MFA.";
        throw new Error(errorMessage);
      }

      setSetup(payload.data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to set up authenticator MFA."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to update authenticator MFA.";
        throw new Error(errorMessage);
      }

      setMessage(payload.message);
      setCode("");
      setSetup(null);
      await refreshStatus();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update authenticator MFA."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">
        Authenticator MFA
      </h2>
      <p className="mt-1 text-sm text-zinc-300">
        Password sign-ins require a time-based code when enabled. Passkey
        sign-in remains available as an alternative.
      </p>
      {setup && (
        <div className="mt-5 space-y-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
          <p className="text-sm text-zinc-200">
            Add this key to your authenticator app, then enter its current
            six-digit code to confirm setup. The key is shown only during setup.
          </p>
          <code className="block break-all rounded-lg bg-black p-3 text-sm text-white">
            {setup.secret}
          </code>
          <a
            className="inline-block text-sm text-white underline"
            href={setup.otpauthUri}
          >
            Open authenticator app
          </a>
        </div>
      )}
      {(setup || enabled) && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="totp-code">
            Authenticator code
          </label>
          <input
            autoComplete="one-time-code"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="totp-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            pattern="\d{6}"
            placeholder="6-digit code"
            value={code}
          />
          {setup ? (
            <button
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
              disabled={busy || code.length !== 6}
              onClick={() => void submitCode("/api/auth/mfa/totp/confirm", "POST")}
              type="button"
            >
              Confirm setup
            </button>
          ) : (
            <button
              className="rounded-lg border border-zinc-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy || code.length !== 6}
              onClick={() => void submitCode("/api/auth/mfa/totp", "DELETE")}
              type="button"
            >
              Disable MFA
            </button>
          )}
        </div>
      )}
      {!enabled && !setup && (
        <button
          className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          disabled={busy || loading}
          onClick={() => void startSetup()}
          type="button"
        >
          {loading ? "Checking status…" : "Set up authenticator"}
        </button>
      )}
      {enabled && !setup && (
        <p className="mt-4 text-sm text-emerald-300">MFA is enabled.</p>
      )}
      {message && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-200" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
