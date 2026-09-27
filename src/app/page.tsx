import { KitSelector } from "@/components/kit-selector";
import { PurchaseExplainer } from "@/components/purchase-explainer";
import {
  getActiveCompleteSet,
  getActiveGuideCatalogue,
  hasSupabaseServerCredentials,
} from "@/lib/catalog-server";
import { connection } from "next/server";

export default async function Home() {
  if (hasSupabaseServerCredentials()) {
    await connection();
  }

  const [guides, completeSet] = await Promise.all([
    getActiveGuideCatalogue(),
    getActiveCompleteSet(),
  ]);

  return (
    <main id="main-content" className="flex-1 bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <a
        className="sr-only absolute left-4 top-4 rounded-md bg-stone-950 px-3 py-2 text-white focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
        href="#kit-selector-heading"
      >
        Skip to guide selection
      </a>
      <section className="mx-auto max-w-4xl text-center">
        <p className="text-sm font-semibold text-stone-700">
          The Complete New Homeowner System
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
          Your home did not come with an owner’s manual. This is it.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-stone-700">
          Choose the guides that match the work in front of you.
        </p>
      </section>

      <KitSelector completeSet={completeSet} guides={guides} />
      <PurchaseExplainer />
    </main>
  );
}
