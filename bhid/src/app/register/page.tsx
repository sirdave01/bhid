import type { Metadata } from "next";
import Link from "next/link";

import RegisterForm from "./register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a secure ByteHaven identity with BHID.",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      <Link className="text-sm font-semibold tracking-wide" href="/">
        BHID
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Create your BHID
      </h1>
      <p className="mt-3 text-zinc-600">
        One secure identity for the ByteHaven apps you trust.
      </p>
      <RegisterForm />
      <p className="mt-6 text-sm text-zinc-600">
        Already have an account?{" "}
        <Link className="font-medium text-zinc-950 underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
