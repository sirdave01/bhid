import Link from "next/link";

import AccountNavigation from "@/components/account-navigation";
import PasswordResetForm from "../forgot-password/password-reset-form";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl flex-1 bg-zinc-950 px-6 py-10 text-white">
      <AccountNavigation />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Enter the email code and authenticator code to securely reset your
        password.
      </p>
      <PasswordResetForm />
      <p className="mt-6 text-center text-sm text-zinc-300">
        <Link className="text-white underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
