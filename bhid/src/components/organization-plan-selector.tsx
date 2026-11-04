"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Plan = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  monthlyMauLimit: number;
  monthlyApiLimit: number;
};

function formatPrice(value: string | null) {
  if (value === null) {
    return "Not configured";
  }
  try {
    return `${BigInt(value).toLocaleString("en-US")} HBT`;
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
    if (
      busyPlan ||
      !window.confirm(
        `Select ${plan.name}? An HBT invoice will be created. The subscription only becomes active after its Solana payment is verified.`
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
        {plans.map((plan) => (
          <li
            className="rounded-lg border border-zinc-800 p-4"
            key={plan.id}
          >
            <p className="font-medium">{plan.name}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {plan.description || "No description"}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {formatPrice(plan.price)} / month ·{" "}
              {Number(plan.monthlyMauLimit).toLocaleString("en-US")} MAU ·{" "}
              {Number(plan.monthlyApiLimit).toLocaleString("en-US")} API calls
            </p>
            <button
              className="mt-3 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={Boolean(busyPlan) || plan.name === currentPlanName}
              onClick={() => void selectPlan(plan)}
              type="button"
            >
              {busyPlan === plan.id
                ? "Creating invoice…"
                : plan.name === currentPlanName
                  ? "Current plan"
                  : "Select plan"}
            </button>
          </li>
        ))}
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
