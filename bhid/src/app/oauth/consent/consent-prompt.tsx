"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AccountAvatar from "@/components/account-avatar";

type ConsentData = {
  applicationName: string;
  scopes: string[];
  account: {
    bhid: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
};

type ConsentPromptProps = {
  requestId: string;
};

const scopeDescriptions: Record<string, string> = {
  openid: "Sign in with BHID (required)",
  email: "View your email address and verification status",
  profile:
    "View your display name, username, profile picture, bio, and date of birth",
  bhid: "View your BHID identifier",
  verification:
    "View your BHID verification level and tier",
  wallet:
    "View your linked wallet addresses and whether they are verified",
  membership: "View your BHID paid membership tier and expiry",
};

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ConsentPrompt({
  requestId,
}: ConsentPromptProps) {
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [error, setError] = useState(
    REQUEST_ID_PATTERN.test(requestId)
      ? ""
      : "This authorization request is invalid or has expired."
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      return;
    }

    let cancelled = false;

    async function loadConsent() {
      try {
        const response = await fetch(
          `/api/oauth/consent?request_id=${encodeURIComponent(requestId)}`,
          { credentials: "same-origin" }
        );

        if (!response.ok) {
          throw new Error("Consent request unavailable");
        }

        const data = (await response.json()) as ConsentData;

        if (!cancelled) {
          setConsent(data);
          setSelectedScopes(data.scopes);
        }
      } catch {
        if (!cancelled) {
          setError(
            "This request is no longer available. Sign in again or restart from the application."
          );
        }
      }
    }

    void loadConsent();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function decide(decision: "approve" | "deny") {
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/oauth/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          decision,
          scopes: selectedScopes,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save consent");
      }

      const result = (await response.json()) as {
        redirectUrl?: string;
      };

      if (!result.redirectUrl) {
        throw new Error("Invalid consent response");
      }

      window.location.assign(result.redirectUrl);
    } catch {
      setError("Unable to complete this request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-live="polite"
      className="mt-8 rounded-lg border border-gray-200 p-6"
    >
      {consent ? (
        <>
          <div className="mt-5 flex items-center gap-4 rounded-lg border border-gray-200 p-4">
            <AccountAvatar
              avatarUrl={consent.account.avatarUrl}
              displayName={
                consent.account.displayName ||
                consent.account.username ||
                "BHID account"
              }
              size={64}
            />
            <div className="min-w-0">
              <Link
                className="font-semibold text-indigo-700 underline"
                href="/settings/profile"
              >
                {consent.account.displayName ||
                  (consent.account.username
                    ? `@${consent.account.username}`
                    : "Your BHID account")}
              </Link>
              {consent.account.displayName && consent.account.username ? (
                <p className="text-sm text-gray-600">
                  @{consent.account.username}
                </p>
              ) : null}
              <p className="mt-1 break-all font-mono text-xs text-gray-600">
                BHID ID: {consent.account.bhid}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Click your name to manage this profile. Click the picture to
                enlarge it.
              </p>
            </div>
          </div>
          <p className="font-medium">
            <span className="font-semibold">{consent.applicationName}</span>{" "}
            requests access to the following:
          </p>
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Choose information to share</legend>
            {consent.scopes.map((scope) => (
              <label
                className="flex items-start gap-3 rounded-md border border-gray-200 p-3"
                key={scope}
              >
                <input
                  checked={selectedScopes.includes(scope)}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                  disabled={scope === "openid" || busy}
                  onChange={(event) => {
                    setSelectedScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((selected) => selected !== scope)
                    );
                  }}
                  type="checkbox"
                />
                <span>
                  {scopeDescriptions[scope] ?? `Access to ${scope}`}
                  {scope === "openid" ? (
                    <span className="mt-1 block text-xs text-gray-500">
                      This permission is required to sign in.
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-sm text-gray-600">
            Only checked information will be shared. You can uncheck optional
            items and still sign in.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60"
              disabled={busy || !selectedScopes.includes("openid")}
              onClick={() => void decide("approve")}
              type="button"
            >
              Allow access
            </button>
            <button
              className="rounded-md border border-gray-300 px-4 py-2 font-medium disabled:opacity-60"
              disabled={busy}
              onClick={() => void decide("deny")}
              type="button"
            >
              Deny
            </button>
          </div>
        </>
      ) : null}
      {!consent && !error ? <p>Loading request...</p> : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
