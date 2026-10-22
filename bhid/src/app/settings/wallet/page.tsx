import type { Metadata } from "next";

import AccountNavigation from "@/components/account-navigation";
import WalletSettings from "../security/wallet-settings";

export const metadata: Metadata = {
  title: "Wallet settings",
  description: "Manage your verified BHID wallet connections.",
};

export default function WalletSettingsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <AccountNavigation />
      <p className="mt-8 text-sm font-medium uppercase tracking-widest text-zinc-400">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Wallet connections
      </h1>
      <WalletSettings />
    </main>
  );
}
