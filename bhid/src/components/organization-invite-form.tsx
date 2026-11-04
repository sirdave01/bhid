"use client";

import { useState, type FormEvent } from "react";

type Props = {
  organizationId: string;
  canInviteAdmins: boolean;
};

export default function OrganizationInviteForm({
  organizationId,
  canInviteAdmins,
}: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInvitationUrl("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
        }
      );
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
          code === "invitation_already_pending"
            ? "An invitation is already pending for this email."
            : code === "already_a_member"
              ? "That person is already a member."
              : code === "role_not_allowed"
                ? "Only the organization owner can invite an administrator."
                : "Unable to create the invitation."
        );
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("invitationUrl" in payload) ||
        typeof payload.invitationUrl !== "string"
      ) {
        throw new Error("The invitation was created without a usable link.");
      }

      setInvitationUrl(payload.invitationUrl);
      setEmail("");
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Unable to create the invitation."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={submit}>
        <label className="text-sm text-zinc-300">
          Developer email
          <input
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="text-sm text-zinc-300">
          Organization role
          <select
            className="mt-1 h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-white"
            onChange={(event) => setRole(event.target.value)}
            value={role}
          >
            <option value="developer">Developer</option>
            <option value="member">Member</option>
            {canInviteAdmins && <option value="admin">Administrator</option>}
          </select>
        </label>
        <button
          className="self-end rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "Creating…" : "Create invitation"}
        </button>
      </form>
      {invitationUrl && (
        <p className="mt-3 break-all rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          Share this single-use invitation link (expires in 7 days):{" "}
          <a className="underline" href={invitationUrl}>
            {invitationUrl}
          </a>
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
