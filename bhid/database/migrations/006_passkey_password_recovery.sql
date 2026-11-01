ALTER TABLE public.password_reset_challenges
    ADD COLUMN IF NOT EXISTS passkey_verified_at timestamp with time zone;

ALTER TABLE public.webauthn_challenges
    ADD COLUMN IF NOT EXISTS password_reset_challenge_id uuid
        REFERENCES public.password_reset_challenges(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS webauthn_challenges_password_reset_idx
    ON public.webauthn_challenges (password_reset_challenge_id)
    WHERE password_reset_challenge_id IS NOT NULL;
