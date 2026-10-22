import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAuthenticatedSession } from "@/lib/session";

export default function SettingsLayout({
  children,
}: LayoutProps<"/settings">) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
          <p className="mx-auto max-w-4xl text-sm text-zinc-400">
            Checking your account…
          </p>
        </main>
      }
    >
      <AuthenticatedSettings>{children}</AuthenticatedSettings>
    </Suspense>
  );
}

async function AuthenticatedSettings({
  children,
}: {
  children: React.ReactNode;
}) {
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);

  if (!session) {
    redirect("/login?continue=%2Fsettings%2Fprofile");
  }

  return children;
}
