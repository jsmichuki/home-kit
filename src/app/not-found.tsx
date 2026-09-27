import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-stone-50 px-4 py-12 text-stone-950 sm:px-6">
      <section className="max-w-lg text-center">
        <p className="text-sm font-semibold text-stone-700">Home Kit</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight">
          This page is not available.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          Return to the guide selection to continue building your homeowner kit.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-colors duration-200 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
          href="/"
        >
          Return to guide selection
        </Link>
      </section>
    </main>
  );
}
