import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import AccountNavigation from "@/components/account-navigation";
import MembershipSettings from "@/components/membership-settings";
import { getAuthenticatedSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Membership | BHID",
  description: "Manage your paid BHID membership.",
};

export default async function MembershipPage() {
  await connection();
  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );

  if (!session) {
    redirect("/login?continue=%2Fmembership");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">BHID</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Membership
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Upgrade or renew using HBT on Solana. BHID verifies the finalized
            transaction automatically; each renewal is initiated and signed by
            you.
          </p>
        </header>
        <MembershipSettings />
      </div>
    </main>
  );
}
