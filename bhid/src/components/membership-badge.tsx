import {
  isMembershipTier,
  MEMBERSHIP_PRESENTATION,
  type MembershipTier,
} from "@/lib/membership";

type Props = {
  tier: string | null | undefined;
};

export default function MembershipBadge({ tier }: Props) {
  const resolvedTier: MembershipTier =
    tier && isMembershipTier(tier) ? tier : "BASIC";
  const presentation = MEMBERSHIP_PRESENTATION[resolvedTier];

  return (
    <span
      aria-label={`${presentation.label} membership`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${presentation.className}`}
      title={`${presentation.label} membership`}
    >
      <span aria-hidden="true">✓</span>
      {presentation.label}
    </span>
  );
}
