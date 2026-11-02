import MembershipTierSeal from "@/components/membership-tier-seal";
import VerificationBadge from "@/components/verification-badge";
import { isMembershipTier } from "@/lib/membership";

type Props = {
  verificationLevel: number;
  membershipTier: string;
};

export default function ProfileVerificationBadges({
  verificationLevel,
  membershipTier,
}: Props) {
  const activeMembershipTier =
    isMembershipTier(membershipTier) && membershipTier !== "BASIC"
      ? membershipTier
      : null;

  return (
    <span className="inline-flex items-center gap-1">
      {(!activeMembershipTier || verificationLevel > 0) && (
        <VerificationBadge level={verificationLevel} />
      )}
      {activeMembershipTier ? (
        <MembershipTierSeal tier={activeMembershipTier} />
      ) : null}
    </span>
  );
}
