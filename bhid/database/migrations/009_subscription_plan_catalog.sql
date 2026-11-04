ALTER TABLE public.subscription_plans
    ADD COLUMN plan_category text NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN application_integration_limit integer
        CHECK (application_integration_limit IS NULL OR application_integration_limit >= 0),
    ADD COLUMN feature_matrix jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(feature_matrix) = 'object');

ALTER TABLE public.subscription_plans
    ALTER COLUMN monthly_mau_limit DROP NOT NULL,
    ALTER COLUMN monthly_api_limit DROP NOT NULL,
    DROP CONSTRAINT IF EXISTS subscription_plans_check,
    ADD CONSTRAINT subscription_plans_category_check
        CHECK (plan_category IN ('BASIC', 'STANDARD', 'ADVANCED')),
    ADD CONSTRAINT subscription_plans_active_price_check
        CHECK (
            NOT is_active
            OR (
                monthly_price_hbt IS NOT NULL
                AND (
                    monthly_price_hbt > 0
                    OR (slug = 'free-developer' AND monthly_price_hbt = 0)
                )
            )
        );

INSERT INTO public.subscription_plans (
    slug,
    name,
    description,
    monthly_price_hbt,
    included_hbt_tokens,
    monthly_mau_limit,
    monthly_api_limit,
    application_integration_limit,
    plan_category,
    feature_matrix,
    is_active,
    sort_order
)
VALUES
    (
        'free-developer',
        'Free Developer',
        'Basic plan for getting started with BHID authentication.',
        0,
        0,
        500,
        10000,
        1,
        'BASIC',
        '{
          "Organization dashboard": "Included",
          "Developer access": "Basic",
          "OAuth 2.0 / OIDC": "Included",
          "User authentication": "Included",
          "Email verification": "Included",
          "MFA support": "Included",
          "Usage analytics": "Basic",
          "Authentication logs": "Basic",
          "Priority support": "—",
          "Custom integration support": "—",
          "Custom security arrangements": "—"
        }'::jsonb,
        true,
        1
    ),
    (
        'starter',
        'Starter',
        'Standard entry plan for small applications.',
        2000,
        0,
        2000,
        50000,
        2,
        'STANDARD',
        '{
          "Organization dashboard": "Included",
          "Developer access": "Included",
          "OAuth 2.0 / OIDC": "Included",
          "User authentication": "Included",
          "Email verification": "Included",
          "MFA support": "Included",
          "Usage analytics": "Basic",
          "Authentication logs": "Included",
          "Priority support": "—",
          "Custom integration support": "—",
          "Custom security arrangements": "—"
        }'::jsonb,
        true,
        2
    ),
    (
        'growth',
        'Growth',
        'Standard plan for growing applications with advanced analytics.',
        5000,
        0,
        10000,
        250000,
        5,
        'STANDARD',
        '{
          "Organization dashboard": "Included",
          "Developer access": "Included",
          "OAuth 2.0 / OIDC": "Included",
          "User authentication": "Included",
          "Email verification": "Included",
          "MFA support": "Included",
          "Usage analytics": "Advanced",
          "Authentication logs": "Included",
          "Priority support": "Standard",
          "Custom integration support": "—",
          "Custom security arrangements": "—"
        }'::jsonb,
        true,
        3
    ),
    (
        'business',
        'Business',
        'Advanced plan with priority support and limited integration assistance.',
        15000,
        0,
        50000,
        1000000,
        15,
        'ADVANCED',
        '{
          "Organization dashboard": "Included",
          "Developer access": "Included",
          "OAuth 2.0 / OIDC": "Included",
          "User authentication": "Included",
          "Email verification": "Included",
          "MFA support": "Included",
          "Usage analytics": "Advanced",
          "Authentication logs": "Included",
          "Priority support": "Priority",
          "Custom integration support": "Limited",
          "Custom security arrangements": "—"
        }'::jsonb,
        true,
        4
    ),
    (
        'enterprise',
        'Enterprise',
        'Advanced custom-scale plan with dedicated support and security arrangements.',
        20000,
        0,
        NULL,
        NULL,
        NULL,
        'ADVANCED',
        '{
          "Organization dashboard": "Included",
          "Developer access": "Included",
          "OAuth 2.0 / OIDC": "Included",
          "User authentication": "Included",
          "Email verification": "Included",
          "MFA support": "Included",
          "Usage analytics": "Custom",
          "Authentication logs": "Included",
          "Priority support": "Dedicated",
          "Custom integration support": "Included",
          "Custom security arrangements": "Included"
        }'::jsonb,
        true,
        5
    )
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_price_hbt = EXCLUDED.monthly_price_hbt,
    included_hbt_tokens = EXCLUDED.included_hbt_tokens,
    monthly_mau_limit = EXCLUDED.monthly_mau_limit,
    monthly_api_limit = EXCLUDED.monthly_api_limit,
    application_integration_limit = EXCLUDED.application_integration_limit,
    plan_category = EXCLUDED.plan_category,
    feature_matrix = EXCLUDED.feature_matrix,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();
