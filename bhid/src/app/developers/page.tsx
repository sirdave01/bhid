import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AccountNavigation from "@/components/account-navigation";
import DeveloperApplications from "@/components/developer-applications";
import { getAuthenticatedSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Developer portal | BHID",
  description: "Register and manage your applications that use BHID sign-in.",
};

export default function DevelopersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-400">
          Loading developer portal…
        </main>
      }
    >
      <DeveloperPortalContent />
    </Suspense>
  );
}

async function DeveloperPortalContent() {
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
        <section
          aria-labelledby="developer-setup-heading"
          className="mb-8 rounded-xl border border-indigo-900 bg-indigo-950/30 p-6"
        >
          <h2 className="text-lg font-semibold" id="developer-setup-heading">
            Connect an application in four steps
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-zinc-300">
            <li>
              Register below: choose a name and slug, select{" "}
              <strong>Confidential</strong> for a server-side app or{" "}
              <strong>Public</strong> for a browser app using PKCE, and enter
              each exact callback URL. Use localhost for development and HTTPS
              for deployed apps.
            </li>
            <li>
              Allow only the scopes the app needs. The user must also approve
              those scopes when signing in. For example,{" "}
              <code>verification</code> returns identity level and tier,{" "}
              <code>membership</code> returns the paid tier and expiry, and{" "}
              <code>wallet</code> returns linked wallet details.
            </li>
            <li>
              Save the displayed client ID and, for confidential apps, the
              one-time client secret. Add these settings to your app&apos;s
              server-side environment (for example, <code>.env.local</code>):
              <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
                {`BHID_ISSUER=https://<your-bhid-domain>
BHID_CLIENT_ID=<client-id>
BHID_CLIENT_SECRET=<server-only-secret>
BHID_REDIRECT_URI=https://<your-app-domain>/auth/bhid/callback`}
              </pre>
              Keep the client secret out of browser code and public environment
              variables. Public clients do not use a client secret.
            </li>
            <li>
              Configure your OIDC library with the issuer and discovery URL{" "}
              <code>https://&lt;your-bhid-domain&gt;/.well-known/openid-configuration</code>.
              Set the same callback URL in both your application environment
              and the BHID registration. Send users through Authorization Code
              with S256 PKCE, then exchange the code and request UserInfo with
              the granted access token.
            </li>
          </ol>
          <p className="mt-4 text-xs text-zinc-400">
            Edit an application later to add callback URLs or scopes. Existing
            consent is required per user; adding a scope does not grant it
            automatically.
          </p>
        </section>
        <DeveloperApplications />
      </div>
    </main>
  );
}
