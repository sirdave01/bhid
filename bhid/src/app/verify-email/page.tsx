import type { Metadata } from "next";

import VerifyEmailForm from "./verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email | BHID",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center bg-zinc-950 px-6 py-12 text-white">
      <h1 className="text-3xl font-semibold">Verify your email</h1>
      <p className="mt-3 text-zinc-300">
        Confirm the email address associated with your BHID account.
      </p>
      <VerifyEmailForm />
    </main>
  );
}
