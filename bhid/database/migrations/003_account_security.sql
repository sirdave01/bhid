ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS date_of_birth date,
    ADD COLUMN IF NOT EXISTS wallet_address text,
    ADD COLUMN IF NOT EXISTS wallet_verified_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_unique
    ON public.profiles (wallet_address)
    WHERE wallet_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_created_idx
    ON public.email_verification_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.totp_methods (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    secret_encrypted text NOT NULL,
    enabled_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.totp_setup_challenges (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    secret_encrypted text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.totp_login_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS totp_login_challenges_expires_idx
    ON public.totp_login_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.wallet_link_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    wallet_address text NOT NULL,
    nonce text NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_link_challenges_user_expires_idx
    ON public.wallet_link_challenges (user_id, expires_at);
