CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    slug text NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_roles (
    role_key text PRIMARY KEY
        CHECK (role_key IN ('owner', 'admin', 'developer', 'member')),
    display_name text NOT NULL,
    description text NOT NULL,
    permissions text[] NOT NULL DEFAULT '{}',
    is_system boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.organization_roles
    (role_key, display_name, description, permissions)
VALUES
    ('owner', 'Owner', 'Full organization and billing administration.',
     ARRAY['organization:manage', 'members:manage', 'applications:manage', 'billing:manage']),
    ('admin', 'Administrator', 'Manage organization details, members, applications, and billing.',
     ARRAY['organization:manage', 'members:manage', 'applications:manage', 'billing:manage']),
    ('developer', 'Developer', 'View only applications assigned to this developer and their usage.',
     ARRAY['applications:assigned:read', 'usage:assigned:read']),
    ('member', 'Member', 'View basic organization membership information.',
     ARRAY['organization:read'])
ON CONFLICT (role_key) DO NOTHING;

CREATE TABLE public.organization_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_key text NOT NULL REFERENCES public.organization_roles(role_key) ON DELETE RESTRICT,
    added_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_members_user_org_idx
    ON public.organization_members (user_id, organization_id);
CREATE INDEX organization_members_org_role_idx
    ON public.organization_members (organization_id, role_key);

CREATE TABLE public.organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
    role_key text NOT NULL REFERENCES public.organization_roles(role_key) ON DELETE RESTRICT,
    token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    invited_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (role_key <> 'owner')
);

CREATE UNIQUE INDEX organization_invitations_pending_email_idx
    ON public.organization_invitations (organization_id, lower(email))
    WHERE status = 'PENDING';
CREATE INDEX organization_invitations_org_status_idx
    ON public.organization_invitations (organization_id, status, created_at DESC);

CREATE TABLE public.organization_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    application_id uuid NOT NULL
        REFERENCES public.applications(id) ON DELETE CASCADE,
    linked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (organization_id, application_id)
);

CREATE INDEX organization_applications_application_idx
    ON public.organization_applications (application_id, organization_id);

CREATE TABLE public.organization_application_members (
    organization_id uuid NOT NULL,
    application_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, application_id, user_id),
    FOREIGN KEY (organization_id, application_id)
        REFERENCES public.organization_applications(organization_id, application_id)
        ON DELETE CASCADE,
    FOREIGN KEY (organization_id, user_id)
        REFERENCES public.organization_members(organization_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX organization_application_members_user_idx
    ON public.organization_application_members (user_id, application_id);

CREATE TABLE public.application_authentication_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    application_id uuid NOT NULL,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN ('LOGIN_SUCCESS')),
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, application_id)
        REFERENCES public.organization_applications(organization_id, application_id)
        ON DELETE CASCADE
);

CREATE INDEX application_authentication_logs_app_recorded_idx
    ON public.application_authentication_logs (
        organization_id,
        application_id,
        recorded_at DESC
    );

CREATE TABLE public.subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    description text,
    monthly_price_hbt bigint CHECK (monthly_price_hbt IS NULL OR monthly_price_hbt >= 0),
    included_hbt_tokens bigint NOT NULL DEFAULT 0 CHECK (included_hbt_tokens >= 0),
    monthly_mau_limit integer NOT NULL CHECK (monthly_mau_limit >= 0),
    monthly_api_limit integer NOT NULL CHECK (monthly_api_limit >= 0),
    is_active boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (
        NOT is_active
        OR (monthly_price_hbt IS NOT NULL AND monthly_price_hbt > 0)
    )
);

CREATE INDEX subscription_plans_active_order_idx
    ON public.subscription_plans (is_active, sort_order, name);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'INCOMPLETE'
        CHECK (status IN ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
    current_period_start date,
    current_period_end date,
    canceled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (
        current_period_start IS NULL
        OR current_period_end IS NULL
        OR current_period_end >= current_period_start
    ),
    UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX subscriptions_one_current_per_org_idx
    ON public.subscriptions (organization_id)
    WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE');
CREATE INDEX subscriptions_org_created_idx
    ON public.subscriptions (organization_id, created_at DESC);

CREATE TABLE public.usage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    application_id uuid,
    subject_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    metric text NOT NULL CHECK (metric IN ('MAU', 'API_CALLS', 'HBT_TOKENS')),
    period_start date NOT NULL,
    period_end date NOT NULL,
    quantity bigint NOT NULL CHECK (quantity >= 0),
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (period_end >= period_start),
    FOREIGN KEY (organization_id, application_id)
        REFERENCES public.organization_applications(organization_id, application_id)
        ON DELETE CASCADE
);

CREATE INDEX usage_records_org_period_metric_idx
    ON public.usage_records (organization_id, period_start, metric);
CREATE INDEX usage_records_app_period_metric_idx
    ON public.usage_records (application_id, period_start, metric)
    WHERE application_id IS NOT NULL;
CREATE UNIQUE INDEX usage_records_org_mau_user_idx
    ON public.usage_records (organization_id, period_start, subject_user_id)
    WHERE metric = 'MAU'
      AND application_id IS NULL
      AND subject_user_id IS NOT NULL;
CREATE UNIQUE INDEX usage_records_app_mau_user_idx
    ON public.usage_records (
        organization_id,
        application_id,
        period_start,
        subject_user_id
    )
    WHERE metric = 'MAU'
      AND application_id IS NOT NULL
      AND subject_user_id IS NOT NULL;

CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id uuid,
    invoice_number text NOT NULL UNIQUE,
    amount_hbt bigint NOT NULL CHECK (amount_hbt >= 0),
    status text NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'OPEN', 'OVERDUE', 'PAID', 'VOID')),
    issued_at timestamp with time zone,
    due_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (due_at IS NULL OR issued_at IS NULL OR due_at >= issued_at),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, subscription_id)
        REFERENCES public.subscriptions(organization_id, id)
        ON DELETE SET NULL (subscription_id)
);

CREATE INDEX invoices_org_created_idx
    ON public.invoices (organization_id, created_at DESC);
CREATE INDEX invoices_status_due_idx
    ON public.invoices (status, due_at);

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id uuid,
    amount_hbt bigint NOT NULL CHECK (amount_hbt > 0),
    status text NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED', 'VERIFIED', 'REJECTED', 'REFUNDED')),
    solana_signature text,
    token_mint text NOT NULL,
    payer_wallet text NOT NULL,
    payer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    submitted_at timestamp with time zone NOT NULL DEFAULT now(),
    verified_at timestamp with time zone,
    CHECK (status <> 'VERIFIED' OR (solana_signature IS NOT NULL AND verified_at IS NOT NULL)),
    FOREIGN KEY (organization_id, invoice_id)
        REFERENCES public.invoices(organization_id, id)
        ON DELETE SET NULL (invoice_id)
);

CREATE UNIQUE INDEX payments_solana_signature_idx
    ON public.payments (solana_signature)
    WHERE solana_signature IS NOT NULL;
CREATE INDEX payments_org_submitted_idx
    ON public.payments (organization_id, submitted_at DESC);
CREATE INDEX payments_invoice_idx
    ON public.payments (invoice_id)
    WHERE invoice_id IS NOT NULL;

CREATE TABLE public.organization_payment_attempt_limits (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    window_started_at timestamp with time zone NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE TABLE public.billing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 100),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_org_recorded_idx
    ON public.billing_events (organization_id, recorded_at DESC);
CREATE INDEX billing_events_payment_idx
    ON public.billing_events (payment_id)
    WHERE payment_id IS NOT NULL;
