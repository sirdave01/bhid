"use client";

import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";

type Passkey = {
  id: string;
  label: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPasskey(value: unknown): value is Passkey {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.deviceType === "singleDevice" ||
      value.deviceType === "multiDevice") &&
    typeof value.backedUp === "boolean" &&
    typeof value.createdAt === "string" &&
    (typeof value.lastUsedAt === "string" || value.lastUsedAt === null)
  );
}

function isPasskeyList(value: unknown): value is { data: { passkeys: Passkey[] } } {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    Array.isArray(value.data.passkeys) &&
    value.data.passkeys.every(isPasskey)
  );
}

function isRegistrationOptions(
  value: unknown
): value is {
  data: {
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  };
} {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.challengeId === "string" &&
    isRecord(value.data.options) &&
    typeof value.data.options.challenge === "string" &&
    isRecord(value.data.options.rp) &&
    typeof value.data.options.rp.id === "string" &&
    isRecord(value.data.options.user) &&
    typeof value.data.options.user.id === "string"
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [label, setLabel] = useState("Passkey");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    setError(null);

    try {
      const response = await fetch("/api/auth/passkeys", {
        cache: "no-store",
      });
      const payload: unknown = await response.json();

      if (response.status === 401) {
        throw new Error("Sign in to manage your passkeys.");
      }

      if (!response.ok || !isPasskeyList(payload)) {
        throw new Error("Unable to load your passkeys. Please try again.");
      }

      setPasskeys(payload.data.passkeys);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your passkeys. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/auth/passkeys", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();

        if (response.status === 401) {
          throw new Error("Sign in to manage your passkeys.");
        }

        if (!response.ok || !isPasskeyList(payload)) {
          throw new Error("Unable to load your passkeys. Please try again.");
        }

        return payload.data.passkeys;
      })
      .then(setPasskeys)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your passkeys. Please try again."
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

  async function addPasskey() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const optionsResponse = await fetch(
        "/api/auth/passkeys/register/options",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }
      );
      const optionsPayload: unknown = await optionsResponse.json();

      if (!optionsResponse.ok || !isRegistrationOptions(optionsPayload)) {
        throw new Error("Unable to start passkey registration.");
      }

      const credential = await startRegistration({
        optionsJSON: optionsPayload.data.options,
      });
      const verifyResponse = await fetch(
        "/api/auth/passkeys/register/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: optionsPayload.data.challengeId,
            response: credential,
          }),
        }
      );
      const verifyPayload: unknown = await verifyResponse.json();

      if (!verifyResponse.ok) {
        const message =
          isRecord(verifyPayload) && typeof verifyPayload.message === "string"
            ? verifyPayload.message
            : "Unable to save this passkey.";
        throw new Error(message);
      }

      setNotice("Passkey added to your account.");
      await loadPasskeys();
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "Passkey registration failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(passkey: Passkey) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/auth/passkeys/${encodeURIComponent(passkey.id)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Unable to remove this passkey. Please try again.");
      }

      setPasskeys((current) =>
        current.filter((item) => item.id !== passkey.id)
      );
      setNotice("Passkey removed.");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this passkey. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="passkeys-heading"
      className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm"
    >
      <h2
        id="passkeys-heading"
        className="text-xl font-semibold tracking-tight"
      >
        Passkeys
      </h2>
      <p className="mt-1 text-sm text-zinc-300">
        Passkeys use your device’s screen lock or security key. BHID stores
        only the public credential needed to verify sign-ins.
      </p>

      {error && (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-300" role="status">
          Loading passkeys…
        </p>
      ) : passkeys.length === 0 ? (
        <p className="mt-5 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
          No passkeys are registered yet.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-zinc-700">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-white">{passkey.label}</p>
                <p className="mt-1 text-sm text-zinc-300">
                  {passkey.deviceType === "multiDevice"
                    ? "Synced passkey"
                    : "Device-bound passkey"}
                  {passkey.backedUp ? " · Backed up" : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Added {formatDate(passkey.createdAt)}
                  {passkey.lastUsedAt
                    ? ` · Last used ${formatDate(passkey.lastUsedAt)}`
                    : ""}
                </p>
              </div>
              <button
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => void removePasskey(passkey)}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="passkey-label">
          Passkey name
        </label>
        <input
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          id="passkey-label"
          maxLength={50}
          onChange={(event) => setLabel(event.target.value)}
          value={label}
        />
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || loading || label.trim().length === 0}
          onClick={() => void addPasskey()}
          type="button"
        >
          {busy ? "Working…" : "Add a passkey"}
        </button>
      </div>
    </section>
  );
}
