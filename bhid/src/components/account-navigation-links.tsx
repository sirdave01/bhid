"use client";

import Link from "next/link";
import { useState } from "react";

import SignOutButton from "@/components/sign-out-button";

const authenticatedLinks = [
  ["Find people", "/users"],
  ["Profile", "/settings/profile"],
  ["Security", "/settings/security"],
  ["Wallet", "/settings/wallet"],
  ["Membership", "/membership"],
  ["Developers", "/developers"],
  ["Organizations", "/organizations"],
  ["Password", "/settings/password"],
] as const;

export default function AccountNavigationLinks({
  isAuthenticated,
  isFounder,
}: {
  isAuthenticated: boolean;
  isFounder: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = isAuthenticated
    ? [
        ...authenticatedLinks,
        ...(isFounder ? ([["Founder", "/founder"]] as const) : []),
      ]
    : ([
        ["Sign in", "/login"],
        ["Create account", "/register"],
      ] as const);

  return (
    <>
      <div className="hidden items-center gap-x-4 gap-y-2 text-sm text-zinc-300 md:flex">
        {links.map(([label, href]) => (
          <Link className="hover:text-white" href={href} key={href}>
            {label}
          </Link>
        ))}
        {isAuthenticated && <SignOutButton />}
      </div>

      <button
        aria-controls="account-navigation-menu"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 md:hidden"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        {menuOpen ? (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {menuOpen && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl md:hidden"
          id="account-navigation-menu"
        >
          <div className="flex flex-col gap-1 text-sm text-zinc-300">
            {links.map(([label, href]) => (
              <Link
                className="rounded-md px-3 py-2 hover:bg-zinc-800 hover:text-white"
                href={href}
                key={href}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            {isAuthenticated && (
              <div className="border-t border-zinc-800 px-3 pt-2">
                <SignOutButton />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
