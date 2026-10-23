"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);

  function getResponseMessage(payload: unknown, fallback: string): string {
    return typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
      ? payload.message
      : fallback;
  }

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
            getResponseMessage(
              payload,
              response.status === 401
                ? "Sign in to manage your profile."
                : "Unable to load profile data."
            )
          );
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload) ||
          typeof payload.data !== "object" ||
          payload.data === null
        ) {
          throw new Error("Unable to load profile data.");
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
            error instanceof Error ? error.message : "Unable to load profile data."
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
        body: JSON.stringify({
          displayName: profile.displayName,
          username: profile.username,
          bio: profile.bio,
          dateOfBirth: profile.dateOfBirth,
        }),
      });
      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("message" in payload) ||
        typeof payload.message !== "string"
      ) {
        throw new Error("Unable to save profile data.");
      }

      if (!response.ok) {
        throw new Error(payload.message);
      }

      setMessage(payload.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save profile data."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar() {
    if (!avatarFile) {
      return;
    }

    setUploadingAvatar(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.set("avatar", avatarFile);
      const response = await fetch("/api/account/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getResponseMessage(payload, "Unable to upload your profile picture.")
        );
      }

      const data =
        typeof payload === "object" &&
        payload !== null &&
        "data" in payload &&
        typeof payload.data === "object" &&
        payload.data !== null
          ? payload.data
          : null;
      const avatarUrl =
        data && "avatarUrl" in data ? data.avatarUrl : undefined;
      if (typeof avatarUrl !== "string") {
        throw new Error("The uploaded picture could not be loaded.");
      }

      setProfile((current) => ({ ...current, avatarUrl }));
      setAvatarFile(null);
      if (avatarInput.current) {
        avatarInput.current.value = "";
      }
      setMessage(getResponseMessage(payload, "Profile picture updated"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload your profile picture."
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  function updateField(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  return (
    <section id="profile" className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm">
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
        <div className="space-y-3">
          <p className="text-sm font-medium">Profile picture</p>
          {profile.avatarUrl && (
            <Image
              alt="Current profile picture"
              className="h-20 w-20 rounded-full object-cover"
              height={80}
              src={profile.avatarUrl}
              unoptimized
              width={80}
            />
          )}
          <input
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-950"
            id="profile-avatar"
            onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
            ref={avatarInput}
            type="file"
          />
          <p className="text-xs text-zinc-400">
            JPEG, PNG, or WebP; maximum file size 5 MB.
          </p>
          <button
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!avatarFile || uploadingAvatar || saving}
            onClick={() => void uploadAvatar()}
            type="button"
          >
            {uploadingAvatar ? "Uploading picture…" : "Upload picture"}
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-dob">
            Date of birth
          </label>
          <input
            autoComplete="bday"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            id="profile-dob"
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
          disabled={loading || saving || uploadingAvatar}
          type="submit"
        >
          {loading ? "Loading profile…" : saving ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}
