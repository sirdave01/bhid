import type { Metadata } from "next";

import AccountNavigation from "@/components/account-navigation";
import ProfileSettings from "../security/profile-settings";

export const metadata: Metadata = {
  title: "Profile settings",
  description: "Manage your BHID profile details.",
};

export default function ProfileSettingsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-12 text-white">
      <AccountNavigation />
      <p className="mt-8 text-sm font-medium uppercase tracking-widest text-zinc-400">
        BHID account
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Profile settings
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-300">
        Manage your name, username, biography, profile picture, and date of
        birth.
      </p>
      <ProfileSettings />
    </main>
  );
}
