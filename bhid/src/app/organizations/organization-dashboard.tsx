import Link from "next/link";

import { saveSubscriptionPlan } from "@/app/organizations/actions";
import OrganizationCreateForm from "@/components/organization-create-form";
import OrganizationApplicationLinkForm from "@/components/organization-application-link-form";
import OrganizationApplicationAssignments from "@/components/organization-application-assignments";
import OrganizationInviteForm from "@/components/organization-invite-form";
import OrganizationInvoicePayment from "@/components/organization-invoice-payment";
import OrganizationMemberActions from "@/components/organization-member-actions";
import OrganizationPlanSelector from "@/components/organization-plan-selector";
import OrganizationProfileForm from "@/components/organization-profile-form";
import FounderOrganizationStatus from "@/components/founder-organization-status";
import { isFounderAccount } from "@/lib/founder-access";
import pool from "@/lib/db";
import {
  PLAN_FEATURE_NAMES,
  PLAN_FEATURE_VALUES,
  type PlanFeatureMatrix,
} from "@/lib/organization-plans";

type DashboardProps = {
  email: string;
  userId: string;
};

type FounderPaymentRow = {
  organization_id: string;
  organization_name: string;
  invoice_number: string | null;
  amount_hbt: string;
  status: string;
  solana_signature: string | null;
  submitted_at: Date | string;
  verified_at: Date | string | null;
};

type OrganizationMembership = {
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  role_key: string;
  role_name: string;
};

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_price_hbt: string | null;
  included_hbt_tokens: string;
  monthly_mau_limit: number | null;
  monthly_api_limit: number | null;
  application_integration_limit: number | null;
  plan_category: "BASIC" | "STANDARD" | "ADVANCED";
  feature_matrix: PlanFeatureMatrix;
  is_active: boolean;
};

type FounderSummary = {
  organizations: string;
  applications: string;
  plans: string;
  mau: string;
  invoices: string;
  verified_payments: string;
  submitted_payments: string;
  verified_revenue_hbt: string;
  outstanding_invoices: string;
};

type FounderOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_name: string | null;
  member_count: string;
  application_count: string;
};

type FounderApplicationRow = {
  name: string;
  slug: string;
  status: string;
  client_type: string;
  organization_name: string | null;
};

type FounderInvoiceRow = {
  id: string;
  organization_id: string;
  invoice_number: string;
  organization_name: string;
  amount_hbt: string;
  status: string;
  due_at: Date | string | null;
};

type ApplicationRow = {
  organization_id: string;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
};

type OwnedApplicationRow = {
  id: string;
  name: string;
  slug: string;
};

type MemberRow = {
  organization_id: string;
  user_id: string;
  email: string;
  role_key: string;
  role_name: string;
};

type ApplicationAssignmentRow = {
  organization_id: string;
  application_id: string;
  user_id: string;
};

type InvitationRow = {
  organization_id: string;
  email: string;
  role_name: string;
  expires_at: Date | string;
};

type SubscriptionRow = {
  organization_id: string;
  status: string;
  plan_name: string | null;
  monthly_price_hbt: string | null;
  included_hbt_tokens: string | null;
  monthly_mau_limit: number | null;
  monthly_api_limit: number | null;
};

type UsageRow = {
  organization_id: string;
  metric: string;
  quantity: string;
};

type InvoiceRow = {
  organization_id: string;
  id: string;
  invoice_number: string;
  amount_hbt: string;
  status: string;
  created_at: Date | string;
  due_at: Date | string | null;
  has_verified_payment: boolean;
};

type PaymentRow = {
  organization_id: string;
  amount_hbt: string;
  status: string;
  submitted_at: Date | string;
  invoice_number: string | null;
};

type AssignedApplicationRow = {
  organization_name: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  client_id: string;
  redirect_uris: string[] | null;
  allowed_scopes: string[] | null;
  mau: string;
  api_calls: string;
  recent_logins: string;
  last_login_at: Date | string | null;
};

function formatHbt(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return "Not configured";
  }
  try {
    return `${BigInt(value).toLocaleString("en-US")} HBT`;
  } catch {
    return "Not configured";
  }
}

function formatCount(value: string | number | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count.toLocaleString("en-US") : "0";
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en", {
        dateStyle: "medium",
        timeZone: "UTC",
      });
}

function readableStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function Card({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {detail && <p className="mt-2 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FounderPlanForm({ plan }: { plan?: Plan }) {
  const defaultFeatures = Object.fromEntries(
    PLAN_FEATURE_NAMES.map((name) => [
      name,
      plan?.feature_matrix[name] ?? "—",
    ])
  );

  return (
    <form
      action={saveSubscriptionPlan}
      className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-2"
    >
      {plan && <input name="plan_id" type="hidden" value={plan.id} />}
      <label className="text-sm text-zinc-300">
        Plan name
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.name ?? ""}
          maxLength={100}
          name="name"
          required
        />
      </label>
      <label className="text-sm text-zinc-300">
        Slug
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.slug ?? ""}
          maxLength={80}
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
        />
      </label>
      <label className="text-sm text-zinc-300 md:col-span-2">
        Description
        <textarea
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.description ?? ""}
          maxLength={500}
          name="description"
          rows={2}
        />
      </label>
      <label className="text-sm text-zinc-300">
        Plan category
        <select
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.plan_category ?? "STANDARD"}
          name="plan_category"
        >
          <option value="BASIC">Basic</option>
          <option value="STANDARD">Standard</option>
          <option value="ADVANCED">Advanced</option>
        </select>
      </label>
      <label className="text-sm text-zinc-300">
        Monthly price (HBT)
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.monthly_price_hbt ?? ""}
          min={0}
          name="monthly_price_hbt"
          placeholder="Leave blank until configured"
          type="number"
        />
      </label>
      <label className="text-sm text-zinc-300">
        Included HBT tokens / month
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.included_hbt_tokens ?? "0"}
          min={0}
          name="included_hbt_tokens"
          required
          type="number"
        />
      </label>
      <label className="text-sm text-zinc-300">
        Monthly MAU limit
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.monthly_mau_limit ?? ""}
          min={0}
          name="monthly_mau_limit"
          placeholder="Custom"
          type="number"
        />
      </label>
      <label className="text-sm text-zinc-300">
        Monthly API calls limit
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.monthly_api_limit ?? ""}
          min={0}
          name="monthly_api_limit"
          placeholder="Custom"
          type="number"
        />
      </label>
      <label className="text-sm text-zinc-300">
        Application integrations
        <input
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          defaultValue={plan?.application_integration_limit ?? ""}
          min={0}
          name="application_integration_limit"
          placeholder="Custom"
          type="number"
        />
      </label>
      <fieldset className="grid gap-3 rounded-lg border border-zinc-800 p-3 md:col-span-2 md:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-zinc-300">
          Plan features
        </legend>
        {PLAN_FEATURE_NAMES.map((name) => (
          <label className="text-xs text-zinc-400" key={name}>
            {name}
            <select
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              defaultValue={defaultFeatures[name]}
              name={`feature_${name}`}
            >
              {PLAN_FEATURE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value === "Included" ? "✓ Included" : value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
        <input
          defaultChecked={plan?.is_active ?? false}
          name="is_active"
          type="checkbox"
        />
        Available to organizations
      </label>
      <button
        className="w-fit rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        type="submit"
      >
        {plan ? "Save plan" : "Add plan"}
      </button>
    </form>
  );
}

export default async function OrganizationDashboard({
  email,
  userId,
}: DashboardProps) {
  const founder = isFounderAccount({ userId, email });
  if (founder) {
    return <FounderDashboard />;
  }

  const membershipsResult = await pool.query<OrganizationMembership>(
    `SELECT
       o.id AS organization_id,
       o.name,
       o.slug,
       o.status,
       r.role_key,
       r.display_name AS role_name
     FROM public.organization_members AS m
     JOIN public.organizations AS o ON o.id = m.organization_id
     JOIN public.organization_roles AS r ON r.role_key = m.role_key
     WHERE m.user_id = $1
     ORDER BY o.name`,
    [userId]
  );
  const memberships = membershipsResult.rows;
  const adminOrgs = memberships.filter(
    (membership) =>
      membership.role_key === "owner" || membership.role_key === "admin"
  );
  const organizationIds = adminOrgs.map((membership) => membership.organization_id);
  const ownedApplicationsResult = organizationIds.length
    ? await pool.query<OwnedApplicationRow>(
        `SELECT id, name, slug
         FROM public.applications
         WHERE status <> 'SUSPENDED'
           AND (
             owner_user_id = $1
             OR EXISTS (
               SELECT 1
               FROM public.organization_members AS owner_members
               WHERE owner_members.organization_id = ANY($2::uuid[])
                 AND owner_members.user_id = applications.owner_user_id
             )
           )
         ORDER BY name`,
        [userId, organizationIds]
      )
    : { rows: [] as OwnedApplicationRow[] };

  const applicationAssignmentsResult = organizationIds.length
    ? await pool.query<ApplicationAssignmentRow>(
        `SELECT organization_id, application_id, user_id
         FROM public.organization_application_members
         WHERE organization_id = ANY($1::uuid[])`,
        [organizationIds]
      )
    : { rows: [] as ApplicationAssignmentRow[] };

  const [
    appsResult,
    membersResult,
    invitationsResult,
    subscriptionsResult,
    usageResult,
    invoicesResult,
    paymentsResult,
    plansResult,
  ] = organizationIds.length
    ? await Promise.all([
        pool.query<ApplicationRow>(
          `SELECT
             oa.organization_id,
             a.id,
             a.name,
             a.slug,
             a.description,
             a.status::text AS status
           FROM public.organization_applications AS oa
           JOIN public.applications AS a ON a.id = oa.application_id
           WHERE oa.organization_id = ANY($1::uuid[])
           ORDER BY a.name`,
          [organizationIds]
        ),
        pool.query<MemberRow>(
          `SELECT m.organization_id, m.user_id, u.email, m.role_key,
                  r.display_name AS role_name
           FROM public.organization_members AS m
           JOIN public.users AS u ON u.id = m.user_id
           JOIN public.organization_roles AS r ON r.role_key = m.role_key
           WHERE m.organization_id = ANY($1::uuid[])
           ORDER BY m.organization_id, r.role_key, u.email`,
          [organizationIds]
        ),
        pool.query<InvitationRow>(
          `SELECT i.organization_id, i.email, r.display_name AS role_name, i.expires_at
           FROM public.organization_invitations AS i
           JOIN public.organization_roles AS r ON r.role_key = i.role_key
           WHERE i.organization_id = ANY($1::uuid[])
             AND i.status = 'PENDING'
             AND i.expires_at > now()
           ORDER BY i.organization_id, i.created_at DESC`,
          [organizationIds]
        ),
        pool.query<SubscriptionRow>(
          `SELECT DISTINCT ON (s.organization_id)
             s.organization_id,
             s.status,
             p.name AS plan_name,
             p.monthly_price_hbt::text AS monthly_price_hbt,
             p.included_hbt_tokens::text AS included_hbt_tokens,
             p.monthly_mau_limit,
             p.monthly_api_limit
           FROM public.subscriptions AS s
           LEFT JOIN public.subscription_plans AS p ON p.id = s.plan_id
           WHERE s.organization_id = ANY($1::uuid[])
             AND s.status IN ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE')
           ORDER BY s.organization_id, s.created_at DESC`,
          [organizationIds]
        ),
        pool.query<UsageRow>(
          `SELECT organization_id, metric, SUM(quantity)::text AS quantity
           FROM public.usage_records
           WHERE organization_id = ANY($1::uuid[])
             AND period_start = date_trunc('month', current_date)::date
             AND metric IN ('MAU', 'API_CALLS', 'HBT_TOKENS')
             AND (metric <> 'MAU' OR application_id IS NULL)
           GROUP BY organization_id, metric`,
          [organizationIds]
        ),
        pool.query<InvoiceRow>(
          `SELECT
             ranked.organization_id,
                 ranked.id,
                 ranked.invoice_number,
             ranked.amount_hbt,
             ranked.status,
             ranked.created_at,
             ranked.due_at,
             EXISTS (
               SELECT 1
               FROM public.payments AS p
               WHERE p.invoice_id = ranked.id
                 AND p.status = 'VERIFIED'
             ) AS has_verified_payment
           FROM (
             SELECT i.*, row_number() OVER (
               PARTITION BY i.organization_id ORDER BY i.created_at DESC
             ) AS position
             FROM public.invoices AS i
             WHERE i.organization_id = ANY($1::uuid[])
           ) AS ranked
           WHERE ranked.position <= 8
           ORDER BY ranked.organization_id, ranked.created_at DESC`,
          [organizationIds]
        ),
        pool.query<PaymentRow>(
          `SELECT
             ranked.organization_id,
             ranked.amount_hbt,
             ranked.status,
             ranked.submitted_at,
             i.invoice_number
           FROM (
             SELECT p.*, row_number() OVER (
               PARTITION BY p.organization_id ORDER BY p.submitted_at DESC
             ) AS position
             FROM public.payments AS p
             WHERE p.organization_id = ANY($1::uuid[])
           ) AS ranked
           LEFT JOIN public.invoices AS i ON i.id = ranked.invoice_id
           WHERE ranked.position <= 8
           ORDER BY ranked.organization_id, ranked.submitted_at DESC`,
          [organizationIds]
        ),
        pool.query<Plan>(
          `SELECT id, slug, name, description, monthly_price_hbt::text,
                  included_hbt_tokens::text, monthly_mau_limit, monthly_api_limit,
                  application_integration_limit, plan_category, feature_matrix,
                  is_active
           FROM public.subscription_plans
           WHERE is_active = true
           ORDER BY sort_order, name`
        ),
      ])
    : [
        { rows: [] as ApplicationRow[] },
        { rows: [] as MemberRow[] },
        { rows: [] as InvitationRow[] },
        { rows: [] as SubscriptionRow[] },
        { rows: [] as UsageRow[] },
        { rows: [] as InvoiceRow[] },
        { rows: [] as PaymentRow[] },
        { rows: [] as Plan[] },
      ];

  const assignedApplicationsResult = await pool.query<AssignedApplicationRow>(
    `SELECT
       o.name AS organization_name,
       a.name,
       a.slug,
       a.description,
       a.status::text AS status,
       a.client_id,
       a.redirect_uris,
       a.allowed_scopes,
       COALESCE(SUM(u.quantity) FILTER (WHERE u.metric = 'MAU'), 0)::text AS mau,
       COALESCE(SUM(u.quantity) FILTER (WHERE u.metric = 'API_CALLS'), 0)::text AS api_calls,
       (SELECT COUNT(*)::text
        FROM public.application_authentication_logs AS auth_log
        WHERE auth_log.organization_id = o.id
          AND auth_log.application_id = a.id
          AND auth_log.recorded_at >= date_trunc('month', current_date)) AS recent_logins,
       (SELECT MAX(auth_log.recorded_at)
        FROM public.application_authentication_logs AS auth_log
        WHERE auth_log.organization_id = o.id
          AND auth_log.application_id = a.id) AS last_login_at
     FROM public.organization_members AS m
     JOIN public.organizations AS o ON o.id = m.organization_id
     JOIN public.organization_applications AS oa ON oa.organization_id = o.id
     JOIN public.organization_application_members AS assignment
       ON assignment.organization_id = oa.organization_id
       AND assignment.application_id = oa.application_id
       AND assignment.user_id = m.user_id
     JOIN public.applications AS a
       ON a.id = oa.application_id
     LEFT JOIN public.usage_records AS u
       ON u.organization_id = o.id
       AND u.application_id = a.id
       AND u.period_start = date_trunc('month', current_date)::date
       AND u.metric IN ('MAU', 'API_CALLS')
     WHERE m.user_id = $1 AND m.role_key = 'developer'
     GROUP BY o.id, o.name, a.id, a.name, a.slug, a.description, a.status
     ORDER BY o.name, a.name`,
    [userId]
  );

  if (memberships.length === 0 && assignedApplicationsResult.rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-lg font-semibold">No organization access yet</h2>
        <p className="mt-2 text-sm text-zinc-400">
          You do not belong to an organization. Applications you own remain
          available in the developer portal. Create an organization to manage
          its applications, members, usage, and billing.
        </p>
        <Link
          className="mt-4 inline-flex rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          href="/developers"
        >
          Open developer portal
        </Link>
        <OrganizationCreateForm />
      </div>
    );
  }

  const appsByOrg = groupBy(appsResult.rows, "organization_id");
  const membersByOrg = groupBy(membersResult.rows, "organization_id");
  const invitationsByOrg = groupBy(invitationsResult.rows, "organization_id");
  const subscriptionsByOrg = groupBy(subscriptionsResult.rows, "organization_id");
  const usageByOrg = groupBy(usageResult.rows, "organization_id");
  const invoicesByOrg = groupBy(invoicesResult.rows, "organization_id");
  const paymentsByOrg = groupBy(paymentsResult.rows, "organization_id");
  const assignmentsByOrg = groupBy(
    applicationAssignmentsResult.rows,
    "organization_id"
  );

  return (
    <div className="space-y-8">
      {memberships.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Your organizations</h2>
          <div className="mt-4 space-y-5">
            {memberships.map((organization) => {
              const isAdmin =
                organization.role_key === "owner" ||
                organization.role_key === "admin";
              if (!isAdmin) {
                return (
                  <article
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
                    key={organization.organization_id}
                  >
                    <h3 className="text-lg font-semibold">{organization.name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      {organization.role_name} · {readableStatus(organization.status)}
                    </p>
                    <p className="mt-3 text-sm text-zinc-400">
                      Ask an organization owner or administrator for access to
                      organization management and billing records.
                    </p>
                  </article>
                );
              }

              const usage = usageByOrg[organization.organization_id] ?? [];
              const mau = metricQuantity(usage, "MAU");
              const apiCalls = metricQuantity(usage, "API_CALLS");
              const subscription =
                subscriptionsByOrg[organization.organization_id]?.[0];
              return (
                <article
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
                  key={organization.organization_id}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold">{organization.name}</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        @{organization.slug} · {readableStatus(organization.status)} ·{" "}
                        {organization.role_name}
                      </p>
                    </div>
                    <Link
                      className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
                      href="/developers"
                    >
                      Manage applications
                    </Link>
                  </header>

                  <Section title="Organization profile">
                    <OrganizationProfileForm
                      initialName={organization.name}
                      organizationId={organization.organization_id}
                    />
                  </Section>

                  <Section title="Applications">
                    <OrganizationApplicationLinkForm
                      applications={ownedApplicationsResult.rows.filter(
                        (candidate) =>
                          !(appsByOrg[organization.organization_id] ?? []).some(
                            (application) => application.id === candidate.id
                          )
                      )}
                      organizationId={organization.organization_id}
                    />
                    {(appsByOrg[organization.organization_id] ?? []).length ? (
                      <ul className="divide-y divide-zinc-800">
                        {(appsByOrg[organization.organization_id] ?? []).map(
                          (application) => (
                            <li className="py-3 first:pt-0 last:pb-0" key={application.id}>
                              <p className="font-medium">{application.name}</p>
                              <p className="mt-1 text-sm text-zinc-400">
                                @{application.slug} · {readableStatus(application.status)}
                                {application.description
                                  ? ` · ${application.description}`
                                  : ""}
                              </p>
                              <OrganizationApplicationAssignments
                                applicationId={application.id}
                                assignedUserIds={(
                                  assignmentsByOrg[organization.organization_id] ?? []
                                )
                                  .filter(
                                    (assignment) =>
                                      assignment.application_id === application.id
                                  )
                                  .map((assignment) => assignment.user_id)}
                                developers={(
                                  membersByOrg[organization.organization_id] ?? []
                                )
                                  .filter(
                                    (member) => member.role_key === "developer"
                                  )
                                  .map((member) => ({
                                    userId: member.user_id,
                                    email: member.email,
                                  }))}
                                organizationId={organization.organization_id}
                              />
                            </li>
                          )
                        )}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-400">
                        No applications are linked to this organization yet.
                      </p>
                    )}
                  </Section>

                  <Section title="Members and invitations">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">
                          Members
                        </h4>
                        <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                          {(membersByOrg[organization.organization_id] ?? []).map(
                            (member) => (
                              <li
                                className="flex flex-wrap items-center justify-between gap-2"
                                key={`${member.email}-${member.role_name}`}
                              >
                                <span>{member.email}</span>
                                <span className="text-xs">{member.role_name}</span>
                                <OrganizationMemberActions
                                  canManageAdmins={organization.role_key === "owner"}
                                  organizationId={organization.organization_id}
                                  role={member.role_key}
                                  userId={member.user_id}
                                />
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-zinc-300">
                          Invite a member
                        </h4>
                        <OrganizationInviteForm
                          canInviteAdmins={organization.role_key === "owner"}
                          organizationId={organization.organization_id}
                        />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">
                          Pending invitations
                        </h4>
                        {(invitationsByOrg[organization.organization_id] ?? [])
                          .length ? (
                          <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                            {(invitationsByOrg[organization.organization_id] ?? []).map(
                              (invitation) => (
                                <li key={`${invitation.email}-${invitation.expires_at}`}>
                                  {invitation.email} · {invitation.role_name} · expires{" "}
                                  {formatDate(invitation.expires_at)}
                                </li>
                              )
                            )}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-zinc-500">
                            No pending invitations. Invitation delivery is not
                            configured here.
                          </p>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section title="Monthly usage and limits">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Card
                        detail={
                          subscription?.monthly_mau_limit === null ||
                          subscription?.monthly_mau_limit === undefined
                            ? "Custom plan limit"
                            : `Limit: ${formatCount(subscription.monthly_mau_limit)} MAU · Remaining: ${formatCount(Math.max(0, subscription.monthly_mau_limit - Number(mau)))}`
                        }
                        title="Reported MAU"
                        value={formatCount(mau)}
                      />
                      <Card
                        detail={
                          subscription?.monthly_api_limit === null ||
                          subscription?.monthly_api_limit === undefined
                            ? "Custom plan limit"
                            : `Limit: ${formatCount(subscription.monthly_api_limit)} calls · Remaining: ${formatCount(Math.max(0, subscription.monthly_api_limit - Number(apiCalls)))}`
                        }
                        title="API calls"
                        value={formatCount(apiCalls)}
                      />
                      <Card
                        title="HBT tokens"
                        value={formatHbt(metricQuantity(usage, "HBT_TOKENS"))}
                      />
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">
                      Usage reflects recorded data for the current calendar
                      month. MAU is the sum of submitted usage records.
                    </p>
                  </Section>

                  <Section title="Subscription">
                    {subscription ? (
                      <div className="text-sm text-zinc-300">
                        <p>
                          {subscription.plan_name ?? "Unassigned plan"} ·{" "}
                          {readableStatus(subscription.status)}
                        </p>
                        <p className="mt-1 text-zinc-400">
                          {formatHbt(subscription.monthly_price_hbt)} per month ·{" "}
                          {formatHbt(subscription.included_hbt_tokens)} included
                          monthly
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400">
                        No current subscription is recorded.
                      </p>
                    )}
                    <p className="mt-3 text-sm text-amber-200">
                      A plan must be configured before it can be offered. This
                      page does not initiate payment; submitted payments require
                      Solana verification before they count as paid.
                    </p>
                  </Section>

                  <Section title="Invoices and payments">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">
                          Recent invoices
                        </h4>
                        {(invoicesByOrg[organization.organization_id] ?? [])
                          .length ? (
                          <ul className="mt-2 space-y-3 text-sm">
                            {(invoicesByOrg[organization.organization_id] ?? []).map(
                              (invoice) => (
                                <li
                                  className="flex flex-wrap justify-between gap-2 border-b border-zinc-800 pb-2"
                                  key={invoice.invoice_number}
                                >
                                  <span>
                                    {invoice.invoice_number} ·{" "}
                                    {invoice.has_verified_payment ||
                                    invoice.status === "PAID"
                                      ? "paid"
                                      : invoice.status === "OPEN" &&
                                            invoice.due_at !== null &&
                                            new Date(invoice.due_at).getTime() <
                                              Date.now()
                                        ? "overdue"
                                        : invoice.status === "OPEN"
                                          ? "pending"
                                          : readableStatus(invoice.status)}
                                  </span>
                                  <span className="text-zinc-400">
                                    {formatHbt(invoice.amount_hbt)} ·{" "}
                                    {formatDate(invoice.created_at)}
                                  </span>
                                  <Link
                                    className="text-indigo-300 underline"
                                    href={`/api/organizations/${organization.organization_id}/invoices/${invoice.id}`}
                                  >
                                    Download
                                  </Link>
                                  {isAdmin &&
                                    ["OPEN", "OVERDUE"].includes(invoice.status) && (
                                      <OrganizationInvoicePayment
                                        invoiceId={invoice.id}
                                        organizationId={organization.organization_id}
                                      />
                                    )}
                                </li>
                              )
                            )}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-zinc-500">
                            No invoices recorded.
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300">
                          Recent payment records
                        </h4>
                        {(paymentsByOrg[organization.organization_id] ?? [])
                          .length ? (
                          <ul className="mt-2 space-y-3 text-sm">
                            {(paymentsByOrg[organization.organization_id] ?? []).map(
                              (payment, index) => (
                                <li
                                  className="flex flex-wrap justify-between gap-2 border-b border-zinc-800 pb-2"
                                  key={`${payment.submitted_at}-${index}`}
                                >
                                  <span>
                                    {payment.invoice_number ?? "Payment"} ·{" "}
                                    {readableStatus(payment.status)}
                                  </span>
                                  <span className="text-zinc-400">
                                    {formatHbt(payment.amount_hbt)} ·{" "}
                                    {formatDate(payment.submitted_at)}
                                  </span>
                                </li>
                              )
                            )}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-zinc-500">
                            No payment records. No payment is assumed complete
                            unless its Solana transaction is verified.
                          </p>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section title="Available plans">
                    {plansResult.rows.length ? (
                      <OrganizationPlanSelector
                        currentPlanName={subscription?.plan_name ?? null}
                        organizationId={organization.organization_id}
                        plans={plansResult.rows.map((plan) => ({
                          id: plan.id,
                          name: plan.name,
                          category: plan.plan_category,
                          description: plan.description,
                          price: plan.monthly_price_hbt,
                          monthlyMauLimit: plan.monthly_mau_limit,
                          monthlyApiLimit: plan.monthly_api_limit,
                          applicationIntegrationLimit:
                            plan.application_integration_limit,
                          features: plan.feature_matrix,
                        }))}
                      />
                    ) : (
                      <p className="text-sm text-zinc-400">
                        No active plans are configured yet.
                      </p>
                    )}
                    <p className="mt-3 text-sm text-amber-200">
                      Selecting a plan creates an invoice. A subscription only
                      changes after its HBT transfer to the configured treasury
                      is verified on Solana.
                    </p>
                  </Section>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {assignedApplicationsResult.rows.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Applications assigned to you</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Only applications explicitly assigned to your developer
            memberships are shown. Client secrets and other
            credentials are never displayed here.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {assignedApplicationsResult.rows.map((application) => (
              <article
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
                key={`${application.organization_name}-${application.slug}`}
              >
                <p className="text-xs text-zinc-500">
                  {application.organization_name}
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {application.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  @{application.slug} · {readableStatus(application.status)}
                </p>
                {application.description && (
                  <p className="mt-2 text-sm text-zinc-400">
                    {application.description}
                  </p>
                )}
                <dl className="mt-3 space-y-2 text-xs text-zinc-400">
                  <div>
                    <dt className="inline font-medium text-zinc-300">Client ID: </dt>
                    <dd className="inline break-all font-mono">
                      {application.client_id}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-300">
                      Callback URLs
                    </dt>
                    <dd className="mt-1 break-all font-mono">
                      {application.redirect_uris?.join(", ") || "None"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-300">
                      Permitted scopes:{" "}
                    </dt>
                    <dd className="inline">
                      {application.allowed_scopes?.join(", ") || "None"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Card title="Reported MAU" value={formatCount(application.mau)} />
                  <Card
                    title="API calls"
                    value={formatCount(application.api_calls)}
                  />
                </div>
                <div className="mt-3 rounded-lg border border-zinc-800 p-4">
                  <p className="text-sm text-zinc-300">
                    Successful sign-ins this month:{" "}
                    {formatCount(application.recent_logins)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Latest sign-in:{" "}
                    {application.last_login_at
                      ? formatDate(application.last_login_at)
                      : "None recorded"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function FounderDashboard() {
  const [
    summaryResult,
    plansResult,
    organizationsResult,
    applicationsResult,
    invoicesResult,
    paymentsResult,
  ] = await Promise.all([
    pool.query<FounderSummary>(
      `SELECT
         (SELECT COUNT(*)::text FROM public.organizations) AS organizations,
         (SELECT COUNT(DISTINCT application_id)::text
            FROM public.organization_applications) AS applications,
         (SELECT COUNT(*)::text FROM public.subscription_plans) AS plans,
         (SELECT COUNT(DISTINCT subject_user_id)::text
            FROM public.usage_records
            WHERE metric = 'MAU'
              AND application_id IS NULL
              AND period_start = date_trunc('month', current_date)::date) AS mau,
         (SELECT COUNT(*)::text FROM public.invoices) AS invoices,
         (SELECT COUNT(*)::text FROM public.payments WHERE status = 'VERIFIED')
           AS verified_payments,
         (SELECT COUNT(*)::text FROM public.payments WHERE status = 'SUBMITTED')
           AS submitted_payments,
         (SELECT COALESCE(SUM(amount_hbt), 0)::text
            FROM public.payments WHERE status = 'VERIFIED')
           AS verified_revenue_hbt,
         (SELECT COUNT(*)::text FROM public.invoices
            WHERE status IN ('OPEN', 'OVERDUE')) AS outstanding_invoices`
    ),
    pool.query<Plan>(
      `SELECT id, slug, name, description, monthly_price_hbt::text,
              included_hbt_tokens::text, monthly_mau_limit, monthly_api_limit,
              application_integration_limit, plan_category, feature_matrix,
              is_active
       FROM public.subscription_plans
       ORDER BY sort_order, name`
    ),
    pool.query<FounderOrganizationRow>(
      `SELECT
         o.id,
         o.name,
         o.slug,
         o.status,
         active_subscription.plan_name,
         (SELECT COUNT(*)::text
            FROM public.organization_members AS m
            WHERE m.organization_id = o.id) AS member_count,
         (SELECT COUNT(*)::text
            FROM public.organization_applications AS oa
            WHERE oa.organization_id = o.id) AS application_count
       FROM public.organizations AS o
       LEFT JOIN LATERAL (
         SELECT p.name AS plan_name
         FROM public.subscriptions AS s
         LEFT JOIN public.subscription_plans AS p ON p.id = s.plan_id
         WHERE s.organization_id = o.id
           AND s.status IN ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE')
         ORDER BY s.created_at DESC
         LIMIT 1
       ) AS active_subscription ON true
       ORDER BY o.created_at DESC, o.name`
    ),
    pool.query<FounderApplicationRow>(
      `SELECT
         a.name,
         a.slug,
         a.status::text AS status,
         a.client_type,
         string_agg(o.name, ', ' ORDER BY o.name) AS organization_name
       FROM public.applications AS a
       LEFT JOIN public.organization_applications AS oa
         ON oa.application_id = a.id
       LEFT JOIN public.organizations AS o
         ON o.id = oa.organization_id
       GROUP BY a.id
       ORDER BY a.created_at DESC, a.name`
    ),
    pool.query<FounderInvoiceRow>(
      `SELECT
         i.id,
         i.organization_id,
         i.invoice_number,
         o.name AS organization_name,
         i.amount_hbt::text,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM public.payments AS p
             WHERE p.invoice_id = i.id AND p.status = 'VERIFIED'
           ) THEN 'PAID'
           WHEN i.status = 'OPEN' AND i.due_at < now() THEN 'OVERDUE'
           ELSE i.status
         END AS status,
         i.due_at
       FROM public.invoices AS i
       JOIN public.organizations AS o ON o.id = i.organization_id
       WHERE i.status IN ('OPEN', 'OVERDUE')
       ORDER BY i.due_at NULLS LAST, i.created_at DESC
       LIMIT 100`
    ),
    pool.query<FounderPaymentRow>(
      `SELECT
         p.organization_id,
         o.name AS organization_name,
         i.invoice_number,
         p.amount_hbt::text,
         p.status,
         p.solana_signature,
         p.submitted_at,
         p.verified_at
       FROM public.payments AS p
       JOIN public.organizations AS o ON o.id = p.organization_id
       LEFT JOIN public.invoices AS i ON i.id = p.invoice_id
       ORDER BY p.submitted_at DESC
       LIMIT 100`
    ),
  ]);
  const summary = summaryResult.rows[0];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Organizations" value={formatCount(summary.organizations)} />
        <Card title="Linked applications" value={formatCount(summary.applications)} />
        <Card
          detail={`${formatCount(summary.plans)} configured`}
          title="Active plans"
          value={formatCount(plansResult.rows.filter((plan) => plan.is_active).length)}
        />
        <Card
          detail="Distinct end users across the current calendar month"
          title="Reported MAU"
          value={formatCount(summary.mau)}
        />
        <Card title="Invoices" value={formatCount(summary.invoices)} />
        <Card
          detail={`${formatCount(summary.submitted_payments)} submitted and not verified`}
          title="Verified payments"
          value={formatCount(summary.verified_payments)}
        />
        <Card
          title="Verified HBT revenue"
          value={formatHbt(summary.verified_revenue_hbt)}
        />
        <Card
          title="Outstanding invoices"
          value={formatCount(summary.outstanding_invoices)}
        />
      </div>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Registered organizations</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2">Organization</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Members</th>
                <th className="pb-2">Applications</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {organizationsResult.rows.map((organization) => (
                <tr key={organization.id}>
                  <td className="py-3">
                    <span className="font-medium">{organization.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">
                      @{organization.slug}
                    </span>
                  </td>
                  <td className="py-3">{organization.status}</td>
                  <td className="py-3">{formatCount(organization.member_count)}</td>
                  <td className="py-3">{formatCount(organization.application_count)}</td>
                  <td className="py-3">
                    <FounderOrganizationStatus
                      organizationId={organization.id}
                      status={organization.status}
                    />
                  </td>
                </tr>
              ))}
              {organizationsResult.rows.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={5}>
                    No organizations registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Registered applications</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2">Application</th>
                <th className="pb-2">Organization</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Client type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {applicationsResult.rows.map((application) => (
                <tr key={application.slug}>
                  <td className="py-3">
                    {application.name}{" "}
                    <span className="text-xs text-zinc-500">
                      @{application.slug}
                    </span>
                  </td>
                  <td className="py-3">{application.organization_name ?? "—"}</td>
                  <td className="py-3">{application.status}</td>
                  <td className="py-3">{application.client_type}</td>
                </tr>
              ))}
              {applicationsResult.rows.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={4}>
                    No applications registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Organization plans</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Select any active plan for an organization. Paid plans are activated
          only after the HBT payment is verified.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {organizationsResult.rows.map((organization) => (
            <article
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
              key={organization.id}
            >
              <h3 className="font-medium">{organization.name}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Current plan: {organization.plan_name ?? "None"}
              </p>
              {organization.status === "ACTIVE" ? (
                plansResult.rows.some((plan) => plan.is_active) ? (
                  <div className="mt-4">
                    <OrganizationPlanSelector
                      currentPlanName={organization.plan_name}
                      organizationId={organization.id}
                      plans={plansResult.rows
                        .filter((plan) => plan.is_active)
                        .map((plan) => ({
                          id: plan.id,
                          name: plan.name,
                          category: plan.plan_category,
                          description: plan.description,
                          price: plan.monthly_price_hbt,
                          monthlyMauLimit: plan.monthly_mau_limit,
                          monthlyApiLimit: plan.monthly_api_limit,
                          applicationIntegrationLimit:
                            plan.application_integration_limit,
                          features: plan.feature_matrix,
                        }))}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">
                    No active plans are configured.
                  </p>
                )
              ) : (
                <p className="mt-3 text-sm text-amber-200">
                  Activate this organization before selecting a plan.
                </p>
              )}
            </article>
          ))}
          {organizationsResult.rows.length === 0 && (
            <p className="text-sm text-zinc-500">
              No organizations are available for plan selection.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Outstanding invoices</h2>
        <ul className="mt-4 divide-y divide-zinc-800 text-sm">
          {invoicesResult.rows.map((invoice) => (
            <li
              className="space-y-2 border-b border-zinc-800 py-3 last:border-0"
              key={invoice.invoice_number}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {invoice.invoice_number} · {invoice.organization_name} ·{" "}
                  {invoice.status}
                </span>
                <span className="text-zinc-400">
                  {formatHbt(invoice.amount_hbt)} ·{" "}
                  {invoice.due_at ? formatDate(invoice.due_at) : "No due date"}
                </span>
                <Link
                  className="text-indigo-300 underline"
                  href={`/api/organizations/${invoice.organization_id}/invoices/${invoice.id}`}
                >
                  Download
                </Link>
              </div>
              <OrganizationInvoicePayment
                invoiceId={invoice.id}
                organizationId={invoice.organization_id}
              />
            </li>
          ))}
          {invoicesResult.rows.length === 0 && (
            <li className="py-3 text-zinc-500">No outstanding invoices.</li>
          )}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Revenue and payment records</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="pb-2">Organization / invoice</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Submitted</th>
                <th className="pb-2">Solana signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {paymentsResult.rows.map((payment, index) => (
                <tr
                  key={`${payment.organization_id}-${payment.solana_signature ?? index}`}
                >
                  <td className="py-3">
                    {payment.organization_name} ·{" "}
                    {payment.invoice_number ?? "Payment"}
                  </td>
                  <td className="py-3">{formatHbt(payment.amount_hbt)}</td>
                  <td className="py-3">{readableStatus(payment.status)}</td>
                  <td className="py-3">{formatDate(payment.submitted_at)}</td>
                  <td className="max-w-64 break-all py-3 font-mono text-xs text-zinc-400">
                    {payment.solana_signature ?? "—"}
                  </td>
                </tr>
              ))}
              {paymentsResult.rows.length === 0 && (
                <tr>
                  <td className="py-4 text-zinc-500" colSpan={5}>
                    No organization payment records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-xl font-semibold">Subscription plan configuration</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Only the BHID founder can change this catalog. MAU, API, and
          integration limits can be left blank for a custom limit.
        </p>
        <div className="mt-5 space-y-4">
          {plansResult.rows.map((plan) => (
            <FounderPlanForm key={plan.id} plan={plan} />
          ))}
          <FounderPlanForm />
        </div>
        <p className="mt-4 text-sm text-amber-200">
          Paid organization subscriptions activate only after their Solana
          transactions are verified. The Free Developer plan requires no payment.
        </p>
      </section>
    </div>
  );
}

function groupBy<T extends Record<K, string>, K extends string>(
  values: T[],
  key: K
) {
  return values.reduce<Record<string, T[]>>((groups, value) => {
    (groups[value[key]] ??= []).push(value);
    return groups;
  }, {});
}

function metricQuantity(rows: UsageRow[], metric: string) {
  return rows.find((row) => row.metric === metric)?.quantity ?? "0";
}
