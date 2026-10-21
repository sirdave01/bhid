import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import pool from "@/lib/db";
import { getFounderSession } from "@/lib/founder-access";

type RegisteredUser = {
  bhid: string;
  email: string;
  status: string;
  verification_level: number;
  email_verified_at: Date | null;
  created_at: Date;
};

type RegisteredApplication = {
  name: string;
  slug: string;
  description: string | null;
  status: string;
  client_type: string;
  redirect_uris: string[] | null;
  allowed_scopes: string[] | null;
  created_at: Date;
};

type UserCount = {
  total: string;
};

const usersPerPage = 50;

function formatDate(value: Date) {
  return value.toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

type FounderPageProps = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

export default function FounderPage({ searchParams }: FounderPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-600">
          Loading founder dashboard…
        </main>
      }
    >
      <FounderDashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function FounderDashboard({ searchParams }: FounderPageProps) {
  await connection();

  if (!(await getFounderSession())) {
    notFound();
  }

  const params = await searchParams;
  const requestedPage =
    typeof params.page === "string" && Number.isSafeInteger(Number(params.page))
      ? Math.max(Number(params.page), 1)
      : 1;

  const [userCountResult, applicationsResult] = await Promise.all([
    pool.query<UserCount>("SELECT COUNT(*)::text AS total FROM users"),
    pool.query<RegisteredApplication>(
      `SELECT
         name,
         slug,
         description,
         status,
         client_type,
         redirect_uris,
         allowed_scopes,
         created_at
       FROM applications
       ORDER BY created_at DESC, name ASC`
    ),
  ]);

  const totalUsers = Number(userCountResult.rows[0]?.total ?? "0");
  const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage));
  const page = Math.min(requestedPage, totalPages);

  const usersResult = await pool.query<RegisteredUser>(
    `SELECT
       bhid,
       email,
       status,
       verification_level,
       email_verified_at,
       created_at
     FROM users
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [usersPerPage, (page - 1) * usersPerPage]
  );

  const users = usersResult.rows;
  const applications = applicationsResult.rows;
  const firstUser = totalUsers === 0 ? 0 : (page - 1) * usersPerPage + 1;
  const lastUser = Math.min(page * usersPerPage, totalUsers);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">BHID</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Founder dashboard
            </h1>
          </div>
          <Link
            className="text-sm font-medium text-zinc-700 underline"
            href="/"
          >
            Back to home
          </Link>
        </header>

        <section aria-labelledby="users-heading" className="mb-12">
          <div className="mb-4">
            <h2 className="text-xl font-semibold" id="users-heading">
              Registered users
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Showing {firstUser}–{lastUser} of {totalUsers} accounts. Passwords
              and session credentials are not displayed.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-medium">BHID</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Email verified</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Registered (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((user) => (
                  <tr key={user.bhid}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {user.bhid}
                    </td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.status}</td>
                    <td className="px-4 py-3">
                      {user.email_verified_at ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">{user.verification_level}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-zinc-500"
                      colSpan={6}
                    >
                      No users are registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <nav
              aria-label="User pages"
              className="mt-4 flex items-center justify-between text-sm"
            >
              {page > 1 ? (
                <Link
                  className="font-medium text-zinc-700 underline"
                  href={`/founder?page=${page - 1}`}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-zinc-600">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  className="font-medium text-zinc-700 underline"
                  href={`/founder?page=${page + 1}`}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>

        <section aria-labelledby="applications-heading">
          <div className="mb-4">
            <h2 className="text-xl font-semibold" id="applications-heading">
              Applications using BHID
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              OAuth applications registered with BHID.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Application</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Client type</th>
                  <th className="px-4 py-3 font-medium">Allowed scopes</th>
                  <th className="px-4 py-3 font-medium">Redirect URIs</th>
                  <th className="px-4 py-3 font-medium">Created (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {applications.map((application) => (
                  <tr key={application.slug}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{application.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {application.slug}
                        {application.description
                          ? ` · ${application.description}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">{application.status}</td>
                    <td className="px-4 py-3">{application.client_type}</td>
                    <td className="px-4 py-3">
                      {application.allowed_scopes?.join(", ") || "None"}
                    </td>
                    <td className="max-w-xs whitespace-normal px-4 py-3 text-xs text-zinc-600">
                      {application.redirect_uris?.join(", ") || "None"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatDate(application.created_at)}
                    </td>
                  </tr>
                ))}
                {applications.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-zinc-500"
                      colSpan={6}
                    >
                      No applications are registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
