"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptOrganizationInvitation({
  token,
}: {
  token: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/invitations/${token}`,
        { method: "POST" }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "";
        throw new Error(
          code === "invitation_email_mismatch"
            ? "Sign in with the email address that received this invitation."
            : "This invitation is no longer available."
        );
      }

      router.replace("/organizations");
      router.refresh();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Unable to accept this invitation."
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        disabled={busy}
        onClick={() => void accept()}
        type="button"
      >
        {busy ? "Accepting…" : "Accept invitation"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
