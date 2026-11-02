import { getVerificationTier } from "@/lib/verification";

type Props = {
  level: number;
};

const verificationStyles: Record<string, string> = {
  Basic: "text-slate-400",
  Premium: "text-sky-400",
  Gold: "text-amber-400",
  Platinum: "text-slate-200",
  Diamond: "text-yellow-400",
};

export default function VerificationBadge({ level }: Props) {
  const tier = getVerificationTier(level) ?? "Verified";

  return (
    <span
      aria-label={`${tier} identity verification`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${verificationStyles[tier] ?? "text-sky-400"}`}
      title={`${tier} identity verification`}
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
