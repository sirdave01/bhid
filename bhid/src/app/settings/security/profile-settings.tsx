
"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import AccountAvatar from "@/components/account-avatar";

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

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function getResponseMessage(
  payload: unknown,
  fallback: string
): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

function getResponseData(payload: unknown): Record<string, unknown> | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    typeof payload.data === "object" &&
    payload.data !== null
  ) {
    return payload.data as Record<string, unknown>;
  }

  return null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function ProfileSettings() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const avatarInput = useRef<HTMLInputElement>(null);

  // Release temporary preview URLs when they are replaced or removed.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Load the BHID profile.
  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch("/api/account/profile", {
          cache: "no-store",
          signal: controller.signal,
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            getResponseMessage(
              payload,
              response.status === 401
                ? "Please sign in to manage your profile."
                : "Unable to load profile."
            )
          );
        }

        const data = getResponseData(payload);

        if (!data) {
          throw new Error("Invalid profile response.");
        }

        if (controller.signal.aborted) return;

        setProfile({
          displayName: getString(data.displayName),
          username: getString(data.username),
          bio: getString(data.bio),
          avatarUrl: getString(data.avatarUrl),
          dateOfBirth: getString(data.dateOfBirth),
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load your profile."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, []);

  function updateField(
    field: keyof Profile,
    value: string
  ) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleAvatarSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] ?? null;

    setMessage("");
    setError("");

    if (!file) {
      setAvatarFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError("Profile pictures must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    setAvatarFile(file);
    setPreviewUrl(objectUrl);
    setMessage(`Ready to upload: ${file.name}`);
  }

  function cancelAvatarSelection() {
    if (uploadingAvatar) return;

    setAvatarFile(null);
    setPreviewUrl(null);
    setMessage("");

    if (avatarInput.current) {
      avatarInput.current.value = "";
    }
  }

  async function uploadAvatar() {
    if (!avatarFile || uploadingAvatar) return;

    setUploadingAvatar(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.set("avatar", avatarFile);

      const response = await fetch(
        "/api/account/profile/avatar",
        {
          method: "POST",
          body: formData,
        }
      );

      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getResponseMessage(
            payload,
            "Unable to upload your profile picture."
          )
        );
      }

      const data = getResponseData(payload);
      const newAvatarUrl = data?.avatarUrl;

      if (typeof newAvatarUrl !== "string" || !newAvatarUrl) {
        throw new Error(
          "The upload succeeded, but no avatar URL was returned."
        );
      }

      setProfile((current) => ({
        ...current,
        avatarUrl: newAvatarUrl,
      }));

      setAvatarFile(null);
      setPreviewUrl(null);

      if (avatarInput.current) {
        avatarInput.current.value = "";
      }

      setMessage(
        getResponseMessage(
          payload,
          "Profile picture updated successfully."
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload your profile picture."
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: profile.displayName,
          username: profile.username,
          bio: profile.bio,
          dateOfBirth: profile.dateOfBirth,
        }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getResponseMessage(payload, "Unable to save your profile.")
        );
      }

      setMessage(
        getResponseMessage(
          payload,
          "Profile updated successfully."
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  const displayedAvatarUrl = previewUrl ?? profile.avatarUrl;

  return (
    <section
      id="profile"
      className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-white shadow-sm"
    >
      <h2 className="text-xl font-semibold tracking-tight">
        Profile
      </h2>

      <p className="mt-1 text-sm text-zinc-300">
        Manage your BHID profile and profile picture.
        Your date of birth is private.
      </p>

      {/* PROFILE HEADER */}
      <div className="mt-6 flex flex-wrap items-center gap-5 rounded-xl border border-zinc-700 bg-zinc-950 p-5">
        <AccountAvatar
          avatarUrl={displayedAvatarUrl || null}
          displayName={profile.displayName || "BHID User"}
          size={112}
        />

        <div className="min-w-0 flex-1">
          <h3 className="break-words text-xl font-semibold">
            {profile.displayName || "BHID User"}
          </h3>

          <p className="mt-1 text-sm text-zinc-400">
            {profile.username
              ? `@${profile.username}`
              : "No username yet"}
          </p>

          <p className="mt-2 text-xs text-zinc-400">
            {previewUrl
              ? "Previewing a selected picture. Upload to save it."
              : "Click your picture to view it in full size."}
          </p>
        </div>
      </div>

      {/* PROFILE PICTURE UPLOAD */}
      <div className="mt-6 space-y-4 rounded-xl border border-zinc-700 p-4">
        <h3 className="text-base font-semibold">
          Profile picture
        </h3>

        <p className="text-sm text-zinc-400">
          Your avatar can appear in other ByteHaven applications
          connected to BHID.
        </p>

        <label
          htmlFor="profile-avatar"
          className="block text-sm font-medium"
        >
          Choose a profile picture
        </label>

        <input
          ref={avatarInput}
          id="profile-avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={loading || uploadingAvatar}
          onChange={handleAvatarSelection}
          className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-950 disabled:opacity-50"
        />

        <p className="text-xs text-zinc-400">
          Supported formats: JPEG, PNG, WebP. Maximum size: 5 MB.
        </p>

        {avatarFile && (
          <div className="rounded-lg bg-zinc-800 p-3">
            <p className="break-all text-sm text-zinc-200">
              Selected: {avatarFile.name}
            </p>

            <p className="mt-1 text-xs text-zinc-400">
              Size: {(avatarFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!avatarFile || uploadingAvatar || saving}
            onClick={() => void uploadAvatar()}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingAvatar
              ? "Uploading picture..."
              : "Upload picture"}
          </button>

          {avatarFile && (
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={cancelAvatarSelection}
              className="rounded-lg border border-zinc-600 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel selection
            </button>
          )}
        </div>
      </div>

      {/* EDITABLE PROFILE INFORMATION */}
      <form
        className="mt-6 space-y-5"
        onSubmit={saveProfile}
      >
        <div>
          <label
            htmlFor="profile-name"
            className="block text-sm font-medium"
          >
            Display name
          </label>

          <input
            id="profile-name"
            autoComplete="name"
            required
            maxLength={80}
            disabled={loading}
            value={profile.displayName}
            onChange={(event) =>
              updateField("displayName", event.target.value)
            }
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label
            htmlFor="profile-username"
            className="block text-sm font-medium"
          >
            Username
          </label>

          <input
            id="profile-username"
            autoComplete="username"
            maxLength={30}
            disabled={loading}
            value={profile.username}
            onChange={(event) =>
              updateField("username", event.target.value)
            }
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label
            htmlFor="profile-bio"
            className="block text-sm font-medium"
          >
            Biography
          </label>

          <textarea
            id="profile-bio"
            maxLength={500}
            disabled={loading}
            value={profile.bio}
            onChange={(event) =>
              updateField("bio", event.target.value)
            }
            className="mt-1 min-h-28 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </div>

        <div>
          <label
            htmlFor="profile-dob"
            className="block text-sm font-medium"
          >
            Date of birth
          </label>

          <input
            id="profile-dob"
            type="date"
            autoComplete="bday"
            disabled={loading}
            value={profile.dateOfBirth}
            onChange={(event) =>
              updateField("dateOfBirth", event.target.value)
            }
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />

          <p className="mt-1 text-xs text-zinc-400">
            Private account information.
          </p>
        </div>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || saving || uploadingAvatar}
          className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Loading profile..."
            : saving
              ? "Saving..."
              : "Save profile"}
        </button>
      </form>
    </section>
  );
}
