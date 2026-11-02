import VerificationBadge from "@/components/verification-badge";

type Props = {
  verificationLevel: number;
};

export default function ProfileVerificationBadges({
  verificationLevel,
}: Props) {
  return <VerificationBadge level={verificationLevel} />;
}
