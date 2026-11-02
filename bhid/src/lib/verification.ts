export const VERIFICATION_TIERS: Record<number, string> = {
  0: "Basic",
  1: "Premium",
  2: "Gold",
  3: "Platinum",
  4: "Diamond",
};

export function getVerificationTier(level: number): string | undefined {
  return VERIFICATION_TIERS[level];
}
