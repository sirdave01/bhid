--
-- PostgreSQL database dump
--

\restrict CMbyCmCRSe0f0O2QKQKeIrbvxhNS2qWJabgXks88LNvLTQLJAoihDuG0AfgZwmz

-- Dumped from database version 18.6 (653b019)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.application_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED'
);


ALTER TYPE public.application_status OWNER TO neondb_owner;

--
-- Name: mfa_method_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.mfa_method_type AS ENUM (
    'TOTP',
    'SMS',
    'EMAIL'
);


ALTER TYPE public.mfa_method_type OWNER TO neondb_owner;

--
-- Name: premium_tier; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.premium_tier AS ENUM (
    'NONE',
    'BLUE',
    'GOLD',
    'PLATINUM'
);


ALTER TYPE public.premium_tier OWNER TO neondb_owner;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.user_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DELETED'
);


ALTER TYPE public.user_status OWNER TO neondb_owner;

--
-- Name: verification_request_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.verification_request_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);


ALTER TYPE public.verification_request_status OWNER TO neondb_owner;

--
-- Name: wallet_connection_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.wallet_connection_type AS ENUM (
    'MANUAL',
    'CONNECTED',
    'BYTEHAVEN'
);


ALTER TYPE public.wallet_connection_type OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: applications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    client_id text NOT NULL,
    client_secret_hash text,
    redirect_uris text[],
    allowed_scopes text[],
    status public.application_status DEFAULT 'ACTIVE'::public.application_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_type text DEFAULT 'CONFIDENTIAL'::text NOT NULL,
    CONSTRAINT applications_client_type_check CHECK ((client_type = ANY (ARRAY['PUBLIC'::text, 'CONFIDENTIAL'::text])))
);


ALTER TABLE public.applications OWNER TO neondb_owner;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    ip_address inet,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO neondb_owner;

--
-- Name: mfa_challenges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.mfa_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    method_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mfa_challenges OWNER TO neondb_owner;

--
-- Name: mfa_methods; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.mfa_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.mfa_method_type NOT NULL,
    secret text,
    phone_number text,
    is_primary boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mfa_methods OWNER TO neondb_owner;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT notifications_message_not_blank CHECK ((length(TRIM(BOTH FROM message)) > 0)),
    CONSTRAINT notifications_read_state_consistent CHECK ((((is_read = false) AND (read_at IS NULL)) OR ((is_read = true) AND (read_at IS NOT NULL)))),
    CONSTRAINT notifications_title_not_blank CHECK ((length(TRIM(BOTH FROM title)) > 0)),
    CONSTRAINT notifications_type_not_blank CHECK ((length(TRIM(BOTH FROM type)) > 0))
);


ALTER TABLE public.notifications OWNER TO neondb_owner;

--
-- Name: passkey_credentials; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.passkey_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports text[],
    device_name character varying(100),
    aaguid uuid,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT passkey_sign_count_nonnegative CHECK ((sign_count >= 0))
);


ALTER TABLE public.passkey_credentials OWNER TO neondb_owner;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO neondb_owner;

--
-- Name: premium_badges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.premium_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier public.premium_tier NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    granted_by uuid,
    reason text,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.premium_badges OWNER TO neondb_owner;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    username character varying(30),
    display_name character varying(80),
    bio text,
    avatar_url text,
    avatar_public_id text,
    cover_url text,
    location text,
    website text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.profiles OWNER TO neondb_owner;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO neondb_owner;

--
-- Name: session_refresh_token_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.session_refresh_token_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    token_hash text NOT NULL,
    rotated_at timestamp with time zone DEFAULT now() NOT NULL,
    replaced_by_token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.session_refresh_token_history OWNER TO neondb_owner;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    user_agent text,
    ip_address inet,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    absolute_expires_at timestamp with time zone,
    revoked_reason text,
    token_family_id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT sessions_absolute_expiry_check CHECK (((absolute_expires_at IS NULL) OR (absolute_expires_at >= created_at)))
);


ALTER TABLE public.sessions OWNER TO neondb_owner;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_roles OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bhid character varying(40) NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    email_verified_at timestamp with time zone,
    phone text,
    phone_verified_at timestamp with time zone,
    status public.user_status DEFAULT 'ACTIVE'::public.user_status NOT NULL,
    verification_level integer DEFAULT 0 NOT NULL,
    premium_tier public.premium_tier DEFAULT 'NONE'::public.premium_tier NOT NULL,
    premium_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT users_auth_version_nonnegative CHECK ((auth_version >= 0))
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.verification_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    status public.verification_request_status DEFAULT 'PENDING'::public.verification_request_status NOT NULL,
    submitted_data jsonb,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.verification_requests OWNER TO neondb_owner;

--
-- Name: wallets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    network character varying(40) NOT NULL,
    address text NOT NULL,
    address_normalized text NOT NULL,
    label character varying(60),
    is_primary boolean DEFAULT false NOT NULL,
    connection_type public.wallet_connection_type DEFAULT 'MANUAL'::public.wallet_connection_type NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wallets OWNER TO neondb_owner;

--
-- Name: webauthn_challenges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge text NOT NULL,
    ceremony_type text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webauthn_challenges_ceremony_type_check CHECK ((ceremony_type = ANY (ARRAY['REGISTRATION'::text, 'AUTHENTICATION'::text])))
);


ALTER TABLE public.webauthn_challenges OWNER TO neondb_owner;

--
-- Data for Name: applications; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.applications (id, name, slug, description, client_id, client_secret_hash, redirect_uris, allowed_scopes, status, created_at, updated_at, client_type) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.audit_logs (id, user_id, action, ip_address, user_agent, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.mfa_challenges (id, user_id, method_id, code_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: mfa_methods; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.mfa_methods (id, user_id, type, secret, phone_number, is_primary, is_verified, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.notifications (id, user_id, type, title, message, metadata, is_read, read_at, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: passkey_credentials; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.passkey_credentials (id, user_id, credential_id, public_key, sign_count, transports, device_name, aaguid, backup_eligible, backed_up, created_at, last_used_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: premium_badges; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.premium_badges (id, user_id, tier, granted_at, expires_at, granted_by, reason, is_active) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.profiles (user_id, username, display_name, bio, avatar_url, avatar_public_id, cover_url, location, website, updated_at) FROM stdin;
63f8fe4e-30bf-4591-bd0e-267ace50c3cf	bhid_test_001	David Test	\N	\N	\N	\N	\N	\N	2026-10-18 07:05:18.634561+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.roles (id, name, description, permissions, created_at) FROM stdin;
\.


--
-- Data for Name: session_refresh_token_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.session_refresh_token_history (id, session_id, token_hash, rotated_at, replaced_by_token_hash, expires_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.sessions (id, user_id, token_hash, user_agent, ip_address, expires_at, revoked_at, created_at, last_used_at, absolute_expires_at, revoked_reason, token_family_id) FROM stdin;
0fef2331-80a6-4773-9528-0146dfaf35f7	63f8fe4e-30bf-4591-bd0e-267ace50c3cf	5f68d685375db7156eb152dcda74ffa9f52276c891a8bb7f101057b814b9c20e	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.22000.2538	\N	2026-10-26 10:37:52.231+00	\N	2026-10-19 10:36:34.060565+00	\N	2026-11-18 10:37:52.231+00	\N	227c68da-5e25-4428-b623-9d0de730a6e0
7867c15e-bd6d-402f-87a1-776a4dbf9b0b	63f8fe4e-30bf-4591-bd0e-267ace50c3cf	c48fc27d578b099d46addbb583adbae1aa0a45125655233a14163b79b6247999	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.22000.2538	\N	2026-10-26 11:07:30.983+00	\N	2026-10-19 11:06:12.814955+00	\N	2026-11-18 11:07:30.983+00	\N	b0f0138f-ebbc-4064-9b4e-924073e5e95c
93f00a58-7f85-44ab-9ed4-676a7c25a7e8	63f8fe4e-30bf-4591-bd0e-267ace50c3cf	f22cbd5defcbf4d3d839781456f7988ed4e4192b19307dd3d1f21f91b73d5e5d	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.22000.2538	\N	2026-10-26 11:11:43.361+00	\N	2026-10-19 11:10:25.192794+00	\N	2026-11-18 11:11:43.361+00	\N	d2ca2bd4-a6a2-4f84-aae6-54c14cd45d5b
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_roles (user_id, role_id, assigned_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, bhid, email, password_hash, email_verified_at, phone, phone_verified_at, status, verification_level, premium_tier, premium_expires_at, created_at, updated_at, auth_version) FROM stdin;
63f8fe4e-30bf-4591-bd0e-267ace50c3cf	BHID-GSVMTFGYUJNV6LTM	bhid-test-001@example.com	$argon2id$v=19$m=19456,p=1,t=2$nMGIFG/KQP82cIDjGlQMEw$iM7jnSq/QtLqHB5yHPjWxYwhugAP1sANyx2052gx7BE	\N	\N	\N	ACTIVE	0	NONE	\N	2026-10-18 07:05:18.634561+00	2026-10-18 07:05:18.634561+00	0
\.


--
-- Data for Name: verification_requests; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.verification_requests (id, user_id, type, status, submitted_data, reviewed_by, reviewed_at, created_at) FROM stdin;
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.wallets (id, user_id, network, address, address_normalized, label, is_primary, connection_type, verified_at, created_at) FROM stdin;
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.webauthn_challenges (id, user_id, challenge, ceremony_type, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Name: applications applications_client_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_client_id_key UNIQUE (client_id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: applications applications_slug_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_slug_key UNIQUE (slug);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_methods mfa_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mfa_methods
    ADD CONSTRAINT mfa_methods_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: passkey_credentials passkey_credentials_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: passkey_credentials passkey_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: premium_badges premium_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.premium_badges
    ADD CONSTRAINT premium_badges_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: session_refresh_token_history session_refresh_token_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session_refresh_token_history
    ADD CONSTRAINT session_refresh_token_history_pkey PRIMARY KEY (id);


--
-- Name: session_refresh_token_history session_refresh_token_history_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session_refresh_token_history
    ADD CONSTRAINT session_refresh_token_history_token_hash_key UNIQUE (token_hash);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_bhid_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_bhid_key UNIQUE (bhid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification_requests verification_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_network_address_normalized_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_network_address_normalized_key UNIQUE (network, address_normalized);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_challenge_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_challenge_key UNIQUE (challenge);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: mfa_challenges_expires_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX mfa_challenges_expires_at ON public.mfa_challenges USING btree (expires_at);


--
-- Name: mfa_challenges_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX mfa_challenges_user_id_idx ON public.mfa_challenges USING btree (user_id);


--
-- Name: mfa_methods_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX mfa_methods_user_id_idx ON public.mfa_methods USING btree (user_id);


--
-- Name: notifications_expiry_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX notifications_expiry_idx ON public.notifications USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: notifications_unread_user_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX notifications_unread_user_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (is_read = false);


--
-- Name: notifications_user_created_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: passkey_credentials_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX passkey_credentials_user_id_idx ON public.passkey_credentials USING btree (user_id);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: premium_badges_tier_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX premium_badges_tier_idx ON public.premium_badges USING btree (tier);


--
-- Name: premium_badges_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX premium_badges_user_id_idx ON public.premium_badges USING btree (user_id);


--
-- Name: profiles_username_lower_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX profiles_username_lower_unique ON public.profiles USING btree (lower((username)::text)) WHERE (username IS NOT NULL);


--
-- Name: session_refresh_token_history_expires_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX session_refresh_token_history_expires_idx ON public.session_refresh_token_history USING btree (expires_at);


--
-- Name: session_refresh_token_history_session_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX session_refresh_token_history_session_idx ON public.session_refresh_token_history USING btree (session_id);


--
-- Name: sessions_active_user_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX sessions_active_user_idx ON public.sessions USING btree (user_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (lower(email));


--
-- Name: users_status_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX users_status_idx ON public.users USING btree (status);


--
-- Name: verification_requests_status_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX verification_requests_status_idx ON public.verification_requests USING btree (status);


--
-- Name: verification_requests_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX verification_requests_user_id_idx ON public.verification_requests USING btree (user_id);


--
-- Name: wallets_user_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX wallets_user_id_idx ON public.wallets USING btree (user_id);


--
-- Name: webauthn_challenges_expiry_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX webauthn_challenges_expiry_idx ON public.webauthn_challenges USING btree (expires_at);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: mfa_challenges mfa_challenges_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_method_id_fkey FOREIGN KEY (method_id) REFERENCES public.mfa_methods(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mfa_challenges
    ADD CONSTRAINT mfa_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mfa_methods mfa_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mfa_methods
    ADD CONSTRAINT mfa_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: passkey_credentials passkey_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: premium_badges premium_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.premium_badges
    ADD CONSTRAINT premium_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_refresh_token_history session_refresh_token_history_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.session_refresh_token_history
    ADD CONSTRAINT session_refresh_token_history_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_requests verification_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: verification_requests verification_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT SELECT,INSERT,DELETE,TRUNCATE,MAINTAIN,UPDATE ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict CMbyCmCRSe0f0O2QKQKeIrbvxhNS2qWJabgXks88LNvLTQLJAoihDuG0AfgZwmz

