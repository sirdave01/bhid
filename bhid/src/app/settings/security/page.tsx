import type { Metadata } from "next";

import PasskeyManager from "./passkey-manager";
import SessionManager from "./session-manager";

export const metadata: Metadata = {
  title: "Security settings | BHID",
  description: "Review and manage your BHID account sessions.",
};

export default function SecuritySettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Security settings
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-600">
        Review devices with access to your account and revoke sessions you no
        longer recognize.
      </p>
      <PasskeyManager />
      <SessionManager />
    </main>
  );
}
