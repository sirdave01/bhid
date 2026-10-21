"use client";

import { useEffect, useState, type FormEvent } from "react";

function responseMessage(value: unknown, fallback: string) {
  return typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

function readChallengeToken(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null ||
    !("challengeToken" in value.data) ||
    typeof value.data.challengeToken !== "string"
  ) {
    return null;
  }
  return value.data.challengeToken;
}

export default function PasswordResetForm() {
  const [email, setEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (token) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
      queueMicrotask(() => setChallengeToken(token));
    }
  }, []);

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          responseMessage(payload, "Unable to request a password reset.")
        );
      }
      const token = readChallengeToken(payload);
      if (!token) {
        throw new Error("Unable to start the password reset.");
      }
      setChallengeToken(token);
      setMessage(
        "If your account is eligible, a code and reset link have been sent. Check your inbox and spam folder."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to request a password reset."
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken,
          emailCode,
          totpCode,
          password,
          confirmPassword,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          responseMessage(payload, "Unable to reset your password.")
        );
      }
      setComplete(true);
      setMessage(responseMessage(payload, "Your password has been reset."));
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reset your password."
      );
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="mt-8 rounded-xl border border-emerald-700 bg-emerald-950 p-4">
        <p aria-live="polite" className="text-sm text-emerald-100" role="status">
          {message}
        </p>
        <a className="mt-4 inline-block text-sm text-white underline" href="/login">
          Continue to sign in
        </a>
      </div>
    );
  }

  if (!challengeToken) {
    return (
      <form className="mt-8 space-y-5" onSubmit={requestCode}>
        <div>
          <label className="block text-sm font-medium" htmlFor="reset-email">
            Account email
          </label>
          <input
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
            id="reset-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        {message && (
          <p aria-live="polite" className="text-sm text-red-300" role="alert">
            {message}
          </p>
        )}
        <button
          className="w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "Requesting code…" : "Email me a reset code"}
        </button>
      </form>
    );
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={resetPassword}>
      <div>
        <label className="block text-sm font-medium" htmlFor="reset-email">
          Account email
        </label>
        <input
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
          id="reset-email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="reset-email-code">
          Email code
        </label>
        <input
          autoComplete="one-time-code"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
          id="reset-email-code"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          pattern="\d{6}"
          required
          value={emailCode}
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="reset-totp">
          Authenticator-app code
        </label>
        <input
          autoComplete="one-time-code"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white"
          id="reset-totp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          pattern="\d{6}"
          required
          value={totpCode}
        />
      </div>
      <PasswordField
        label="New password"
        onChange={setPassword}
        show={showPassword}
        toggle={() => setShowPassword((visible) => !visible)}
        value={password}
      />
      <PasswordField
        label="Confirm new password"
        onChange={setConfirmPassword}
        show={showConfirmPassword}
        toggle={() => setShowConfirmPassword((visible) => !visible)}
        value={confirmPassword}
      />
      {message && (
        <p aria-live="polite" className="text-sm text-red-300" role="alert">
          {message}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-50"
        disabled={busy || emailCode.length !== 6 || totpCode.length !== 6}
        type="submit"
      >
        {busy ? "Resetting password…" : "Verify and reset password"}
      </button>
      <div className="text-center">
        <button
          className="text-sm text-zinc-300 underline disabled:opacity-50"
          disabled={busy || !email}
          onClick={() => void requestCode()}
          type="button"
        >
          Send another code
        </button>
      </div>
    </form>
  );
}

type PasswordFieldProps = {
  label: string;
  onChange: (value: string) => void;
  show: boolean;
  toggle: () => void;
  value: string;
};

function PasswordField({
  label,
  onChange,
  show,
  toggle,
  value,
}: PasswordFieldProps) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 pr-12 text-white"
          id={id}
          minLength={12}
          onChange={(event) => onChange(event.target.value)}
          required
          type={show ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 px-3 text-zinc-300 hover:text-white"
          onClick={toggle}
          type="button"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="m3 3 18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.8 15.8 0 0 1-3 3.5M6.2 6.9C3.8 8.3 2.5 12 2.5 12s3.4 6 9.5 6c1.1 0 2.1-.2 3-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}
