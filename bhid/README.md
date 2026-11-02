# BHID — ByteHaven Identity

BHID is an identity service for ByteHaven products and applications that integrate with it. It provides account sign-in, profile information, and consent-based identity sharing.

## Features

- Account registration, sign-in, and session management
- Passkey and multi-factor authentication
- OAuth 2.0 and OpenID Connect sign-in for registered applications
- User-approved sharing of profile, verification, wallet, and membership information
- Profile and account security settings

## Technology

- Next.js and React
- TypeScript
- PostgreSQL
- Tailwind CSS

## Local development

1. Install Node.js and PostgreSQL.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure the required server-side environment variables in an ignored local `.env.local` file.
4. Apply the database migrations in `database/migrations/` using your local database setup.
5. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Do not commit environment files, credentials, database backups, or user data. The version-controlled migrations describe schema changes; local database exports belong outside the repository.

## License

To be determined.
