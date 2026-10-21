import Link from "next/link";

export default function AccountNavigation() {
  return (
    <nav
      aria-label="Account navigation"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4"
    >
      <Link className="font-semibold tracking-wide text-white" href="/">
        BHID
      </Link>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-300">
        <Link className="hover:text-white" href="/">
          Home
        </Link>
        <Link className="hover:text-white" href="/settings/security#profile">
          Profile
        </Link>
        <Link className="hover:text-white" href="/settings/security">
          Security
        </Link>
        <Link className="hover:text-white" href="/forgot-password">
          Password
        </Link>
      </div>
    </nav>
  );
}
