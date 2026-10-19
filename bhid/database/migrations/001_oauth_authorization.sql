CREATE TABLE public.oauth_authorization_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    auth_version integer NOT NULL,
    redirect_uri text NOT NULL,
    scopes text[] NOT NULL,
    state text NOT NULL,
    nonce text NOT NULL,
    code_challenge text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX oauth_authorization_requests_expires_idx
    ON public.oauth_authorization_requests (expires_at);

CREATE TABLE public.oauth_authorization_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash text NOT NULL UNIQUE,
    application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    auth_version integer NOT NULL,
    redirect_uri text NOT NULL,
    scopes text[] NOT NULL,
    code_challenge text NOT NULL,
    nonce text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX oauth_authorization_codes_expires_idx
    ON public.oauth_authorization_codes (expires_at);

CREATE TABLE public.oauth_consents (
    application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    scopes text[] NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    PRIMARY KEY (application_id, user_id)
);
