// this is the registration page for the user to create an account on the BHID application.
// It provides a form for users to enter their registration details, including first name,
// last name, email, password, and username. The page uses validation from Zod in validation.ts
// for each field to ensure that the input meets the required criteria before submission.

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Create a BHID account</h1>
      <p className="mt-3 text-gray-600">
        The registration interface is under development.
      </p>
    </main>
  );
}