export const PLAN_FEATURE_NAMES = [
  "Organization dashboard",
  "Developer access",
  "OAuth 2.0 / OIDC",
  "User authentication",
  "Email verification",
  "MFA support",
  "Usage analytics",
  "Authentication logs",
  "Priority support",
  "Custom integration support",
  "Custom security arrangements",
] as const;

export const PLAN_FEATURE_VALUES = [
  "Included",
  "Basic",
  "Advanced",
  "Custom",
  "Standard",
  "Priority",
  "Dedicated",
  "Limited",
  "—",
] as const;

export type PlanFeatureName = (typeof PLAN_FEATURE_NAMES)[number];
export type PlanFeatureValue = (typeof PLAN_FEATURE_VALUES)[number];
export type PlanFeatureMatrix = Record<PlanFeatureName, PlanFeatureValue>;

export function formatPlanFeature(value: PlanFeatureValue) {
  return value === "Included" ? "✓" : value;
}

export function formatPlanLimit(value: number | null) {
  return value === null ? "Custom" : value.toLocaleString("en-US");
}
