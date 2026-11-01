import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AccountNavigation from "@/components/account-navigation";
import MemberSearch from "@/components/member-search";
import { getAuthenticatedSession } from "@/lib/session";

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
          <p className="mx-auto max-w-4xl text-sm text-zinc-400">
            Loading people search…
          </p>
        </main>
      }
    >
      <AuthenticatedUsers />
    </Suspense>
  );
}

async function AuthenticatedUsers() {
  await connection();
  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );

  if (!session) {
    redirect("/login?continue=%2Fusers");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">BHID</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Find people
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Search active, email-verified accounts by username, email, or full
            name. Email addresses are only used to match and are never shown.
          </p>
        </header>
        <MemberSearch />
      </div>
    </main>
  );
}
