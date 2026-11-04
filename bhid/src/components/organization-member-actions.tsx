"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  organizationId: string;
  userId: string;
  role: string;
  canManageAdmins: boolean;
};

export default function OrganizationMemberActions({
  organizationId,
  userId,
  role,
  canManageAdmins,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (role === "owner" || (role === "admin" && !canManageAdmins)) {
    return null;
  }

  async function updateRole(nextRole: string) {
    if (nextRole === role || busy) {
      return;
    }
    if (
      nextRole === "owner" &&
      !window.confirm(
        "Transfer organization ownership to this administrator? You will become an administrator."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        }
      );
      if (!response.ok) {
        throw new Error("Unable to update this member’s role.");
      }
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this member’s role."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMember() {
    if (
      busy ||
      !window.confirm("Remove this member from the organization?")
    ) {
      return;
    }
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${userId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error("Unable to remove this member.");
      }
      router.refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this member."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={`Role for ${role}`}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
        disabled={busy}
        onChange={(event) => void updateRole(event.target.value)}
        value={role}
      >
        <option value="developer">Developer</option>
        <option value="member">Member</option>
        {canManageAdmins && <option value="admin">Administrator</option>}
        {canManageAdmins && role === "admin" && (
          <option value="owner">Transfer ownership</option>
        )}
      </select>
      <button
        className="rounded border border-red-900 px-2 py-1 text-xs text-red-200 hover:bg-red-950 disabled:opacity-50"
        disabled={busy}
        onClick={() => void removeMember()}
        type="button"
      >
        Remove
      </button>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
