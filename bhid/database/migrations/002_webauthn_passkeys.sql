CREATE TABLE public.webauthn_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credential_id text NOT NULL UNIQUE,
    public_key bytea NOT NULL,
    sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
    transports text[] NOT NULL DEFAULT '{}'::text[],
    device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
    backed_up boolean NOT NULL DEFAULT false,
    label text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    last_used_at timestamp with time zone
);

CREATE INDEX webauthn_credentials_user_idx
    ON public.webauthn_credentials (user_id, created_at DESC);

CREATE TABLE public.webauthn_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge text NOT NULL UNIQUE,
    purpose text NOT NULL CHECK (purpose IN ('registration', 'authentication')),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
    label text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CHECK (
        (purpose = 'registration' AND user_id IS NOT NULL AND session_id IS NOT NULL)
        OR (purpose = 'authentication' AND session_id IS NULL)
    )
);

CREATE INDEX webauthn_challenges_expires_idx
    ON public.webauthn_challenges (expires_at);
