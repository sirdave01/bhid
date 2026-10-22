// this is the registration page for the BHID app. 
// It provides a user interface for creating a new account, 
// including a form for entering user details and links for navigation. 
// The page is styled to be responsive and user-friendly, guiding users through the account 
// creation process.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import AccountNavigation from "@/components/account-navigation";
import RegisterForm from "./register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a secure ByteHaven identity with BHID.",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center bg-zinc-950 px-6 py-12 text-white">
      <Suspense fallback={<div className="mb-6 h-12" />}>
        <AccountNavigation />
      </Suspense>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Create your BHID
      </h1>
      <p className="mt-3 text-white">
        One secure identity for the ByteHaven apps you trust.
      </p>
      <RegisterForm />
      <p className="mt-6 text-sm text-white">
        Already have an account?{" "}
        <Link className="font-medium text-white underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
