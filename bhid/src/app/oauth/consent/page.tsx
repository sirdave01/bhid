import { Suspense } from "react";

import ConsentPrompt from "./consent-prompt";

type ConsentPageProps = {
  searchParams: Promise<{
    request_id?: string | string[];
  }>;
};

export default function ConsentPage({
  searchParams,
}: ConsentPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Review access request</h1>
      <p className="mt-3 text-gray-600">
        Review what this application is asking to access before continuing.
      </p>
      <Suspense
        fallback={
          <p className="mt-8 text-sm text-gray-600">
            Loading authorization request…
          </p>
        }
      >
        <ConsentFromSearchParams searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ConsentFromSearchParams({
  searchParams,
}: ConsentPageProps) {
  const params = await searchParams;
  const requestId =
    typeof params.request_id === "string" ? params.request_id : "";

  return (
    <ConsentPrompt requestId={requestId} />
  );
}
