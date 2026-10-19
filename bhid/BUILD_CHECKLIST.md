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
[ ] Verify email/password securely
[ ] Reject suspended or deleted accounts
[ ] Create a session with a random refresh token
[ ] Store only the refresh-token hash in PostgreSQL
[ ] Sign a short-lived RS256 access token
[ ] Set refresh token in a secure HttpOnly cookie
[ ] Test incorrect passwords and session creation

Milestone 4 — Session lifecycle
[ ] Refresh tokens rotate atomically
[ ] Reject expired, revoked or reused refresh tokens
[ ] Logout revokes the current session
[ ] GET /api/auth/me validates token and current session/user state
[x] List and revoke individual sessions
[ ] Test expiration, logout and revocation

Milestone 5 — Security hardening
[ ] Rate-limit registration, login and refresh endpoints
[ ] Use generic responses where account enumeration is a concern
[ ] Add security audit events without logging secrets
[ ] Check CSRF protections for cookie-based state-changing requests
[ ] Validate JWT algorithm, issuer, audience, expiry and claims
[ ] Add automated tests for critical authentication flows

Milestone 6 — Passkeys
[ ] Implement WebAuthn registration options and verification
[ ] Persist credentials and enforce one-time challenges
[ ] Implement passkey authentication options and verification
[ ] Support multiple passkeys and credential removal
[ ] Test supported browsers/devices and recovery paths

Milestone 7 — Cross-app identity
[ ] Register trusted ByteHaven applications and audiences
[ ] Implement OAuth 2.0 Authorization Code Flow with PKCE
[ ] Implement OpenID Connect endpoints and ID tokens
[ ] Publish public signing keys through a JWKS endpoint
[ ] Test a separate client application against BHID

Milestone 8 — Production readiness
[ ] Back up Neon and test restoring the backup
[ ] Configure separate production signing keys and secrets in Vercel
[ ] Configure production issuer and domain
[ ] Review HTTPS, cookies, CORS, CSRF and redirect URI restrictions
[ ] Deploy to a preview environment and run security tests
[ ] Deploy production only after the preview checks pass