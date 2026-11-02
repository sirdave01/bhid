import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import FounderUserActions from "@/components/founder-user-actions";
import VerificationBadge from "@/components/verification-badge";
import pool from "@/lib/db";
import { getFounderSession } from "@/lib/founder-access";

type RegisteredUser = {
  id: string;
  bhid: string;
  email: string;
  username: string | null;
  display_name: string | null;
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

function getFounderPageHref(page: number, query: string) {
  const params = new URLSearchParams({ page: String(page) });

  if (query) {
    params.set("q", query);
  }

  return `/founder?${params.toString()}`;
}

type FounderPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
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

  const founderSession = await getFounderSession();

  if (!founderSession) {
    notFound();
  }

  const params = await searchParams;
  const searchTerm =
    typeof params.q === "string"
      ? params.q.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100)
      : "";
  const requestedPage =
    typeof params.page === "string" && Number.isSafeInteger(Number(params.page))
      ? Math.max(Number(params.page), 1)
      : 1;
  const searchCondition = `(
    $1::text IS NULL
    OR position(lower($1) in lower(COALESCE(p.username, ''))) > 0
    OR position(lower($1) in lower(u.email)) > 0
    OR position(lower($1) in lower(COALESCE(p.display_name, ''))) > 0
  )`;
  const searchValue = searchTerm || null;

  const [userCountResult, applicationsResult] = await Promise.all([
    pool.query<UserCount>(
      `SELECT COUNT(*)::text AS total
       FROM users AS u
       LEFT JOIN profiles AS p
         ON p.user_id = u.id
       WHERE ${searchCondition}`,
      [searchValue]
    ),
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
       u.id,
       u.bhid,
       u.email,
       p.username,
       p.display_name,
       u.status,
       u.verification_level,
       u.email_verified_at,
       u.created_at
     FROM users AS u
     LEFT JOIN profiles AS p
       ON p.user_id = u.id
     WHERE ${searchCondition}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $2 OFFSET $3`,
    [searchValue, usersPerPage, (page - 1) * usersPerPage]
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
              {searchTerm
                ? `Showing ${firstUser}–${lastUser} of ${totalUsers} matching accounts.`
                : `Showing ${firstUser}–${lastUser} of ${totalUsers} accounts.`}{" "}
              Passwords and session credentials are not displayed.
            </p>
          </div>
          <form
            action="/founder"
            className="mb-4 flex flex-wrap items-end gap-3"
            role="search"
          >
            <div className="flex min-w-64 flex-1 flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="user-search">
                Search by username, email, or full name
              </label>
              <input
                autoComplete="off"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                id="user-search"
                maxLength={100}
                name="q"
                placeholder="Enter a username, email, or name"
                type="search"
                defaultValue={searchTerm}
              />
            </div>
            <button
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              type="submit"
            >
              Search
            </button>
            {searchTerm && (
              <Link
                className="px-2 py-2 text-sm font-medium text-zinc-700 underline"
                href="/founder"
              >
                Clear
              </Link>
            )}
          </form>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-medium">BHID</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Full name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Email verified</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Registered (UTC)</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {user.bhid}
                    </td>
                    <td className="px-4 py-3">{user.username || "—"}</td>
                    <td className="px-4 py-3">{user.display_name || "—"}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.status}</td>
                    <td className="px-4 py-3">
                      {user.email_verified_at ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationBadge level={user.verification_level} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {user.id === founderSession.userId ? (
                        <span className="text-xs text-zinc-500">
                          Current account
                        </span>
                      ) : (
                        <FounderUserActions
                          status={user.status}
                          userId={user.id}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-zinc-500"
                      colSpan={9}
                    >
                      {searchTerm
                        ? "No users match that search."
                        : "No users are registered yet."}
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
                  href={getFounderPageHref(page - 1, searchTerm)}
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
                  href={getFounderPageHref(page + 1, searchTerm)}
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
