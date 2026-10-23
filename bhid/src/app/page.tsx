import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";

import SignOutButton from "@/components/sign-out-button";
import { getAuthenticatedSession } from "@/lib/session";

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
      "Review each app's access request and revoke sessions you no longer recognize.",
  },
];

export default function Home() {
  return (
    <main className="flex-1 bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Suspense fallback={<Brand linked />}>
          <HomeHeader />
        </Suspense>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:pb-28 lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            ByteHaven identity
          </p>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            One account.
            <br />
            <span className="text-zinc-400">Your whole</span>
            <br />
            ByteHaven.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-300">
            BHID keeps your identity in one place, so you can securely sign in
            to trusted ByteHaven apps and stay in control of your account.
          </p>
          <Suspense
            fallback={
              <div
                aria-label="Loading account actions"
                aria-live="polite"
                className="mt-9 h-12 w-full max-w-sm animate-pulse rounded-xl bg-zinc-900"
                role="status"
              />
            }
          >
            <HomeActions />
          </Suspense>
          <p className="mt-5 text-xs leading-5 text-zinc-400">
            Secure sign-in for the ByteHaven ecosystem. Passkeys are available
            on supported devices.
          </p>
        </div>

        <div
          aria-label="BHID account security overview"
          className="relative mx-auto w-full max-w-md"
        >
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-emerald-500/20 via-sky-500/10 to-violet-500/20 opacity-70 blur-2xl" />
          <div className="relative rounded-[1.75rem] border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/30 sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Your identity
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  BHID account
                </p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
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
              <div className="flex items-center gap-4 rounded-xl bg-zinc-950 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-200">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    viewBox="0 0 24 24"
                    width="20"
                  >
                    <path
                      d="M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v7H4v-7a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium text-white">
                    Private by design
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Only share what you approve
                  </p>
                </div>
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-center gap-4 rounded-xl bg-zinc-950 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-200">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    viewBox="0 0 24 24"
                    width="20"
                  >
                    <path
                      d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.6"
                    />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium text-white">
                    Passkey protected
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Sign in with your device
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                  READY
                </span>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-5">
              <span className="text-xs text-zinc-400">
                Identity, connected
              </span>
              <span className="text-xs font-medium text-zinc-200">
                ByteHaven
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-800 bg-zinc-900/70">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-12 sm:grid-cols-3 lg:px-10">
          {features.map((feature) => (
            <article className="max-w-sm" key={feature.number}>
              <p className="text-xs font-medium tracking-widest text-zinc-500">
                {feature.number}
              </p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-7 text-xs text-zinc-400 lg:px-10">
        <p>BHID · ByteHaven Identity</p>
        <Suspense
          fallback={
            <span aria-live="polite" className="text-zinc-500" role="status">
              Checking account…
            </span>
          }
        >
          <FooterAccountLink />
        </Suspense>
      </footer>
    </main>
  );
}

function Brand({ linked }: { linked: boolean }) {
  const brand = (
    <Image
      alt="BHID"
      className="h-12 w-12 rounded-xl"
      height={48}
      priority
      src="/icon.png"
      width={48}
    />
  );

  return linked ? (
    <Link aria-label="BHID home" className="flex items-center" href="/">
      {brand}
    </Link>
  ) : (
    <span aria-label="BHID" className="flex items-center">
      {brand}
    </span>
  );
}

async function HomeHeader() {
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);

  return (
    <>
      <Brand linked={!session} />
      <nav aria-label="Main navigation">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {session ? (
            <>
              <Link
                className="rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                href="/settings/profile"
              >
                Profile
              </Link>
              <Link
                className="rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                href="/settings/security"
              >
                Security
              </Link>
              <Link
                className="rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                href="/settings/wallet"
              >
                Wallet
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                className="rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                href="/"
              >
                Home
              </Link>
              <Link
                className="rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                href="/login"
              >
                Sign in
              </Link>
              <Link
                className="rounded-lg bg-white px-4 py-2 font-medium text-zinc-950 hover:bg-zinc-200"
                href="/register"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
}

async function HomeActions() {
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);

  if (session) {
    return (
      <p className="mt-9 text-sm text-zinc-300">
        You are signed in. Manage your account using the navigation above.
      </p>
    );
  }

  return (
    <div className="mt-9 flex flex-wrap gap-3">
      <Link
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
        href="/register"
      >
        Create your BHID
        <span aria-hidden="true" className="ml-3">
          →
        </span>
      </Link>
      <Link
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-6 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
        href="/login"
      >
        I already have an account
      </Link>
    </div>
  );
}

async function FooterAccountLink() {
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);

  return session ? null : (
    <Link className="hover:text-white" href="/login">
      Sign in to your account
    </Link>
  );
}
