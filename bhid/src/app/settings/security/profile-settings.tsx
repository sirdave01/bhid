"use client";

import { useEffect, useState, type FormEvent } from "react";

type Profile = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  dateOfBirth: string;
};

const emptyProfile: Profile = {
  displayName: "",
  username: "",
  bio: "",
  avatarUrl: "",
  dateOfBirth: "",
};

export default function ProfileSettings() {
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/account/profile", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sign in to manage your profile."
              : "Unable to load your profile."
          );
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload) ||
          typeof payload.data !== "object" ||
          payload.data === null
        ) {
          throw new Error("Unable to load your profile.");
        }

        const data = payload.data;
        const values: Profile = {
          displayName:
            "displayName" in data && typeof data.displayName === "string"
              ? data.displayName
              : "",
          username:
            "username" in data && typeof data.username === "string"
              ? data.username
              : "",
          bio: "bio" in data && typeof data.bio === "string" ? data.bio : "",
          avatarUrl:
            "avatarUrl" in data && typeof data.avatarUrl === "string"
              ? data.avatarUrl
              : "",
          dateOfBirth:
            "dateOfBirth" in data && typeof data.dateOfBirth === "string"
              ? data.dateOfBirth
              : "",
        };
        setProfile(values);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load profile"
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        throw new Error("Unable to save your profile");
      }

      if (!response.ok) {
        throw new Error(payload.message);
      }

      setMessage(payload.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save your profile"
      );
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
      <p className="mt-1 text-sm text-zinc-300">
        Manage your account details. Your date of birth is private and is never
        shared with connected applications.
      </p>
      <form className="mt-6 space-y-4" onSubmit={saveProfile}>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-name">
            Display name
          </label>
          <input
            autoComplete="name"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-name"
            maxLength={80}
            onChange={(event) => updateField("displayName", event.target.value)}
            required
            value={profile.displayName}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-username">
            Username
          </label>
          <input
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-username"
            maxLength={30}
            onChange={(event) => updateField("username", event.target.value)}
            value={profile.username}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-bio">
            Bio
          </label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-bio"
            maxLength={500}
            onChange={(event) => updateField("bio", event.target.value)}
            value={profile.bio}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-avatar">
            Profile picture URL
          </label>
          <input
            autoComplete="url"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-avatar"
            maxLength={2048}
            onChange={(event) => updateField("avatarUrl", event.target.value)}
            placeholder="https://example.com/avatar.png"
            type="url"
            value={profile.avatarUrl}
          />
          <p className="mt-1 text-xs text-zinc-400">
            Use a public HTTPS image URL. Image uploads are not configured.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-dob">
            Date of birth
          </label>
          <input
            autoComplete="bday"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-dob"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => updateField("dateOfBirth", event.target.value)}
            type="date"
            value={profile.dateOfBirth}
          />
        </div>
        {message && (
          <p aria-live="polite" className="text-sm text-zinc-200" role="status">
            {message}
          </p>
        )}
        <button
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          disabled={loading || saving}
          type="submit"
        >
          {loading ? "Loading profile…" : saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}
