import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import AccountNavigationLinks from "@/components/account-navigation-links";
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
  const isFounder = isFounderAccount(session);
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
      className="relative flex min-h-14 items-center justify-between gap-3 border-b border-zinc-800 pb-4"
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

      <AccountNavigationLinks
        isAuthenticated={Boolean(session)}
        isFounder={isFounder}
      />
    </nav>
  );
}
