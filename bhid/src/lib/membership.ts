export const MEMBERSHIP_TIERS = [
  "BASIC",
  "PREMIUM",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
] as const;

export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const PAID_MEMBERSHIP_PRICES: Record<
  Exclude<MembershipTier, "BASIC">,
  bigint
> = {
  PREMIUM: BigInt(5000),
  GOLD: BigInt(10000),
  PLATINUM: BigInt(15000),
  DIAMOND: BigInt(20000),
};

export const MEMBERSHIP_PRESENTATION: Record<
  MembershipTier,
  { label: string; className: string }
> = {
  BASIC: {
    label: "Basic",
    className: "border-zinc-500 bg-zinc-800 text-zinc-100",
  },
  PREMIUM: {
    label: "Premium",
    className: "border-sky-400 bg-sky-950 text-sky-200",
  },
  GOLD: {
    label: "Gold",
    className: "border-amber-400 bg-amber-950 text-amber-200",
  },
  PLATINUM: {
    label: "Platinum",
    className: "border-slate-300 bg-slate-800 text-slate-100",
  },
  DIAMOND: {
    label: "Diamond",
    className: "border-cyan-300 bg-cyan-950 text-cyan-100",
  },
};

export function isMembershipTier(value: string): value is MembershipTier {
  return MEMBERSHIP_TIERS.includes(value as MembershipTier);
}
