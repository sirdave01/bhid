"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  PLAN_FEATURE_NAMES,
  formatPlanFeature,
  formatPlanLimit,
  type PlanFeatureMatrix,
} from "@/lib/organization-plans";

type Plan = {
  id: string;
  name: string;
  category: "BASIC" | "STANDARD" | "ADVANCED";
  price: string | null;
  description: string | null;
  monthlyMauLimit: number | null;
  monthlyApiLimit: number | null;
  applicationIntegrationLimit: number | null;
  features: PlanFeatureMatrix;
};

function formatPrice(value: string | null) {
  if (value === null) {
    return "Not configured";
  }
  try {
    const price = BigInt(value);
    return price === BigInt(0)
      ? "Free"
      : `${price.toLocaleString("en-US")} HBT`;
  } catch {
    return "Not configured";
  }
}

export default function OrganizationPlanSelector({
  organizationId,
  plans,
  currentPlanName,
}: {
  organizationId: string;
  plans: Plan[];
  currentPlanName: string | null;
}) {
  const router = useRouter();
  const [busyPlan, setBusyPlan] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function selectPlan(plan: Plan) {
    const isFree = plan.price !== null && BigInt(plan.price) === BigInt(0);
    if (
      busyPlan ||
      !window.confirm(
        isFree
          ? `Activate the free ${plan.name} plan? No payment is required.`
          : `Select ${plan.name}? An HBT invoice will be created. The subscription only becomes active after its Solana payment is verified.`
      )
    ) {
      return;
    }

    setBusyPlan(plan.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/subscriptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id }),
        }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "";
        throw new Error(
          code === "plan_unavailable"
            ? "This plan is not currently available."
            : "Unable to select this plan."
        );
      }

      if (
        typeof payload === "object" &&
        payload !== null &&
        "status" in payload &&
        payload.status === "ACTIVE"
      ) {
        setMessage(`${plan.name} is active. No payment was required.`);
      } else {
        setMessage(
          `Invoice ${
            typeof payload === "object" &&
            payload !== null &&
            "invoiceNumber" in payload &&
            typeof payload.invoiceNumber === "string"
              ? payload.invoiceNumber
              : ""
          } created. Verify its Solana payment to activate the plan.`
        );
      }
      router.refresh();
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Unable to select this plan."
      );
    } finally {
      setBusyPlan("");
    }
  }

  return (
    <div>
      <ul className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => {
          const isFree = plan.price !== null && BigInt(plan.price) === BigInt(0);
          return (
            <li
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
              key={plan.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{plan.name}</p>
                <span className="rounded-full border border-indigo-800 px-2 py-0.5 text-xs text-indigo-200">
                  {plan.category.charAt(0) +
                    plan.category.slice(1).toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {plan.description || "No description"}
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                {formatPrice(plan.price)} / month ·{" "}
                {formatPlanLimit(plan.monthlyMauLimit)} MAU ·{" "}
                {formatPlanLimit(plan.monthlyApiLimit)} API calls ·{" "}
                {formatPlanLimit(plan.applicationIntegrationLimit)} integrations
              </p>
              <dl className="mt-4 grid gap-x-3 gap-y-2 border-t border-zinc-800 pt-3 text-xs sm:grid-cols-2">
                {PLAN_FEATURE_NAMES.map((feature) => (
                  <div className="flex justify-between gap-2" key={feature}>
                    <dt className="text-zinc-500">{feature}</dt>
                    <dd className="text-right text-zinc-300">
                      {formatPlanFeature(plan.features[feature])}
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                className="mt-3 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={Boolean(busyPlan) || plan.name === currentPlanName}
                onClick={() => void selectPlan(plan)}
                type="button"
              >
                {busyPlan === plan.id
                  ? isFree
                    ? "Activating…"
                    : "Creating invoice…"
                  : plan.name === currentPlanName
                    ? "Current plan"
                    : "Select plan"}
              </button>
            </li>
          );
        })}
      </ul>
      {message && (
        <p className="mt-3 text-sm text-emerald-200" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
