
import type { Metadata } from "next";

import AccountNavigation from "@/components/account-navigation";
import ProfileSettings from "../security/profile-settings";

export const metadata: Metadata = {
  title: "Profile Settings | BHID",
  description:
    "Manage your ByteHaven Identity profile, personal information, and profile picture.",
};

export default function ProfileSettingsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <AccountNavigation />

      <header className="mt-8">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
          ByteHaven Identity
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Profile Settings
        </h1>

        <p className="mt-3 max-w-2xl text-zinc-300">
          Manage your BHID profile, upload your profile
          picture, and keep your personal information
          up to date.
        </p>
      </header>

      <ProfileSettings />
    </main>
  );
}
