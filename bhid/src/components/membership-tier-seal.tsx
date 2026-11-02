import type { MembershipTier } from "@/lib/membership";

type Props = {
  tier: Exclude<MembershipTier, "BASIC">;
};

const tierColors: Record<Props["tier"], string> = {
  PREMIUM: "text-sky-400",
  GOLD: "text-amber-400",
  PLATINUM: "text-slate-200",
  DIAMOND: "text-emerald-500",
};

const tierLabels: Record<Props["tier"], string> = {
  PREMIUM: "Premium",
  GOLD: "Gold",
  PLATINUM: "Platinum",
  DIAMOND: "Diamond",
};

export default function MembershipTierSeal({ tier }: Props) {
  return (
    <span
      aria-label={`${tierLabels[tier]} membership`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${tierColors[tier]}`}
      title={`${tierLabels[tier]} membership`}
    >
      <svg
        aria-hidden="true"
        className="h-full w-full drop-shadow-sm"
        viewBox="0 0 24 24"
      >
        <path
          d="m12 1.2 3.2 2.1 3.8-.1 1.2 3.6 3.2 2-1.1 3.6 1.1 3.6-3.2 2-1.2 3.6-3.8-.1-3.2 2.1-3.2-2.1-3.8.1-1.2-3.6-3.2-2 1.1-3.6-1.1-3.6 3.2-2 1.2-3.6 3.8.1L12 1.2Z"
          fill="currentColor"
          stroke="white"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
        <path
          d="m7.5 12.2 3 3 6.2-6.3"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    </span>
  );
}
