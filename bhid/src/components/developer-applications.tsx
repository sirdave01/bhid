"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { OPTIONAL_OAUTH_SCOPE_GROUPS } from "@/lib/oauth-scopes";

type ApplicationSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  client_id: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  status: string;
  client_type: string;
};

type NewClientSecret = {
  clientId: string;
  clientSecret: string;
};

function readMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = payload.error;
    if (error === "email_verification_required") {
      return "Verify your BHID email address in Security Settings before managing OAuth applications.";
    }
    if (error === "slug_already_exists") return "That application slug is already in use.";
    if (error === "application_limit_reached") return "You can register up to 20 applications.";
    if (error === "invalid_application") return "Check the application details and callback URLs.";
  }

  return "The request could not be completed. Please try again.";
}

export default function DeveloperApplications() {
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdCredentials, setCreatedCredentials] =
    useState<NewClientSecret | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [clientType, setClientType] = useState("CONFIDENTIAL");
  const [redirectUris, setRedirectUris] = useState("");
  const [allowedScopes, setAllowedScopes] = useState<string[]>([
    "email",
    "profile",
  ]);

  async function loadApplications(signal?: AbortSignal) {
    const response = await fetch("/api/developer/applications", {
      cache: "no-store",
      signal,
    });
    const payload: unknown = await response.json();

    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      !("applications" in payload) ||
      !Array.isArray(payload.applications)
    ) {
      throw new Error(readMessage(payload));
    }

    setApplications(payload.applications as ApplicationSummary[]);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      try {
        await loadApplications(controller.signal);
      } catch (loadError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load applications."
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void initialize();

    return () => controller.abort();
  }, []);

  function toggleScope(scope: string) {
    setAllowedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    );
  }

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreatedCredentials(null);
    setSaving(true);

    try {
      const response = await fetch("/api/developer/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          clientType,
          redirectUris: redirectUris
            .split(/\r?\n/)
            .map((uri) => uri.trim())
            .filter(Boolean),
          allowedScopes,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok || typeof payload !== "object" || payload === null) {
        throw new Error(readMessage(payload));
      }

      if (
        "application" in payload &&
        typeof payload.application === "object" &&
        payload.application !== null
      ) {
        setApplications((current) => [
          payload.application as ApplicationSummary,
          ...current,
        ]);
      }

      if (
        "clientSecret" in payload &&
        typeof payload.clientSecret === "string" &&
        "application" in payload &&
        typeof payload.application === "object" &&
        payload.application !== null &&
        "client_id" in payload.application &&
        typeof payload.application.client_id === "string"
      ) {
        setCreatedCredentials({
          clientId: payload.application.client_id,
          clientSecret: payload.clientSecret,
        });
      }

      setName("");
      setSlug("");
      setDescription("");
      setRedirectUris("");
      await loadApplications();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create the application."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Your applications</h2>
        {loading ? (
          <p className="mt-4 text-sm text-zinc-400">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">
            You have not registered an OAuth application yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-800">
            {applications.map((application) => (
              <li className="py-4" key={application.id}>
                <Link
                  className="font-medium text-white hover:underline"
                  href={`/developers/${application.id}`}
                >
                  {application.name}
                </Link>
                <p className="mt-1 break-all font-mono text-xs text-zinc-400">
                  {application.client_id}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {application.client_type.toLowerCase()} ·{" "}
                  {application.status.toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Register an application</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Production callbacks must use HTTPS. Exact callback matching is
          enforced.
        </p>
        <form className="mt-5 space-y-4" onSubmit={(event) => void createApplication(event)}>
          <label className="block text-sm">
            Application name
            <input
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              maxLength={128}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="block text-sm">
            Unique slug
            <input
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              maxLength={63}
              onChange={(event) =>
                setSlug(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                )
              }
              pattern="[a-z0-9][a-z0-9-]{1,62}"
              required
              value={slug}
            />
          </label>
          <label className="block text-sm">
            Description
            <textarea
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </label>
          <label className="block text-sm">
            Client type
            <select
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
              onChange={(event) => setClientType(event.target.value)}
              value={clientType}
            >
              <option value="CONFIDENTIAL">Confidential (server-side)</option>
              <option value="PUBLIC">Public client (PKCE, no client secret)</option>
            </select>
          </label>
          <label className="block text-sm">
            Callback URLs (one exact URL per line)
            <textarea
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs"
              onChange={(event) => setRedirectUris(event.target.value)}
              placeholder={"https://example.com/auth/bhid/callback\nhttp://localhost:3000/auth/bhid/callback"}
              required
              rows={3}
              value={redirectUris}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Permitted optional scopes</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {OPTIONAL_OAUTH_SCOPE_GROUPS.map((group) => (
                <fieldset
                  className="rounded-lg border border-zinc-800 p-3"
                  key={group.label}
                >
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {group.label} scopes
                  </legend>
                  <div className="space-y-2">
                    {group.scopes.map(([scope, detail]) => (
                      <label
                        className="flex items-start gap-2 text-xs text-zinc-300"
                        key={scope}
                      >
                        <input
                          checked={allowedScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                          type="checkbox"
                          value={scope}
                        />
                        <span>
                          <span className="font-mono">{scope}</span> — {detail}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </fieldset>
          {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
          <button
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving ? "Registering…" : "Register application"}
          </button>
        </form>
      </section>

      {createdCredentials ? (
        <section className="rounded-xl border border-amber-700 bg-amber-950/40 p-6 lg:col-span-2">
          <h2 className="font-semibold">Save this client secret now</h2>
          <p className="mt-2 text-sm text-amber-100">
            BHID will not display this secret again. Store it in your
            application&apos;s server-side secret manager.
          </p>
          <dl className="mt-4 space-y-2 break-all font-mono text-sm">
            <div><dt className="text-amber-200">Client ID</dt><dd>{createdCredentials.clientId}</dd></div>
            <div><dt className="text-amber-200">Client secret</dt><dd>{createdCredentials.clientSecret}</dd></div>
          </dl>
          <button
            className="mt-4 rounded-md border border-amber-600 px-3 py-2 text-sm"
            onClick={() => setCreatedCredentials(null)}
            type="button"
          >
            I saved it
          </button>
        </section>
      ) : null}
    </div>
  );
}
