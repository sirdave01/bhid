"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FounderOrganizationStatus({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nextStatus = status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";

  async function updateStatus() {
    const action = nextStatus === "SUSPENDED" ? "suspend" : "reactivate";
    if (
      busy ||
      !window.confirm(
        `Confirm you want to ${action} this organization?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/founder/organizations/${organizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      if (!response.ok) {
        throw new Error("Unable to update organization status.");
      }
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update organization status."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
        disabled={busy}
        onClick={() => void updateStatus()}
        type="button"
      >
        {busy
          ? "Saving…"
          : nextStatus === "SUSPENDED"
            ? "Suspend"
            : "Reactivate"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
