import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import AcceptOrganizationInvitation from "@/components/accept-organization-invitation";
import AccountNavigation from "@/components/account-navigation";
import { hashToken } from "@/lib/auth";
import pool from "@/lib/db";
import { getAuthenticatedSession } from "@/lib/session";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,50}$/;

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function OrganizationInvitationPage({
  params,
}: PageProps) {
  await connection();
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    notFound();
  }

  const session = await getAuthenticatedSession(
    (await cookies()).get("bhid_access")?.value
  );
  if (!session) {
    redirect(
      `/login?continue=${encodeURIComponent(`/organizations/invitations/${token}`)}`
    );
  }
  if (!session.emailVerified) {
    redirect("/settings/security");
  }

  const invitationResult = await pool.query<{
    organization_name: string;
    email: string;
    role_name: string;
    status: string;
    usable: boolean;
  }>(
    `SELECT
       o.name AS organization_name,
       i.email,
       r.display_name AS role_name,
       i.status,
       i.status = 'PENDING'
         AND i.expires_at > now()
         AND o.status = 'ACTIVE' AS usable
     FROM public.organization_invitations AS i
     JOIN public.organizations AS o ON o.id = i.organization_id
     JOIN public.organization_roles AS r ON r.role_key = i.role_key
     WHERE i.token_hash = $1
     LIMIT 1`,
    [hashToken(token)]
  );
  const invitation = invitationResult.rows[0];
  if (!invitation) {
    notFound();
  }

  return (
    <main className="min-h-screen flex-1 bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <AccountNavigation />
        <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-sm text-zinc-400">Organization invitation</p>
          <h1 className="mt-2 text-2xl font-semibold">
            Join {invitation.organization_name}
          </h1>
          {invitation.usable &&
          invitation.email.toLowerCase() === session.email.toLowerCase() ? (
            <>
              <p className="mt-3 text-sm text-zinc-300">
                You were invited as an {invitation.role_name.toLowerCase()}.
              </p>
              <div className="mt-5">
                <AcceptOrganizationInvitation token={token} />
              </div>
            </>
          ) : invitation.usable ? (
            <p className="mt-3 text-sm text-amber-200">
              This invitation was sent to {invitation.email}. Sign in with that
              verified email address to accept it.
            </p>
          ) : (
            <p className="mt-3 text-sm text-red-300">
              This invitation has expired or is no longer active.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
