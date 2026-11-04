function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-zinc-800/80 ${className}`}
    />
  );
}

export default function OrganizationsLoading() {
  return (
    <main
      aria-busy="true"
      className="min-h-screen flex-1 bg-zinc-950 px-6 py-12 text-zinc-100"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex min-h-14 items-center border-b border-zinc-800 pb-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="ml-auto h-5 w-56" />
        </div>
        <section aria-label="Loading organizations" className="mt-10">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-9 w-64" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-32" key={index} />
            ))}
          </div>
          <p aria-live="polite" className="sr-only" role="status">
            Loading organization dashboard
          </p>
        </section>
      </div>
    </main>
  );
}
