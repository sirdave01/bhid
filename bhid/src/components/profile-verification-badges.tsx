import MembershipTierSeal from "@/components/membership-tier-seal";
import { isMembershipTier, type MembershipTier } from "@/lib/membership";

type Props = {
  membershipTier: string;
};

export default function ProfileVerificationBadges({ membershipTier }: Props) {
  const tier: MembershipTier = isMembershipTier(membershipTier)
    ? membershipTier
    : "BASIC";

  return <MembershipTierSeal tier={tier} />;
}
