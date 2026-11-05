import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import AccountNavigation from "@/components/account-navigation";
import { getAuthenticatedSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Profile lookup | BHID developers",
  description: "BHID profile lookup and OAuth UserInfo integration guidance.",
};

export default async function ProfileLookupGuidePage() {
  await connection();
  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );

  if (!session) {
    redirect("/login?continue=%2Fdevelopers%2Fprofile-lookup");
  }
  if (!session.emailVerified) {
    redirect("/settings/security");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">Developer guide</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Profile lookup
          </h1>
          <p className="mt-3 text-zinc-300">
            BHID does not currently provide a public endpoint for looking up
            another user&apos;s profile by their <code>sub</code> or username.
            OAuth UserInfo describes the user who authorized your application;
            it is not a cross-user directory.
          </p>
        </header>

        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">
              OAuth UserInfo: the signed-in user
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Use the discovery document to configure your OpenID Connect
              client. After the user completes Authorization Code sign-in and
              grants the requested scopes, call the UserInfo endpoint with
              that user&apos;s access token:
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-zinc-400">Discovery</dt>
              <dd>
                <a
                  className="break-all text-indigo-300 underline"
                  href="https://auth.bytehaven.world/.well-known/openid-configuration"
                >
                  https://auth.bytehaven.world/.well-known/openid-configuration
                </a>
              </dd>
              <dt className="text-zinc-400">UserInfo</dt>
              <dd>
                <code>GET https://auth.bytehaven.world/api/oauth/userinfo</code>
              </dd>
              <dt className="text-zinc-400">Authentication</dt>
              <dd>
                <code>Authorization: Bearer &lt;access_token&gt;</code>
              </dd>
              <dt className="text-zinc-400">Required scope</dt>
              <dd>
                <code>openid</code>; request <code>profile</code> as well for
                profile claims.
              </dd>
            </dl>
            <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
              {`curl https://auth.bytehaven.world/api/oauth/userinfo \\
  -H "Authorization: Bearer $BHID_ACCESS_TOKEN"`}
            </pre>
            <p className="mt-4 text-sm text-zinc-300">
              The response always includes <code>sub</code>, the BHID subject
              identifier for the signed-in user. With the consented{" "}
              <code>profile</code> scope it may also include <code>name</code>,{" "}
              <code>preferred_username</code>, <code>picture</code>,{" "}
              <code>bio</code>, and <code>birthdate</code>, when those values
              exist. It does not accept a target <code>sub</code> or username
              to fetch someone else&apos;s data.
            </p>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">
              Other BHID endpoints are not public profile lookup APIs
            </h2>
            <ul className="mt-3 list-disc space-y-3 pl-5 text-sm text-zinc-300">
              <li>
                <code>POST /api/users/search</code> is an authenticated BHID
                member-search feature. It requires a BHID account session,
                searches username, email, or display name (3–100 characters),
                and returns limited details for matching active,
                email-verified accounts. It is not authenticated with an
                OAuth client token, does not look up by <code>sub</code>, and
                is not documented as an integration API for third-party apps.
              </li>
              <li>
                <code>GET /api/account/profile</code> also requires a BHID
                account session and returns only the current account&apos;s
                profile.
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-indigo-900 bg-indigo-950/30 p-6">
            <h2 className="text-lg font-semibold">
              Recommended behavior for HavenSocial
            </h2>
            <p className="mt-2 text-sm text-zinc-200">
              For each profile belonging to another HavenSocial user, display
              only the BHID <code>sub</code> as an opaque identifier unless
              HavenSocial already has that person&apos;s profile data or BHID
              later publishes a supported cross-user lookup API. Do not treat
              <code> sub</code> as a username or call the BHID member-search
              endpoint as a workaround. For the user currently signing in,
              show only the profile claims returned by UserInfo and authorized
              by that user.
            </p>
            <p className="mt-3 text-xs text-zinc-400">
              When correlating accounts, use the pair <code>iss</code> and{" "}
              <code>sub</code>; keep the subject opaque and do not infer
              personal details from it.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
