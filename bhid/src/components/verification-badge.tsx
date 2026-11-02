import { getVerificationTier } from "@/lib/verification";

type Props = {
  level: number;
};

export default function VerificationBadge({ level }: Props) {
  const tier = getVerificationTier(level) ?? `Level ${level}`;

  return (
    <span
      aria-label={`${tier} identity verification`}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-500 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100"
      title={`${tier} identity verification`}
    >
      <span aria-hidden="true">✓</span>
      {tier} verification
    </span>
  );
}
