# BHID — ByteHaven Identity

**BHID (ByteHaven Identity)** is the centralized authentication and identity service being developed for the ByteHaven ecosystem.

Its long-term goal is to provide a secure, reusable identity system through which users can access ByteHaven applications such as HavenSocial and HavenPay without needing a separate account for every product.

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

- [ ] Local environment and database validation
- [ ] Registration and password hashing
- [ ] Password login and session creation
- [ ] Refresh-token rotation and logout
- [ ] Current-user endpoint and session management
- [ ] Authentication security hardening
- [ ] Passkey registration and authentication
- [ ] Cross-application OAuth 2.0 and OpenID Connect (route implementation added; migration and end-to-end verification still required)
- [ ] Production deployment and security testing

Update this checklist as each feature is implemented and verified.

## Environment Configuration

Local configuration is stored in `.env.local`, which must not be committed to version control.

Typical local settings include:

- `JWT_ISSUER`
- `JWT_ACCESS_KEY_ID`
- `JWT_ACCESS_PRIVATE_KEY_PATH`
- `JWT_ACCESS_PUBLIC_KEY_PATH`
- `DATABASE_URL`

The PEM paths must point to the corresponding local key files. Production will use separately provisioned signing keys and the production issuer, configured through secure server-side environment variables or an appropriate key-management service.

Never publish real secrets in this README or in example environment files.

## Running Locally

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
