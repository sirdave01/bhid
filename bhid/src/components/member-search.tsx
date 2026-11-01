"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

type MemberSearchResult = {
  bhid: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function isMemberSearchResult(value: unknown): value is MemberSearchResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "bhid" in value &&
    typeof value.bhid === "string" &&
    "username" in value &&
    (typeof value.username === "string" || value.username === null) &&
    "displayName" in value &&
    (typeof value.displayName === "string" || value.displayName === null) &&
    "avatarUrl" in value &&
    (typeof value.avatarUrl === "string" || value.avatarUrl === null)
  );
}

function getErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return "Unable to search for people right now.";
}

export default function MemberSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const searchTerm = query.trim();

    if (searchTerm.length < 3) {
      setResults(null);
      setError("Enter at least 3 characters to search.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/users/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchTerm }),
      });
      const payload: unknown = await response.json();

      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("success" in payload) ||
        payload.success !== true ||
        !("data" in payload) ||
        typeof payload.data !== "object" ||
        payload.data === null ||
        !("users" in payload.data) ||
        !Array.isArray(payload.data.users) ||
        !payload.data.users.every(isMemberSearchResult)
      ) {
        throw new Error(getErrorMessage(payload));
      }

      setResults(payload.data.users);
    } catch (searchError) {
      setResults(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Unable to search for people right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => void search(event)}
        role="search"
      >
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="member-search">
            Username, email, or full name
          </label>
          <input
            autoComplete="off"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
            id="member-search"
            maxLength={100}
            minLength={3}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter at least 3 characters"
            type="search"
            value={query}
          />
        </div>
        <button
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <section
        aria-label="Member search results"
        aria-live="polite"
        className="rounded-xl border border-zinc-800 bg-zinc-900"
      >
        {error ? (
          <p className="px-5 py-6 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : results === null ? (
          <p className="px-5 py-6 text-sm text-zinc-400">
            Search for someone to see whether they have joined BHID.
          </p>
        ) : results.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-400">
            No matching active, email-verified accounts found.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {results.map((user) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                key={user.bhid}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar
                    avatarUrl={user.avatarUrl}
                    label={user.displayName || user.username || user.bhid}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {user.displayName || user.username || user.bhid}
                    </p>
                    {user.username && (
                      <p className="mt-1 truncate text-sm text-zinc-400">
                        @{user.username}
                      </p>
                    )}
                  </div>
                </div>
                <p className="font-mono text-xs text-zinc-500">{user.bhid}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function MemberAvatar({
  avatarUrl,
  label,
}: {
  avatarUrl: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = label.trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      aria-label={`${label}'s profile picture`}
      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-lg font-semibold text-zinc-200"
      role="img"
    >
      {avatarUrl && !failed ? (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="48px"
          src={avatarUrl}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}
