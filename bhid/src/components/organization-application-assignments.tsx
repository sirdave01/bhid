"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Developer = {
  userId: string;
  email: string;
};

export default function OrganizationApplicationAssignments({
  organizationId,
  applicationId,
  developers,
  assignedUserIds,
}: {
  organizationId: string;
  applicationId: string;
  developers: Developer[];
  assignedUserIds: string[];
}) {
  const router = useRouter();
  const [busyUser, setBusyUser] = useState("");
  const [error, setError] = useState("");

  async function setAssignment(userId: string, assigned: boolean) {
    setBusyUser(userId);
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/applications/${applicationId}/members`,
        {
          method: assigned ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
      if (!response.ok) {
        throw new Error("Unable to update this application assignment.");
      }
      router.refresh();
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : "Unable to update this application assignment."
      );
    } finally {
      setBusyUser("");
    }
  }

  if (!developers.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-zinc-800 p-3">
      <p className="text-xs font-medium text-zinc-300">Assigned developers</p>
      <ul className="mt-2 space-y-2">
        {developers.map((developer) => {
          const assigned = assignedUserIds.includes(developer.userId);
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400"
              key={developer.userId}
            >
              <span>{developer.email}</span>
              <button
                className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                disabled={Boolean(busyUser)}
                onClick={() =>
                  void setAssignment(developer.userId, assigned)
                }
                type="button"
              >
                {busyUser === developer.userId
                  ? "Saving…"
                  : assigned
                    ? "Unassign"
                    : "Assign"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
