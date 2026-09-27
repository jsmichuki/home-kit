import Link from "next/link";
import type { ReactNode } from "react";

import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

type PolicyPageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function PolicyPage({
  title,
  description,
  children,
}: PolicyPageProps) {
  return (
    <main className="flex-1 bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-stone-700 underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
          href="/"
        >
          Back to guide selection
        </Link>

        <header className="mt-8 border-b border-stone-200 pb-8">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-stone-700">{description}</p>
        </header>

        <aside
          aria-label="Draft policy notice"
          className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-5 text-stone-800"
        >
          <p className="font-semibold">Draft placeholder for review</p>
          <p className="mt-2 text-sm leading-6">
            This page is a sensible operating draft, not jurisdiction specific
            legal advice. Have qualified counsel review it before live payment
            is enabled.
          </p>
        </aside>

        <div className="mt-10 space-y-8 leading-7 text-stone-800">
          {children}
        </div>

        <p className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-700">
          Questions about this page? Contact us at{" "}
          <a
            className="font-medium underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
            href={SUPPORT_MAILTO}
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </article>
    </main>
  );
}
