import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findGuideBySlug, GUIDES } from "@/lib/catalog";

type GuidePreviewPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuidePreviewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGuideBySlug(slug);

  if (!guide) {
    return {};
  }

  return {
    title: `${guide.title} | Home Kit`,
    description: guide.longDescription,
  };
}

export default async function GuidePreviewPage({
  params,
}: GuidePreviewPageProps) {
  const { slug } = await params;
  const guide = findGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  return (
    <main className="flex-1 bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-2xl">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-stone-950 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
          href="/#kit-selector-heading"
        >
          Back to guide selection
        </Link>
        <p className="mt-8 text-sm font-semibold text-stone-700">
          Guide preview
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight">
          {guide.title}
        </h1>
        <p className="mt-5 text-pretty text-lg text-stone-700">
          {guide.longDescription}
        </p>

        <section aria-labelledby="included-heading" className="mt-10 rounded-lg border border-stone-300 bg-white p-6">
          <h2 id="included-heading" className="text-xl font-semibold">
            Included with this guide
          </h2>
          <ul className="mt-4 space-y-2 text-base text-stone-700">
            {guide.includedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>

        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-colors duration-200 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
          href="/#kit-selector-heading"
        >
          Select this guide
        </Link>
      </article>
    </main>
  );
}
