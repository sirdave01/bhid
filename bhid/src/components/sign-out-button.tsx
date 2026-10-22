"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to sign out. Please try again.";
        throw new Error(message);
      }

      window.location.replace("/");
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out. Please try again."
      );
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-white hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-60"
        disabled={signingOut}
        onClick={() => void signOut()}
        type="button"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p className="mt-1 max-w-48 text-right text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
