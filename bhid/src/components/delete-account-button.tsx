"use client";

import { useState } from "react";

export default function DeleteAccountButton() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    if (confirmation !== "DELETE" || !password) {
      setError("Enter your password and type DELETE to confirm.");
      return;
    }

    if (
      !window.confirm(
        "Permanently delete your BHID account and its associated data? This cannot be undone."
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
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
            : "Unable to delete your account.";
        throw new Error(message);
      }

      if (
        "avatarCleanupWarning" in payload &&
        payload.avatarCleanupWarning === true
      ) {
        window.alert(
          "Your account was deleted, but its profile image could not be removed. Please contact support."
        );
      }

      window.location.replace("/?accountDeleted=1");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete your account."
      );
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-12 rounded-xl border border-red-900/80 bg-red-950/30 p-6"
    >
      <h2 className="text-lg font-semibold text-red-200" id="delete-account-heading">
        Permanently delete account
      </h2>
      <p className="mt-2 text-sm text-red-100/80">
        This permanently removes your account, profile, credentials, sessions,
        and associated application registrations. This action cannot be undone.
        Transfer organization ownership before deletion if you are the sole
        owner of any organization.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-zinc-200">
          Current password
          <input
            autoComplete="current-password"
            className="rounded-lg border border-red-900 bg-zinc-950 px-3 py-2 text-white"
            maxLength={256}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-200">
          Type DELETE to confirm
          <input
            autoComplete="off"
            className="rounded-lg border border-red-900 bg-zinc-950 px-3 py-2 text-white"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
      </div>
      <button
        className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || confirmation !== "DELETE" || !password}
        onClick={() => void deleteAccount()}
        type="button"
      >
        {busy ? "Deleting account…" : "Delete my account permanently"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
