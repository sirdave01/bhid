"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function OrganizationCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
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
          code === "slug_already_exists"
            ? "That organization URL is already in use."
            : code === "verified_email_required"
              ? "Verify your email before creating an organization."
              : "Unable to create the organization."
        );
      }

      setName("");
      setSlug("");
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create the organization."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm text-zinc-300">
        Organization name
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="text-sm text-zinc-300">
        Organization URL slug
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          maxLength={80}
          onChange={(event) =>
            setSlug(
              event.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "")
                .replace(/-{2,}/g, "-")
            )
          }
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
          value={slug}
        />
      </label>
      <button
        className="w-fit rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50 sm:col-span-2"
        disabled={busy}
        type="submit"
      >
        {busy ? "Creating…" : "Create organization"}
      </button>
      {error && (
        <p className="text-sm text-red-300 sm:col-span-2" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
