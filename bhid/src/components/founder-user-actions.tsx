"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserAction =
  | "suspend"
  | "unsuspend"
  | "delete"
  | "restore"
  | "permanently_delete";

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
    case "permanently_delete":
      return "Delete permanently";
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
    case "permanently_delete":
      return "Permanently delete this account and its associated data? This cannot be undone.";
  }
}

export default function FounderUserActions({
  userId,
  status,
}: FounderUserActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const actions: UserAction[] =
    status === "ACTIVE"
      ? ["suspend", "delete", "permanently_delete"]
      : status === "SUSPENDED"
        ? ["unsuspend", "delete", "permanently_delete"]
        : status === "DELETED"
          ? ["restore", "permanently_delete"]
          : [];

  async function runAction(action: UserAction) {
    if (!window.confirm(getConfirmationMessage(action))) {
      return;
    }

    setBusy(true);
    setError("");
    setWarning("");

    try {
      const response = await fetch(`/api/founder/users/${userId}`, {
        method: action === "permanently_delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action === "permanently_delete"
          ? {}
          : { body: JSON.stringify({ action }) }),
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

      if (
        action === "permanently_delete" &&
        "avatarCleanupWarning" in payload &&
        payload.avatarCleanupWarning === true
      ) {
        setWarning(
          "Account deleted, but its profile image could not be removed."
        );
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
            className={`rounded border px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              action === "permanently_delete"
                ? "border-red-300 text-red-800 hover:bg-red-50"
                : "border-zinc-300 text-zinc-800 hover:bg-zinc-100"
            }`}
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
      {warning && (
        <p className="max-w-48 text-xs text-amber-700" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}
