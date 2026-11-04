"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ApplicationChoice = {
  id: string;
  name: string;
  slug: string;
};

export default function OrganizationApplicationLinkForm({
  organizationId,
  applications,
}: {
  organizationId: string;
  applications: ApplicationChoice[];
}) {
  const router = useRouter();
  const [applicationId, setApplicationId] = useState(
    applications[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function linkApplication() {
    if (!applicationId || busy) {
      return;
    }
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId }),
        }
      );
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "This application is already linked or the organization is unavailable."
            : "Unable to link this application."
        );
      }
      router.refresh();
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Unable to link this application."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!applications.length) {
    return (
      <p className="text-sm text-zinc-400">
        Register an application in the{" "}
        <Link className="underline" href="/developers">
          developer portal
        </Link>{" "}
        before linking it here.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Application to link"
          className="min-w-52 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          onChange={(event) => setApplicationId(event.target.value)}
          value={applicationId}
        >
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.name} (@{application.slug})
            </option>
          ))}
        </select>
        <button
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void linkApplication()}
          type="button"
        >
          {busy ? "Linking…" : "Link application"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
