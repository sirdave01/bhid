import MembershipBadge from "@/components/membership-badge";
import VerificationBadge from "@/components/verification-badge";

type Props = {
  verificationLevel: number;
  membershipTier: string;
};

export default function ProfileVerificationBadges({
  verificationLevel,
  membershipTier,
}: Props) {
  return (
    <span className="inline-flex items-center gap-1">
      <MembershipBadge tier={membershipTier} />
      {verificationLevel > 0 ? <VerificationBadge level={verificationLevel} /> : null}
    </span>
  );
}
