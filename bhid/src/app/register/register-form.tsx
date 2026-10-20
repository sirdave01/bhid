"use client";

import { useState, type FormEvent } from "react";

type RegistrationErrors = Record<string, string[] | undefined>;

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

export default function RegisterForm() {
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
            "Unable to create an account with those details. Check them and try again."
          );
        }
        return;
      }

      setMessage("Your BHID account is ready. Continue to sign in.");
      formElement.reset();
    } catch {
      setMessage("Unable to reach BHID. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
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
      {message && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            message.startsWith("Your BHID")
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role={message.startsWith("Your BHID") ? "status" : "alert"}
        >
          {message}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-zinc-950 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      {message?.startsWith("Your BHID") && (
        <a
          className="block text-center text-sm font-medium text-zinc-950 underline"
          href="/login"
        >
          Continue to sign in
        </a>
      )}
      <p className="text-center text-xs leading-5 text-zinc-500">
        By creating an account, you agree to keep your sign-in details secure.
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
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-800" htmlFor={name}>
        {label}
      </label>
      <input
        aria-describedby={
          [error ? errorId : null, help ? helpId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-200"
        id={name}
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
      {help && (
        <p className="mt-1 text-xs text-zinc-500" id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-700" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
