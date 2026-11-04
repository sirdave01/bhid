"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFounderSession } from "@/lib/founder-access";
import pool from "@/lib/db";
import {
  PLAN_FEATURE_NAMES,
  PLAN_FEATURE_VALUES,
  type PlanFeatureMatrix,
} from "@/lib/organization-plans";

function readText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function readOptionalNonnegativeInteger(formData: FormData, key: string) {
  const value = readText(formData, key, 20);
  if (!value) {
    return null;
  }
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 0 || number > 2_147_483_647) {
    throw new Error(`Invalid ${key}`);
  }
  return number;
}

function readNonnegativeBigInt(formData: FormData, key: string) {
  const rawValue = formData.get(key);
  if (
    typeof rawValue !== "string" ||
    rawValue.length > 19 ||
    !/^\d+$/.test(rawValue)
  ) {
    throw new Error(`Invalid ${key}`);
  }
  const number = BigInt(rawValue);
  if (number > BigInt("9223372036854775807")) {
    throw new Error(`Invalid ${key}`);
  }
  return number.toString();
}

function readFeatureMatrix(formData: FormData): PlanFeatureMatrix {
  const entries = PLAN_FEATURE_NAMES.map((name) => {
    const value = readText(formData, `feature_${name}`, 20);
    if (
      !PLAN_FEATURE_VALUES.some(
        (supportedValue) => supportedValue === value
      )
    ) {
      throw new Error(`Invalid value for ${name}`);
    }
    return [name, value] as const;
  });

  return Object.fromEntries(entries) as PlanFeatureMatrix;
}

export async function saveSubscriptionPlan(formData: FormData) {
  if (!(await getFounderSession())) {
    redirect("/organizations");
  }

  const planId = readText(formData, "plan_id", 36);
  const slug = readText(formData, "slug", 80);
  const name = readText(formData, "name", 100);
  const description = readText(formData, "description", 500) || null;
  const priceValue = readText(formData, "monthly_price_hbt", 20);
  let monthlyPrice: string | null = null;
  if (priceValue) {
    const priceFormData = new FormData();
    priceFormData.set("monthly_price_hbt", priceValue);
    monthlyPrice = readNonnegativeBigInt(
      priceFormData,
      "monthly_price_hbt"
    );
  }
  const includedTokens = readNonnegativeBigInt(formData, "included_hbt_tokens");
  const monthlyMauLimit = readOptionalNonnegativeInteger(
    formData,
    "monthly_mau_limit"
  );
  const monthlyApiLimit = readOptionalNonnegativeInteger(
    formData,
    "monthly_api_limit"
  );
  const applicationIntegrationLimit = readOptionalNonnegativeInteger(
    formData,
    "application_integration_limit"
  );
  const planCategory = readText(formData, "plan_category", 20);
  const featureMatrix = readFeatureMatrix(formData);
  const isActive = formData.get("is_active") === "on";

  if (
    (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !name ||
    (isActive &&
      (monthlyPrice === null ||
        (BigInt(monthlyPrice) === BigInt(0) && slug !== "free-developer"))) ||
    !["BASIC", "STANDARD", "ADVANCED"].includes(planCategory)
  ) {
    throw new Error("Provide valid plan details and a supported plan category before activating it.");
  }

  if (planId) {
    const result = await pool.query(
      `UPDATE public.subscription_plans
       SET slug = $2,
           name = $3,
           description = $4,
           monthly_price_hbt = $5,
           included_hbt_tokens = $6,
           monthly_mau_limit = $7,
           monthly_api_limit = $8,
           application_integration_limit = $9,
           plan_category = $10,
           feature_matrix = $11,
           is_active = $12,
           updated_at = now()
       WHERE id = $1`,
      [
        planId,
        slug,
        name,
        description,
        monthlyPrice,
        includedTokens,
        monthlyMauLimit,
        monthlyApiLimit,
        applicationIntegrationLimit,
        planCategory,
        JSON.stringify(featureMatrix),
        isActive,
      ]
    );
    if (result.rowCount !== 1) {
      throw new Error("The subscription plan no longer exists.");
    }
  } else {
    await pool.query(
      `INSERT INTO public.subscription_plans (
         slug, name, description, monthly_price_hbt, included_hbt_tokens,
         monthly_mau_limit, monthly_api_limit, application_integration_limit,
         plan_category, feature_matrix, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        slug,
        name,
        description,
        monthlyPrice,
        includedTokens,
        monthlyMauLimit,
        monthlyApiLimit,
        applicationIntegrationLimit,
        planCategory,
        JSON.stringify(featureMatrix),
        isActive,
      ]
    );
  }

  revalidatePath("/organizations");
}
