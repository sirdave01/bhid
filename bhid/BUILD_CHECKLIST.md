Milestone 1 — Local foundation
[x] Generate and verify the local RSA key pair
[x] Confirm .gitignore protects environment files and PEM keys
[x] Confirm Neon PostgreSQL connection works locally
[x] Confirm schema migrations have been applied successfully
[x] Confirm JWT key loader reads the configured PEM paths

Milestone 2 — Registration
[x] Validate registration input with Zod
[x] Normalize email and enforce unique email/username rules
[x] Hash passwords using Argon2id
[x] Create user and profile in a database transaction
[x] Return a safe response without password hashes
[x] Test valid, invalid, duplicate and database-error cases

Milestone 3 — Login and sessions
[x] Verify email/password securely
[x] Reject suspended or deleted accounts
[x] Create a session with a random refresh token
[x] Store only the refresh-token hash in PostgreSQL
[x] Sign a short-lived RS256 access token
[x] Set refresh token in a secure HttpOnly cookie
[x] Test incorrect passwords and session creation

Milestone 4 — Session lifecycle
[x] Refresh tokens rotate atomically
[x] Reject expired, revoked or reused refresh tokens
[x] Logout revokes the current session
[x] GET /api/auth/me validates token and current session/user state
[x] List and revoke individual sessions
[x] Verify sign-out flow and route-level session checks

Milestone 5 — Security hardening
[x] Review JWT algorithm, issuer, audience, expiry and claim validation
[x] Confirm MFA is required for account creation and password recovery, but not standard sign-in
[x] Require both email verification code and TOTP during password reset
[x] Add password visibility toggles to the sign-in and reset forms
[ ] Rate-limit registration, login and refresh endpoints
[ ] Use generic responses where account enumeration is a concern
[ ] Add security audit events without logging secrets
[ ] Check CSRF protections for cookie-based state-changing requests
[ ] Add automated tests for critical authentication flows

Milestone 6 — Passkeys and MFA
[x] Implement WebAuthn registration options and verification
[x] Persist credentials and enforce one-time challenges
[x] Implement passkey authentication options and verification
[x] Support multiple passkeys and credential removal
[x] Add MFA/TOTP setup and verification with secure secret storage
[ ] Test supported browsers/devices and recovery paths

Milestone 7 — Cross-app identity
[x] Implement OAuth 2.0 Authorization Code Flow with PKCE
[x] Implement OpenID Connect endpoints and ID tokens
[x] Publish public signing keys through a JWKS endpoint
[x] Add protected routes and guarded navigation for authenticated users
[ ] Test a separate client application against BHID

Milestone 8 — Production readiness
[x] Confirm the app builds successfully in production mode
[x] Fix the public/home auth navigation and dark theme layout
[x] Protect settings, profile, security, wallet and password routes behind authentication
[x] Configure and document the public-vs-authenticated access model
[ ] Back up Neon and test restoring the backup
[ ] Configure separate production signing keys and secrets in Vercel
[ ] Configure production issuer and domain
[ ] Review HTTPS, cookies, CORS, CSRF and redirect URI restrictions
[ ] Deploy to a preview environment and run security tests
[ ] Deploy production only after the preview checks pass

New follow-up items
- [ ] Validate the live Vercel environment contains the exact RSA PEM values and `JWT_ISSUER=https://auth.bytehaven.world`
- [ ] Confirm the deployed production database and user records match the current local schema
- [ ] Validate the real sign-in email account against the production environment after secrets are synced
- [ ] Add resend-email cooldown and user-friendly recovery messaging if needed