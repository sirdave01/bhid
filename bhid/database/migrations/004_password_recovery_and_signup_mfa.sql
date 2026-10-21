CREATE TABLE IF NOT EXISTS public.signup_mfa_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    username text,
    password_hash text NOT NULL,
    secret_encrypted text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_mfa_challenges_expires_idx
    ON public.signup_mfa_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.password_reset_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    email_code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_challenges_user_created_idx
    ON public.password_reset_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_challenges_expires_idx
    ON public.password_reset_challenges (expires_at);
