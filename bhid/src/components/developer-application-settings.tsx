"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const OPTIONAL_SCOPES = [
  ["email", "Email address and email-verification state"],
  ["profile", "Display name, username, and profile picture"],
  ["bhid", "Human-facing BHID identifier"],
  ["verification", "Identity verification level"],
  ["wallet", "Linked wallet address and ownership status"],
  ["membership", "Paid membership tier and expiry"],
] as const;

type ApplicationDetails = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  clientId: string;
  redirectUris: string[];
  allowedScopes: string[];
  status: string;
  clientType: string;
  createdAt: string;
  discoveryUrl: string;
};

type Props = { application: ApplicationDetails };

function apiError(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    if (payload.error === "invalid_application") {
      return "Check the application details, callback URLs, and scopes.";
    }
  }
  return "The request could not be completed.";
}

export default function DeveloperApplicationSettings({ application }: Props) {
  const [name, setName] = useState(application.name);
  const [description, setDescription] = useState(application.description ?? "");
  const [redirectUris, setRedirectUris] = useState(
    application.redirectUris.join("\n")
  );
  const [allowedScopes, setAllowedScopes] = useState(application.allowedScopes);
  const [status, setStatus] = useState(application.status);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleScope(scope: string) {
    setAllowedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    );
  }

  async function updateApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/developer/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          redirectUris: redirectUris.split(/\r?\n/).map((uri) => uri.trim()).filter(Boolean),
          allowedScopes,
          status,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload));
      setMessage("Application settings saved.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function rotateSecret() {
    if (!window.confirm("Rotate the client secret? The old secret will stop working immediately.")) {
      return;
    }

    setError("");
    setMessage("");
    setSecret("");
    try {
      const response = await fetch(
        `/api/developer/applications/${application.id}/secret`,
        { method: "POST" }
      );
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("clientSecret" in payload) ||
        typeof payload.clientSecret !== "string"
      ) {
        throw new Error(apiError(payload));
      }
      setSecret(payload.clientSecret);
      setMessage("Secret rotated. Save the new value now.");
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : "Unable to rotate the secret.");
    }
  }

  async function deactivateApplication() {
    if (!window.confirm("Deactivate this client? BHID will stop accepting authorization requests for it.")) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/developer/applications/${application.id}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload));
      setStatus("INACTIVE");
      setMessage("Application deactivated.");
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate this application.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Client configuration</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Use BHID&apos;s discovery document to configure your OIDC library:
          {" "}
          <a
            className="break-all text-indigo-300 underline"
            href={application.discoveryUrl}
            rel="noreferrer"
            target="_blank"
          >
            {application.discoveryUrl}
          </a>
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-400">Client ID</dt><dd className="mt-1 break-all font-mono">{application.clientId}</dd></div>
          <div><dt className="text-zinc-400">Client type</dt><dd className="mt-1">{application.clientType.toLowerCase()}</dd></div>
          <div><dt className="text-zinc-400">Slug</dt><dd className="mt-1 font-mono">{application.slug}</dd></div>
          <div><dt className="text-zinc-400">Created</dt><dd className="mt-1">{new Date(application.createdAt).toLocaleDateString()}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Edit application</h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void updateApplication(event)}>
          <label className="block text-sm">
            Application name
            <input className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2" maxLength={128} onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label className="block text-sm">
            Description
            <textarea className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2" maxLength={1000} onChange={(event) => setDescription(event.target.value)} rows={2} value={description} />
          </label>
          <label className="block text-sm">
            Callback URLs (one exact URL per line)
            <textarea className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs" onChange={(event) => setRedirectUris(event.target.value)} required rows={4} value={redirectUris} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Permitted optional scopes</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_SCOPES.map(([scope, detail]) => (
                <label className="flex items-start gap-2 text-xs text-zinc-300" key={scope}>
                  <input checked={allowedScopes.includes(scope)} onChange={() => toggleScope(scope)} type="checkbox" />
                  <span><span className="font-mono">{scope}</span> — {detail}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            Client status
            {status === "SUSPENDED" ? (
              <span className="mt-1 block text-amber-200">
                Suspended by BHID support; only support can restore it.
              </span>
            ) : (
              <select className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2" onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            )}
          </label>
          {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-300" role="status">{message}</p> : null}
          <button className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50" disabled={saving} type="submit">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {application.clientType === "CONFIDENTIAL" ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold">Client secret</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Secret rotation invalidates the previous value immediately. Store
            the replacement in your server-side secret manager.
          </p>
          <button className="mt-4 rounded-md border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => void rotateSecret()} type="button">
            Rotate client secret
          </button>
          {secret ? <p className="mt-4 break-all rounded bg-amber-950 p-3 font-mono text-sm text-amber-100">{secret}</p> : null}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-900/70 bg-red-950/20 p-6">
        <div>
          <h2 className="font-semibold">Deactivate application</h2>
          <p className="mt-1 text-sm text-zinc-400">
            This disables new authorizations without deleting audit and consent data.
          </p>
        </div>
        <button className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950 disabled:opacity-50" disabled={status === "INACTIVE"} onClick={() => void deactivateApplication()} type="button">
          Deactivate
        </button>
      </section>

      <Link className="text-sm text-zinc-400 hover:text-white" href="/developers">
        ← Back to applications
      </Link>
    </div>
  );
}
