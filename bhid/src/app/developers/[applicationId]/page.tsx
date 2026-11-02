import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import AccountNavigation from "@/components/account-navigation";
import DeveloperApplicationSettings from "@/components/developer-application-settings";
import { getJwtConfig } from "@/lib/jwt-keys";
import { getAuthenticatedSession } from "@/lib/session";
import pool from "@/lib/db";

export const metadata: Metadata = {
  title: "Manage OAuth application | BHID",
  description: "Manage your BHID OAuth client configuration.",
};

export default async function DeveloperApplicationPage({
  params,
}: PageProps<"/developers/[applicationId]">) {
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

  const { applicationId } = await params;
  const result = await pool.query(
    `SELECT
       id,
       name,
       slug,
       description,
       client_id,
       redirect_uris,
       allowed_scopes,
       status,
       client_type,
       created_at
     FROM applications
     WHERE id = $1
       AND owner_user_id = $2
     LIMIT 1`,
    [applicationId, session.userId]
  );

  const application = result.rows[0];

  if (!application) {
    notFound();
  }
  const issuer = getJwtConfig().issuer.replace(/\/+$/, "");

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <AccountNavigation />
        <header className="mb-8 mt-10">
          <p className="text-sm font-medium text-zinc-400">Developer portal</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Manage {application.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Client secrets are never displayed again after creation or
            rotation. Update callback URLs before using them in a new
            environment.
          </p>
        </header>
        <DeveloperApplicationSettings
          application={{
            id: application.id,
            name: application.name,
            slug: application.slug,
            description: application.description,
            clientId: application.client_id,
            redirectUris: application.redirect_uris ?? [],
            allowedScopes: application.allowed_scopes ?? [],
            status: application.status,
            clientType: application.client_type,
            createdAt: application.created_at.toISOString(),
            discoveryUrl: `${issuer}/.well-known/openid-configuration`,
          }}
        />
      </div>
    </main>
  );
}
