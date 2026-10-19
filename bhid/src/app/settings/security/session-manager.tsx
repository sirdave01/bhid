"use client";

import { useCallback, useEffect, useState } from "react";

type AuthSession = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  absoluteExpiresAt: string;
  isCurrent: boolean;
};

type SessionPage = {
  sessions: AuthSession[];
  nextCursor: string | null;
};

type SessionResponse = {
  data: SessionPage;
};

function isSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "userAgent" in value &&
    (typeof value.userAgent === "string" || value.userAgent === null) &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "lastUsedAt" in value &&
    (typeof value.lastUsedAt === "string" || value.lastUsedAt === null) &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string" &&
    "absoluteExpiresAt" in value &&
    typeof value.absoluteExpiresAt === "string" &&
    "isCurrent" in value &&
    typeof value.isCurrent === "boolean"
  );
}

function isSessionPage(value: unknown): value is SessionResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "sessions" in value.data &&
    Array.isArray(value.data.sessions) &&
    value.data.sessions.every(isSession) &&
    "nextCursor" in value.data &&
    (typeof value.data.nextCursor === "string" ||
      value.data.nextCursor === null)
  );
}

async function requestSessionPage(
  cursor: string | null,
  signal?: AbortSignal
): Promise<SessionPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`/api/auth/sessions${query}`, {
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json();

  if (response.status === 401) {
    throw new Error("Sign in to review your active sessions.");
  }

  if (!response.ok || !isSessionPage(payload)) {
    throw new Error("Unable to load your sessions. Please try again.");
  }

  return payload.data;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function SessionManager() {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const loadSessions = useCallback(async (cursor: string | null) => {
    setError(null);

    try {
      const page = await requestSessionPage(cursor);

      setSessions((current) =>
        cursor ? [...current, ...page.sessions] : page.sessions
      );
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your sessions. Please try again."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void requestSessionPage(null, controller.signal)
      .then((page) => {
        setSessions(page.sessions);
        setNextCursor(page.nextCursor);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your sessions. Please try again."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  async function revokeSession(session: AuthSession) {
    setRevokingId(session.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/auth/sessions/${encodeURIComponent(session.id)}`,
        { method: "DELETE" }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Unable to revoke this session. Please try again.";
        throw new Error(message);
      }

      setSessions((current) =>
        current.filter((item) => item.id !== session.id)
      );

      if (session.isCurrent) {
        setSignedOut(true);
        setNotice("This session has been revoked. Sign in again to continue.");
      } else {
        setNotice("Session revoked.");
      }
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Unable to revoke this session. Please try again."
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section
      aria-labelledby="active-sessions-heading"
      className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="active-sessions-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Active sessions
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Signed-in devices are listed here. Revoking a session signs that
            device out.
          </p>
        </div>
        {signedOut && (
          <a
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            href="/login"
          >
            Sign in
          </a>
        )}
      </div>

      {error && (
        <div
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}
      {notice && (
        <p className="mt-5 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600" role="status">
          Loading sessions…
        </p>
      ) : sessions.length === 0 ? (
        <p className="mt-6 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
          No active sessions were found.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-900">
                    {session.userAgent || "Unknown device"}
                  </p>
                  {session.isCurrent && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                      This device
                    </span>
                  )}
                </div>
                <dl className="mt-2 grid gap-1 text-sm text-zinc-600">
                  <div>
                    <dt className="inline font-medium">Started: </dt>
                    <dd className="inline">{formatDate(session.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Last active: </dt>
                    <dd className="inline">
                      {session.lastUsedAt
                        ? formatDate(session.lastUsedAt)
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Expires: </dt>
                    <dd className="inline">{formatDate(session.expiresAt)}</dd>
                  </div>
                </dl>
              </div>
              <button
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={revokingId !== null}
                onClick={() => void revokeSession(session)}
                type="button"
              >
                {revokingId === session.id
                  ? "Revoking…"
                  : session.isCurrent
                    ? "Sign out this device"
                    : "Revoke session"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          className="mt-6 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            void loadSessions(nextCursor);
          }}
          type="button"
        >
          {loadingMore ? "Loading…" : "Load more sessions"}
        </button>
      )}
    </section>
  );
}
