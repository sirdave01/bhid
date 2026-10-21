import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { getFounderSession } from "@/lib/founder-access";

const features = [
  {
    number: "01",
    title: "One identity",
    description:
      "Use your BHID account to sign in across trusted ByteHaven applications.",
  },
  {
    number: "02",
    title: "Passkey ready",
    description:
      "Add device-based passkeys and manage the sessions connected to your account.",
  },
  {
    number: "03",
    title: "You stay in control",
    description:
      "Review each app's access request and revoke sessions you no longer need.",
  },
];

export default function Home() {
  return (
    <main className="flex-1 bg-[#f7f8fa] text-zinc-950">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link
          className="flex items-center gap-3"
          href="/"
          aria-label="BHID home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold tracking-tight text-white">
            BH
          </span>
          <span className="text-lg font-semibold tracking-tight">BHID</span>
        </Link>
        <Suspense fallback={null}>
          <NavigationLinks />
        </Suspense>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:pb-28 lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-zinc-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ByteHaven identity
          </p>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            One account.
            <br />
            <span className="text-zinc-500">Your whole</span>
            <br />
            ByteHaven.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-600">
            BHID keeps your identity in one place, so you can securely sign in
            to trusted ByteHaven apps and stay in control of your account.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-zinc-950 px-6 text-sm font-medium text-white transition hover:bg-zinc-700"
              href="/register"
            >
              Create your BHID
              <span aria-hidden="true" className="ml-3">
                →
              </span>
            </Link>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
              href="/login"
            >
              I already have an account
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-zinc-500">
            Secure sign-in for the ByteHaven ecosystem. Passkeys are available
            on supported devices.
          </p>
        </div>

        <div
          aria-label="BHID account security overview"
          className="relative mx-auto w-full max-w-md"
        >
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-emerald-100 via-sky-100 to-violet-100 opacity-70 blur-2xl" />
          <div className="relative rounded-[1.75rem] border border-zinc-200/80 bg-white p-6 shadow-xl shadow-zinc-900/5 sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Your identity
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  BHID account
                </p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="22"
                  viewBox="0 0 24 24"
                  width="22"
                >
                  <path
                    d="M12 3.5 19 6v5.1c0 4.4-2.9 7.9-7 9.4-4.1-1.5-7-5-7-9.4V6l7-2.5Z"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                  <path
                    d="m9 12 2 2 4-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-zinc-700 shadow-sm">
                  <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
                    <path d="M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v7H4v-7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Private by design</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Only share what you approve
                  </p>
                </div>
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div className="flex items-center gap-4 rounded-xl bg-zinc-50 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-zinc-700 shadow-sm">
                  <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
                    <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Passkey protected</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Sign in with your device
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-800">
                  READY
                </span>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-5">
              <span className="text-xs text-zinc-500">
                Identity, connected
              </span>
              <span className="text-xs font-medium text-zinc-800">
                ByteHaven
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-12 sm:grid-cols-3 lg:px-10">
          {features.map((feature) => (
            <article className="max-w-sm" key={feature.number}>
              <p className="text-xs font-medium tracking-widest text-zinc-400">
                {feature.number}
              </p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-7 text-xs text-zinc-500 lg:px-10">
        <p>BHID · ByteHaven Identity</p>
        <Link className="hover:text-zinc-900" href="/settings/security">
          Account security
        </Link>
      </footer>
    </main>
  );
}

async function NavigationLinks() {
  await connection();

  const isFounder = Boolean(await getFounderSession());

  return (
    <nav aria-label="Main navigation">
      <div className="hidden items-center gap-3 md:flex">
        <Link
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-white"
          href="/login"
        >
          Sign in
        </Link>
        <Link
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          href="/register"
        >
          Create account
        </Link>
        {isFounder && (
          <Link
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-white"
            href="/founder"
          >
            Founder
          </Link>
        )}
      </div>
      <details className="group relative md:hidden">
        <summary
          aria-label="Open navigation menu"
          className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 [&::-webkit-details-marker]:hidden"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5 group-open:hidden"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
          <svg
            aria-hidden="true"
            className="hidden h-5 w-5 group-open:block"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </summary>
        <div className="absolute right-0 z-10 mt-2 flex min-w-48 flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            href="/register"
          >
            Create account
          </Link>
          {isFounder && (
            <Link
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
              href="/founder"
            >
              Founder
            </Link>
          )}
        </div>
      </details>
    </nav>
  );
}
