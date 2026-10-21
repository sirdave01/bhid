import type { Metadata } from "next";

import EmailVerification from "./email-verification";
import PasskeyManager from "./passkey-manager";
import ProfileSettings from "./profile-settings";
import SessionManager from "./session-manager";
import TotpManager from "./totp-manager";
import WalletSettings from "./wallet-settings";

export const metadata: Metadata = {
  title: "Security settings | BHID",
  description: "Review and manage your BHID account sessions.",
};

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-300">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Security settings
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-300">
        Review devices with access to your account and revoke sessions you no
        longer recognize.
      </p>
      <ProfileSettings />
      <WalletSettings />
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
