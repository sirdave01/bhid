import LoginForm from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{
    continue?: string | string[];
  }>;
};

function safeContinuePath(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/settings/security";
  }

  try {
    const destination = new URL(value, "http://bhid.local");

    if (
      destination.origin !== "http://bhid.local" ||
      ![
        "/api/oauth/authorize",
        "/oauth/consent",
      ].includes(destination.pathname) ||
      value.startsWith("//") ||
      value.includes("\\")
    ) {
      return "/settings/security";
    }

    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/settings/security";
  }
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Sign in to BHID</h1>
      <p className="mt-3 text-gray-600">
        Use your BHID account to continue securely.
      </p>
      <LoginForm continueTo={safeContinuePath(params.continue)} />
    </main>
  );
}
