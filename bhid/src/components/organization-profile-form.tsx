"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function OrganizationProfileForm({
  organizationId,
  initialName,
}: {
  organizationId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error("Unable to update the organization profile.");
      }
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the organization profile."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={save}>
      <label className="min-w-60 flex-1 text-sm text-zinc-300">
        Organization name
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <button
        className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
        disabled={busy || name.trim() === initialName}
        type="submit"
      >
        {busy ? "Saving…" : "Save profile"}
      </button>
      {error && (
        <p className="w-full text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
