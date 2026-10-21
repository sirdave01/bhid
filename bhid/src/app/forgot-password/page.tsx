import Link from "next/link";

import AccountNavigation from "@/components/account-navigation";
import PasswordResetForm from "./password-reset-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl flex-1 bg-zinc-950 px-6 py-10 text-white">
      <AccountNavigation />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Verify your email code and authenticator-app code to choose a new
        password. All existing sessions will be signed out.
      </p>
      <PasswordResetForm />
      <p className="mt-6 text-center text-sm text-zinc-300">
        Remembered your password?{" "}
        <Link className="text-white underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
