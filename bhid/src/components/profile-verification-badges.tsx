import MembershipBadge from "@/components/membership-badge";
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
  const activeMembership =
    isMembershipTier(membershipTier) && membershipTier !== "BASIC";

  return (
    <span className="inline-flex items-center gap-1">
      {(!activeMembership || verificationLevel > 0) && (
        <VerificationBadge level={verificationLevel} />
      )}
      {activeMembership ? <MembershipBadge tier={membershipTier} /> : null}
    </span>
  );
}
