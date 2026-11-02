ALTER TABLE public.applications
    ADD COLUMN IF NOT EXISTS owner_user_id uuid
        REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS applications_owner_user_id_idx
    ON public.applications (owner_user_id);

CREATE TYPE public.membership_tier AS ENUM (
    'BASIC',
    'PREMIUM',
    'GOLD',
    'PLATINUM',
    'DIAMOND'
);

CREATE TABLE public.user_memberships (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tier public.membership_tier NOT NULL DEFAULT 'BASIC',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_memberships_basic_expiry_check
        CHECK (tier <> 'BASIC' OR expires_at IS NULL)
);

INSERT INTO public.user_memberships (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

CREATE FUNCTION public.create_default_user_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.user_memberships (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_create_default_membership
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.create_default_user_membership();

CREATE TABLE public.membership_payments (
    signature text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tier public.membership_tier NOT NULL,
    amount_base_units numeric(78, 0) NOT NULL CHECK (amount_base_units > 0),
    token_mint text NOT NULL,
    source_wallet text NOT NULL,
    paid_at timestamp with time zone NOT NULL,
    membership_expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT membership_payments_paid_tier_check CHECK (tier <> 'BASIC')
);

CREATE INDEX membership_payments_user_created_idx
    ON public.membership_payments (user_id, created_at DESC);

CREATE TABLE public.membership_payment_attempt_limits (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    window_started_at timestamp with time zone NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
