export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="min-h-screen flex-1 bg-zinc-950 px-6 py-8 text-zinc-100"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex min-h-14 items-center border-b border-zinc-800 pb-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-800" />
          <span
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            Loading BHID…
          </span>
        </div>
        <div className="mt-10 animate-pulse space-y-4">
          <div className="h-3 w-24 rounded bg-zinc-800" />
          <div className="h-9 w-64 max-w-full rounded bg-zinc-800" />
          <div className="h-4 w-full max-w-xl rounded bg-zinc-900" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                className="h-32 rounded-xl border border-zinc-800 bg-zinc-900/70"
                key={item}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
