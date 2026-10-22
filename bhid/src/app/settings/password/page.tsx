import type { Metadata } from "next";

import AccountNavigation from "@/components/account-navigation";
import PasswordResetForm from "@/app/forgot-password/password-reset-form";

export const metadata: Metadata = {
  title: "Password settings",
  description: "Securely reset your BHID password.",
};

export default function PasswordSettingsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <AccountNavigation />
      <p className="mt-8 text-sm font-medium uppercase tracking-widest text-zinc-400">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Password settings
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
        Verify your email code and authenticator-app code to securely reset
        your password. You can also start account recovery from the sign-in
        page if you cannot sign in.
      </p>
      <PasswordResetForm />
    </main>
  );
}
