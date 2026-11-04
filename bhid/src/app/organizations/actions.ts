"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFounderSession } from "@/lib/founder-access";
import pool from "@/lib/db";

function readText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function readNonnegativeInteger(formData: FormData, key: string) {
  const value = readText(formData, key, 20);
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${key}`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 2_147_483_647) {
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
  const monthlyMauLimit = readNonnegativeInteger(formData, "monthly_mau_limit");
  const monthlyApiLimit = readNonnegativeInteger(formData, "monthly_api_limit");
  const isActive = formData.get("is_active") === "on";

  if (
    (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !name ||
    (isActive &&
      (monthlyPrice === null || BigInt(monthlyPrice) === BigInt(0)))
  ) {
    throw new Error("Provide valid plan details and a nonzero price before activating it.");
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
           is_active = $9,
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
         monthly_mau_limit, monthly_api_limit, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        slug,
        name,
        description,
        monthlyPrice,
        includedTokens,
        monthlyMauLimit,
        monthlyApiLimit,
        isActive,
      ]
    );
  }

  revalidatePath("/organizations");
}
