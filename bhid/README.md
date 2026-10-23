# BHID — ByteHaven Identity

**BHID (ByteHaven Identity)** is the centralized authentication and identity service being developed for the ByteHaven ecosystem and other third-party applications

Its long-term goal is to provide a secure, reusable identity system through which users can access ByteHaven applications such as HavenSocial and HavenPay and other thrid-party applications without needing a separate account for every product.

BHID is being developed incrementally, with an emphasis on understanding the underlying technologies, security principles, and implementation decisions.

## Project Goals

- Provide a centralized identity for ByteHaven ecosystem users.
- Support secure account registration and password-based authentication.
- Assign every account a unique BHID identifier.
- Store account and profile information in PostgreSQL.
- Manage authenticated sessions and refresh-token rotation.
- Issue and verify signed access tokens.
- Introduce passkey authentication using WebAuthn.
- Support authentication across trusted ByteHaven applications.
- Provide account security, session management, and recovery capabilities.
- Establish a foundation for future multi-factor authentication and identity verification.

## Technology Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **UI:** React and Tailwind CSS
- **Database:** PostgreSQL, hosted by Neon
- **Validation:** Zod
- **Password hashing:** Argon2id
- **Access tokens:** JSON Web Tokens (JWT), using RS256
- **Passkeys:** WebAuthn
- **Deployment target:** Vercel

Additional services may be introduced as the requirements evolve.

## Authentication Architecture

BHID is intended to act as the trusted identity provider for registered ByteHaven applications.

The planned authentication flow includes:

1. A user registers a BHID account.
2. BHID validates the registration details and securely hashes the password.
3. The user signs in using their credentials or, when implemented, a passkey.
4. BHID creates and manages the user's authenticated session.
5. BHID issues a short-lived signed access token.
6. Trusted applications verify tokens using BHID's public signing keys and validate the relevant claims.
7. Session revocation and account-status checks help prevent continued access when an account or session is no longer authorized.

Cross-application authentication will require appropriate OAuth 2.0 and OpenID Connect flows, registered clients, trusted redirect URIs, and audience validation.

### First-party session management

The signed-in account can inspect its active sessions and revoke an individual session:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/sessions` | Return the authenticated user's active sessions, paginated with an optional opaque `cursor` |
| `DELETE /api/auth/sessions/{id}` | Revoke one of the authenticated user's sessions; revoking the current session also clears its browser cookies |

These endpoints validate the access token against the current user and session state in PostgreSQL. Session identifiers are scoped to the authenticated user, and the security settings page presents the active devices without exposing refresh-token values.

### Passkeys

The initial passkey implementation supports discoverable passkey sign-in and authenticated passkey registration, listing, and removal:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/passkeys/register/options` | Create a session-bound registration challenge |
| `POST /api/auth/passkeys/register/verify` | Verify a WebAuthn registration and persist its public credential |
| `POST /api/auth/passkeys/authenticate/options` | Create a short-lived sign-in challenge |
| `POST /api/auth/passkeys/authenticate/verify` | Verify a passkey assertion and create a BHID session |
| `GET /api/auth/passkeys` | List the authenticated user's registered passkeys |
| `DELETE /api/auth/passkeys/{id}` | Remove one of the authenticated user's passkeys |

Challenges are single-use and expire after five minutes. User verification is required, registration uses `attestation: none`, and BHID stores the credential public key and signature counter rather than biometric data. The registration and sign-in interface is available on the Security Settings and Login pages.

Apply the WebAuthn schema migration before using these routes:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f .\database\migrations\002_webauthn_passkeys.sql
```

`WEBAUTHN_RP_ID` and `WEBAUTHN_RP_NAME` may be set to override the defaults derived from the configured issuer. `WEBAUTHN_ORIGINS` may contain a comma-separated list of exact origins for the BHID UI; every origin must be covered by the relying-party ID. Production origins and issuer must use HTTPS. Apply the migration only after reviewing the target database and taking a backup. Browser/device coverage and end-to-end verification against a migrated test database are still required before production use.

### Initial OAuth 2.0 / OpenID Connect provider

The repository now includes an initial Authorization Code flow with PKCE and OpenID Connect endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/openid-configuration` | OIDC provider metadata |
| `GET /.well-known/jwks.json` | Public RS256 signing key |
| `GET /api/oauth/authorize` | Validate a registered client, redirect, scopes, PKCE challenge, and BHID session |
| `GET /oauth/consent` | Show the user the requesting application and requested scopes |
| `GET /api/oauth/consent` | Return consent details for the active BHID session |
| `POST /api/oauth/consent` | Record consent or denial and complete the one-time authorization request |
| `POST /api/oauth/token` | Authenticate the client and exchange a one-time code plus PKCE verifier |
| `GET /api/oauth/userinfo` | Return only claims permitted by the validated access token's scopes |

The provider accepts only the `authorization_code` grant and `S256` PKCE. Authorization requests require `response_type=code`, `state`, and `nonce`, and must include `openid`. Supported optional scopes are `email`, `profile`, and `bhid`; each optional scope must also be enabled for the registered application. Public applications use PKCE without a client secret. Confidential applications authenticate to the token endpoint with HTTP Basic and a high-entropy client secret whose SHA-256 hex digest is stored in `applications.client_secret_hash`.

Public browser clients may exchange codes from an origin represented by one of their registered HTTPS redirect URIs (loopback HTTP is permitted for development). The token endpoint returns an exact-origin CORS header only for that registered public-client origin; it does not enable credentialed CORS or wildcard origins.

The existing `applications` table is the trusted client registry. Provision clients through a controlled database/admin workflow; do not expose an unauthenticated public client-registration endpoint. Redirect URIs are compared exactly to the registered list. Production web redirects must use HTTPS; HTTP is accepted only for loopback development clients. A migration adds short-lived, one-use authorization requests and codes plus remembered user consent:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f .\database\migrations\001_oauth_authorization.sql
```

Review the target database and take the usual backup before applying migrations. The migration is not run by the application or build.

OIDC tokens use RS256, the configured `JWT_ISSUER`, the application's `client_id` as audience, and a 10-minute lifetime. Authorization codes are stored only as SHA-256 hashes and expire after five minutes. The provider does not issue OAuth refresh tokens; `bhid_refresh` remains the first-party browser-session cookie. Applications that verify JWTs locally should use the JWKS endpoint and validate issuer, audience, expiry, and signature. Local signature validation cannot immediately observe revocation; use the UserInfo endpoint or short access-token lifetime when current session status must be checked.

These routes are an initial provider implementation, not a claim of production certification. Apply the migration and run the end-to-end OIDC flow against a provisioned test application before enabling external clients. Client administration, consent revocation UI, rate limiting, key rotation, and protocol/security review remain operational follow-ups.

## Security Principles

- Never store plaintext passwords.
- Use Argon2id for password hashing.
- Store hashes of high-entropy refresh tokens rather than raw refresh tokens.
- Keep JWT private signing keys server-side.
- Never commit private keys or environment files to version control.
- Use separate development and production credentials.
- Validate requests on the server.
- Enforce session expiration, revocation, and account-status checks.
- Protect security-sensitive endpoints against abuse.
- Never store users' biometric templates as part of the passkey implementation.
- Use WebAuthn rather than implementing passkey cryptography from scratch.

## Development Status

BHID is under active development. The repository includes the initial Next.js project structure and authentication-related modules and routes.

Features are considered complete only after implementation and testing.

Planned milestones include:

- [x] Local environment and database validation
- [x] Registration and password hashing
- [x] Password login and session creation
- [x] Refresh-token rotation and logout
- [x] Current-user endpoint and session management
- [ ] Authentication security hardening (rate limiting, security audit events and full automated flow tests remain)
- [x] Passkey registration and authentication (database migration and browser/device checks remain)
- [x] Cross-application OAuth 2.0 and OpenID Connect (migration and end-to-end verification against a separate client remain)
- [ ] Production deployment and security testing

Implementation status is not the same as production readiness. Apply migrations to a reviewed test database and complete the outstanding end-to-end, rate-limit, browser/device, and protocol checks before using BHID with real accounts or external clients.

## Environment Configuration

Local configuration is stored in `.env.local`, which must not be committed to version control.

Typical local settings include:

- `JWT_ISSUER`
- `JWT_ACCESS_KEY_ID`
- `JWT_ACCESS_AUDIENCE`
- `JWT_ACCESS_PRIVATE_KEY_PATH`
- `JWT_ACCESS_PUBLIC_KEY_PATH`
- `DATABASE_URL`
- `APP_BASE_URL` for links opened in the BHID app (`http://localhost:3000` locally; the canonical `https://` BHID URL in production)
- `WEBAUTHN_RP_ID` (optional; defaults to the `JWT_ISSUER` hostname)
- `WEBAUTHN_RP_NAME` (optional; defaults to `BHID`)
- `WEBAUTHN_ORIGINS` (optional; defaults to the `JWT_ISSUER` origin)
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email verification and password recovery delivery
- `EMAIL_REPLY_TO` (optional) for replies to BHID verification and recovery emails
- `MFA_TOTP_ENCRYPTION_KEY` for encrypting authenticator secrets (base64-encoded 32-byte key)
- `AWS_REGION`, `AWS_S3_BUCKET`, and `AWS_S3_PUBLIC_BASE_URL` for uploaded profile pictures

For local development and local `next start` smoke tests, the PEM path variables must point to the corresponding key files. On Vercel, configure `JWT_ACCESS_PRIVATE_KEY` and `JWT_ACCESS_PUBLIC_KEY` with the PEM contents as server-side environment variables instead. Literal `\n` sequences in those values are normalized to line breaks. Vercel deployments never fall back to local key-file paths. Keep signing keys out of client-side variables and source control.

Set `JWT_ISSUER` to the exact public issuer URL (for example, `https://auth.bytehaven.world` in production and `http://localhost:3000` locally). Set `JWT_ACCESS_AUDIENCE` to the audience expected by this application. `JWT_ACCESS_KEY_ID` must identify the matching signing key pair. BHID validates that the configured private and public keys match at runtime and reports a server-side configuration error if they do not.

For Vercel, add these variables to the **Production** environment (and Preview/Development if those environments are used): `DATABASE_URL`, `APP_BASE_URL`, `JWT_ISSUER`, `JWT_ACCESS_AUDIENCE`, `JWT_ACCESS_KEY_ID`, `JWT_ACCESS_PRIVATE_KEY`, `JWT_ACCESS_PUBLIC_KEY`, `MFA_TOTP_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AWS_REGION`, `AWS_S3_BUCKET`, and `AWS_S3_PUBLIC_BASE_URL`. Set `APP_BASE_URL` to the canonical public BHID UI origin; do not use the JWT issuer unless it is also the UI origin. If omitted, the app uses Vercel's project production URL or deployment URL when available. Keep signing and AWS credentials server-only; do not prefix them with `NEXT_PUBLIC_`. Paste PEM values with real line breaks or escaped `\n` sequences. Redeploy after changing environment variables. Local `.env.local` key-path variables do not work as a production substitute.

Password recovery email is sent through Resend. If production reports that password recovery email is not configured, add non-empty `RESEND_API_KEY` and `RESEND_FROM_EMAIL` values to the deployment's **Production** environment. Use a Resend API key and a sender address verified in Resend, then redeploy the production deployment; values in local `.env.local` are not available to production. `EMAIL_REPLY_TO` is optional.

Generate `MFA_TOTP_ENCRYPTION_KEY` from 32 random bytes encoded as Base64 (for example, `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`). Keep a secure backup of this key: enrolled authenticator secrets cannot be decrypted without it, and replacing it without re-encrypting stored secrets will break MFA-based password recovery.

Configure S3 credentials using the AWS SDK default credential chain (for example, server-side `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, or an attached AWS role). `AWS_S3_PUBLIC_BASE_URL` must point to a public HTTPS asset origin, preferably a CloudFront distribution backed by the bucket. Apply `database/migrations/005_profile_avatar_s3.sql` before deploying avatar uploads; new uploads save an S3 object key, while existing `avatar_url` values remain readable for backward compatibility.

Apply `database/migrations/003_account_security.sql` before using profile, email verification, wallet-linking, or TOTP settings. Apply `database/migrations/004_password_recovery_and_signup_mfa.sql` before deploying mandatory TOTP enrollment during registration and password recovery. Review the target database and take a backup before applying migrations; the app does not run migrations automatically. Existing accounts must enroll an authenticator in Security Settings before they can use password recovery. Account MFA is not required during sign-in.

Never publish real secrets in this README or in example environment files.

## Running Locally

### Progressive rendering

The App Router uses Cache Components and partial prerendering. The root
`src/app/loading.tsx` provides a streamed route-level loading state, while
Suspense boundaries let request-dependent account and authorization sections
render progressively without blocking the static page shell.

Install dependencies:

```bash
npm install
```

Configure the required local environment variables and ensure the Neon PostgreSQL database is accessible.

Apply the project's version-controlled database migrations using the chosen migration workflow.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Additional setup and test instructions will be documented as the implementation matures.

## Learning and Development Philosophy

BHID is being developed incrementally. Each component should be understood, implemented, and tested before the project moves to the next stage.

Security-sensitive features should be reviewed and tested before they are used to protect real accounts or authorize access across production applications.

## License

To be determined.
