import type { Metadata } from "next";

import AccountNavigation from "@/components/account-navigation";
import EmailVerification from "./email-verification";
import PasskeyManager from "./passkey-manager";
import SessionManager from "./session-manager";
import TotpManager from "./totp-manager";

export const metadata: Metadata = {
  title: "Security settings | BHID",
  description: "Manage MFA, passkeys, email verification, and sessions.",
};

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <AccountNavigation />
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-300">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight" id="security">
        Security settings
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-300">
        Manage authenticator MFA, passkeys, email verification, and the devices
        connected to your account.
      </p>
      <EmailVerification />
      <TotpManager />
      <PasskeyManager />
      <SessionManager />
      <p className="mt-8 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
        Phone verification is not available yet. BHID will show this option
        once a secure SMS provider is configured.
      </p>
    </main>
  );
}
