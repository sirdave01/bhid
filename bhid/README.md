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
- [ ] Cross-application OAuth 2.0 and OpenID Connect
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
