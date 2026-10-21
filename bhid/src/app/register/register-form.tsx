"use client";

import { useState, type FormEvent } from "react";

type RegistrationErrors = Record<string, string[] | undefined>;

type PendingRegistration = {
  challengeToken: string;
  secret: string;
  otpauthUri: string;
};

function readErrors(value: unknown): RegistrationErrors | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("errors" in value) ||
    typeof value.errors !== "object" ||
    value.errors === null
  ) {
    return null;
  }

  const fields =
    "fieldErrors" in value.errors &&
    typeof value.errors.fieldErrors === "object" &&
    value.errors.fieldErrors !== null
      ? value.errors.fieldErrors
      : value.errors;

  if (typeof fields !== "object" || fields === null) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, messages]) =>
      Array.isArray(messages) &&
      messages.every((message) => typeof message === "string")
        ? [[key, messages]]
        : []
    )
  );
}

function responseMessage(payload: unknown, fallback: string) {
  return typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : fallback;
}

export default function RegisterForm() {
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingRegistration | null>(null);
  const [code, setCode] = useState("");

  async function startRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setErrors({});
    setMessage(null);
    setSubmitting(true);
    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          username: form.get("username"),
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const fieldErrors = readErrors(payload);

        if (fieldErrors) {
          setErrors(fieldErrors);
          setMessage("Please check the highlighted fields.");
        } else {
          setMessage(
            responseMessage(
              payload,
              "Unable to start registration. Check the details and try again."
            )
          );
        }
        return;
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("data" in payload) ||
        typeof payload.data !== "object" ||
        payload.data === null ||
        !("challengeToken" in payload.data) ||
        typeof payload.data.challengeToken !== "string" ||
        !("secret" in payload.data) ||
        typeof payload.data.secret !== "string" ||
        !("otpauthUri" in payload.data) ||
        typeof payload.data.otpauthUri !== "string"
      ) {
        throw new Error("Unable to start authenticator setup.");
      }

      setPending({
        challengeToken: payload.data.challengeToken,
        secret: payload.data.secret,
        otpauthUri: payload.data.otpauthUri,
      });
      setMessage(null);
      formElement.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach BHID. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pending) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/register/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: pending.challengeToken,
          code,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setMessage(
          responseMessage(payload, "Unable to verify the authenticator code.")
        );
        return;
      }

      window.location.replace("/settings/security");
    } catch {
      setMessage("Unable to reach BHID. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return pending ? (
    <form className="mt-8 space-y-5" onSubmit={confirmRegistration}>
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="font-medium text-white">Secure your new account</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Scan the code with an authenticator app, or enter this setup key
          manually. Enter the current six-digit code to finish creating your
          account. This step expires in 15 minutes.
        </p>
        <a className="mt-3 inline-block text-sm text-white underline" href={pending.otpauthUri}>
          Open authenticator app
        </a>
        <code className="mt-3 block break-all rounded-lg bg-zinc-950 p-3 text-sm text-white">
          {pending.secret}
        </code>
      </div>
      <div>
        <label className="block text-sm font-medium text-white" htmlFor="signup-totp">
          Authenticator code
        </label>
        <input
          autoComplete="one-time-code"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white"
          id="signup-totp"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          pattern="\d{6}"
          required
          value={code}
        />
      </div>
      {message && (
        <p aria-live="polite" className="text-sm text-red-300" role="alert">
          {message}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={submitting || code.length !== 6}
        type="submit"
      >
        {submitting ? "Verifying…" : "Verify and create account"}
      </button>
      <button
        className="w-full text-sm text-zinc-300 underline"
        onClick={() => {
          setPending(null);
          setCode("");
          setMessage(null);
        }}
        type="button"
      >
        Start registration again
      </button>
    </form>
  ) : (
    <form className="mt-8 space-y-5" onSubmit={startRegistration}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          autoComplete="given-name"
          error={errors.firstName?.[0]}
          label="First name"
          name="firstName"
          required
        />
        <Field
          autoComplete="family-name"
          error={errors.lastName?.[0]}
          label="Last name"
          name="lastName"
          required
        />
      </div>
      <Field
        autoComplete="email"
        error={errors.email?.[0]}
        label="Email"
        name="email"
        required
        type="email"
      />
      <Field
        autoComplete="username"
        error={errors.username?.[0]}
        label="Username (optional)"
        name="username"
        placeholder="david_01"
      />
      <Field
        autoComplete="new-password"
        error={errors.password?.[0]}
        help="Use 12 to 128 characters."
        label="Password"
        minLength={12}
        name="password"
        required
        type="password"
      />
      <Field
        autoComplete="new-password"
        error={errors.confirmPassword?.[0]}
        label="Confirm password"
        minLength={12}
        name="confirmPassword"
        required
        type="password"
      />
      {message && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            message === "Please check the highlighted fields."
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role="alert"
        >
          {message}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Preparing authenticator setup…" : "Continue to MFA setup"}
      </button>
      <p className="text-center text-xs leading-5 text-zinc-300">
        An authenticator app is required to create your account.
      </p>
    </form>
  );
}

type FieldProps = {
  autoComplete?: string;
  error?: string;
  help?: string;
  label: string;
  minLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
};

function Field({
  autoComplete,
  error,
  help,
  label,
  minLength,
  name,
  placeholder,
  required,
  type = "text",
}: FieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const inputType = type === "password" && visible ? "text" : type;

  return (
    <div>
      <label className="block text-sm font-medium text-white" htmlFor={name}>
        {label}
      </label>
      <div className={type === "password" ? "relative mt-1" : "mt-1"}>
        <input
          aria-describedby={
            [error ? errorId : null, help ? helpId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-700 ${
            type === "password" ? "pr-12" : ""
          }`}
          id={name}
          minLength={minLength}
          name={name}
          placeholder={placeholder}
          required={required}
          type={inputType}
        />
        {type === "password" && (
          <button
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 px-3 text-zinc-300 hover:text-white"
            onClick={() => setVisible((value) => !value)}
            type="button"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {help && (
        <p className="mt-1 text-xs text-zinc-400" id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-300" id={errorId}>
          {error}
        </p>
      )}
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
