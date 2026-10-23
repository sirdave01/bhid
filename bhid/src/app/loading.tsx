export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen flex-1 items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100"
    >
      <p aria-live="polite" className="text-sm text-zinc-400" role="status">
        Loading BHID…
      </p>
    </main>
  );
}
