"use client";

import { useEffect, useState } from "react";

type ConsentData = {
  applicationName: string;
  scopes: string[];
};

type ConsentPromptProps = {
  requestId: string;
};

const scopeDescriptions: Record<string, string> = {
  openid: "Confirm your BHID identity",
  email: "View your email address and verification status",
  profile: "View your display name, username, and profile picture",
  bhid: "View your BHID identifier",
};

export default function ConsentPrompt({
  requestId,
}: ConsentPromptProps) {
  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      setError("This authorization request is invalid or has expired.");
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
        body: JSON.stringify({ requestId, decision }),
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
          <p className="font-medium">
            <span className="font-semibold">{consent.applicationName}</span>{" "}
            requests access to:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6">
            {consent.scopes.map((scope) => (
              <li key={scope}>
                {scopeDescriptions[scope] ?? `Access to ${scope}`}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60"
              disabled={busy}
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
