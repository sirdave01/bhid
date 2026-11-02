import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import AccountNavigation from "@/components/account-navigation";
import DeveloperApplications from "@/components/developer-applications";
import { getAuthenticatedSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Developer portal | BHID",
  description: "Register and manage your applications that use BHID sign-in.",
};

export default async function DevelopersPage() {
  await connection();
  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );

  if (!session) {
    redirect("/login?continue=%2Fdevelopers");
  }
  if (!session.emailVerified) {
    redirect("/settings/security");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">BHID</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Developer portal
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Register applications, manage exact callback URLs and consented
            scopes, and rotate confidential client secrets. You can only manage
            applications that you own.
          </p>
        </header>
        <DeveloperApplications />
      </div>
    </main>
  );
}
