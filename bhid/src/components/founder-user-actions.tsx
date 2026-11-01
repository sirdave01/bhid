"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserAction = "suspend" | "unsuspend" | "delete" | "restore";

type FounderUserActionsProps = {
  userId: string;
  status: string;
};

function getActionLabel(action: UserAction) {
  switch (action) {
    case "suspend":
      return "Suspend";
    case "unsuspend":
      return "Unsuspend";
    case "delete":
      return "Delete";
    case "restore":
      return "Restore";
  }
}

function getConfirmationMessage(action: UserAction) {
  switch (action) {
    case "suspend":
      return "Suspend this account? Its active sessions will be revoked.";
    case "unsuspend":
      return "Unsuspend this account? The user will be able to sign in again.";
    case "delete":
      return "Mark this account as deleted? Its sessions will be revoked and it will no longer be able to sign in. Account data will be retained.";
    case "restore":
      return "Restore this deleted account and allow it to sign in again?";
  }
}

export default function FounderUserActions({
  userId,
  status,
}: FounderUserActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const actions: UserAction[] =
    status === "ACTIVE"
      ? ["suspend", "delete"]
      : status === "SUSPENDED"
        ? ["unsuspend", "delete"]
        : status === "DELETED"
          ? ["restore"]
          : [];

  async function runAction(action: UserAction) {
    if (!window.confirm(getConfirmationMessage(action))) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/founder/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("success" in payload) ||
        payload.success !== true
      ) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to update this account.";
        throw new Error(message);
      }

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this account."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-36 flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            key={action}
            onClick={() => void runAction(action)}
            type="button"
          >
            {busy ? "Working…" : getActionLabel(action)}
          </button>
        ))}
        {actions.length === 0 && <span className="text-zinc-500">—</span>}
      </div>
      {error && (
        <p className="max-w-48 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
