import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import SignOutButton from "@/components/sign-out-button";
import { isFounderAccount } from "@/lib/founder-access";
import { getAuthenticatedSession } from "@/lib/session";

export default function AccountNavigation() {
  return (
    <Suspense
      fallback={
        <nav
          aria-label="Account navigation"
          className="flex min-h-14 items-center border-b border-zinc-800 pb-4"
        >
          <Image
            alt="BHID"
            className="h-10 w-10 rounded-lg"
            height={40}
            src="/icon.png"
            width={40}
          />
          <span className="sr-only">Loading account navigation</span>
        </nav>
      }
    >
      <AccountNavigationContent />
    </Suspense>
  );
}

async function AccountNavigationContent() {
  await connection();
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);
  const brand = (
    <Image
      alt="BHID"
      className="h-10 w-10 rounded-lg"
      height={40}
      src="/icon.png"
      width={40}
    />
  );

  return (
    <nav
      aria-label="Account navigation"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4"
    >
      {session ? (
        <span aria-label="BHID" className="flex items-center">
          {brand}
        </span>
      ) : (
        <Link aria-label="BHID home" className="flex items-center" href="/">
          {brand}
        </Link>
      )}

      {session ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
          <Link className="hover:text-white" href="/settings/profile">
            Profile
          </Link>
          <Link className="hover:text-white" href="/settings/security">
            Security
          </Link>
          <Link className="hover:text-white" href="/settings/wallet">
            Wallet
          </Link>
          <Link className="hover:text-white" href="/settings/password">
            Password
          </Link>
          {isFounderAccount(session) && (
            <Link className="hover:text-white" href="/founder">
              Founder
            </Link>
          )}
          <SignOutButton />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
          <Link className="hover:text-white" href="/login">
            Sign in
          </Link>
          <Link className="hover:text-white" href="/register">
            Create account
          </Link>
        </div>
      )}
    </nav>
  );
}
