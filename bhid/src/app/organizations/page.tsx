import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import OrganizationDashboard from "@/app/organizations/organization-dashboard";
import AccountNavigation from "@/components/account-navigation";
import { getAuthenticatedSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Organizations | BHID",
  description: "Manage organization access, applications, usage, and billing.",
};

export default async function OrganizationsPage() {
  await connection();
  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );

  if (!session) {
    redirect("/login?continue=%2Forganizations");
  }
  if (!session.emailVerified) {
    redirect("/settings/security");
  }

  return (
    <main className="min-h-screen flex-1 bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">BHID</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Organization access, assigned application usage, and billing
            records.
          </p>
        </header>
        <OrganizationDashboard
          email={session.email}
          userId={session.userId}
        />
      </div>
    </main>
  );
}
