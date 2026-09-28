import { KitSelector } from "@/components/kit-selector";
import { TaglineReveal } from "@/components/tagline-reveal";
import {
  getActiveCompleteSet,
  getActiveGuideCatalogue,
  hasSupabaseServerCredentials,
} from "@/lib/catalog-server";
import { formatPrice, type Guide } from "@/lib/catalog";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";

const GUIDE_JOBS: Record<string, string> = {
  "first-month-home-setup": "Set up",
  "first-year-home-maintenance": "Maintain",
  "home-emergency-binder": "Protect",
  "home-records-warranty": "Protect",
  "homeowner-budget-repair": "Budget",
  "contractor-hiring-home-repair": "Improve",
  "home-renovation-improvement": "Improve",
  "seasonal-home-care": "Maintain",
};

function Booklet({ guide, priority = false }: { guide: Guide; priority?: boolean }) {
  return (
    <Link
      aria-label={`Preview ${guide.title}`}
      className="booklet relative block w-full"
      href={`/guides/${guide.slug}`}
    >
      <Image
        alt={`3D booklet cover for ${guide.title}`}
        className="booklet-cover aspect-[396/612] h-auto w-full object-cover"
        height={612}
        priority={priority}
        sizes="(max-width: 640px) 44vw, (max-width: 1024px) 25vw, 180px"
        src={`/guide-covers/${guide.slug}.png`}
        width={396}
      />
    </Link>
  );
}

export default async function Home() {
  if (hasSupabaseServerCredentials()) {
    await connection();
  }

  const [guides, completeSet] = await Promise.all([
    getActiveGuideCatalogue(),
    getActiveCompleteSet(),
  ]);
  const individualTotal = guides.reduce((total, guide) => total + guide.priceInCents, 0);
  const bundleSaving = individualTotal - completeSet.priceInCents;
  const heroGuides = guides.slice(0, 3);

  return (
    <main id="main-content" className="home-kit paper-texture flex-1 overflow-hidden text-[color:var(--ink)]">
      <a
        className="sr-only absolute left-4 top-4 rounded-md bg-[color:var(--terracotta)] px-3 py-2 text-white focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2"
        href="#main-story"
      >
        Skip to main content
      </a>
      <header className="px-4 pt-6 sm:px-6">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-[color:color-mix(in_srgb,var(--sage)_45%,transparent)] bg-[color:var(--paper-raised)] px-4 py-3 shadow-sm sm:px-6">
          <Link className="display-font text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2" href="/">
            Homeowner System
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-[color:var(--sage-dark)] md:flex">
            <a className="hover:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)]" href="#inside">What’s inside</a>
            <a className="hover:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)]" href="#how-it-works">How it works</a>
            <a className="hover:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)]" href="#questions">Questions</a>
          </div>
          <a className="rounded-full bg-[color:var(--terracotta)] px-3 py-2 text-sm font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--terracotta-dark)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2" href="#kit-selector">
            Get the set
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.06fr_.94fr] lg:items-center lg:pb-28 lg:pt-24">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[color:var(--sage-dark)]">The Complete New Homeowner System</p>
          <h1 className="display-font mt-5 max-w-[680px] text-balance text-5xl leading-[1.02] sm:text-7xl">
            Your home did not come with an owner’s manual. <span className="text-[color:var(--sage-dark)]">This is it.</span>
          </h1>
          <p className="mt-6 max-w-[620px] text-pretty text-lg leading-8 text-[color:var(--sage-dark)]">
            Eight practical guides and editable companions for the work that begins after closing: setting up, maintaining, protecting, budgeting, and improving your home.
          </p>
          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a className="rounded-full bg-[color:var(--terracotta)] px-5 py-3 text-base font-semibold text-white shadow-[0_8px_20px_rgba(156,78,45,0.22)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-[color:var(--terracotta-dark)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2" href="#kit-selector">
              Get the complete set for {formatPrice(completeSet.priceInCents)}
            </a>
            <p className="text-sm leading-6 text-[color:var(--sage-dark)]">All {guides.length} guides and editable companions. Delivered after payment confirmation.</p>
          </div>
          <p className="mt-8 border-l-2 border-[color:var(--sage)] pl-4 text-sm font-medium text-[color:var(--sage-dark)]">
            Buy separately for {formatPrice(individualTotal)}. Get the complete system for {formatPrice(completeSet.priceInCents)}.
          </p>
        </div>
        <div aria-label="A stack of homeowner guide booklets" className="relative mx-auto min-h-[410px] w-full max-w-[460px] sm:min-h-[500px]">
          <div className="absolute bottom-2 left-1/2 h-12 w-72 -translate-x-1/2 rounded-full bg-[rgba(104,82,54,0.16)] blur-xl" />
          {heroGuides.map((guide, index) => (
            <div
              className="absolute w-[46%]"
              key={guide.id}
              style={{
                left: `${index === 0 ? 26 : index === 1 ? 52 : 4}%`,
                top: `${index === 0 ? 2 : index === 1 ? 20 : 26}%`,
                zIndex: 3 - index,
                ["--book-x" as string]: `${index === 0 ? 2 : index === 1 ? -1 : 3}deg`,
                ["--book-y" as string]: `${index === 0 ? -11 : index === 1 ? 5 : 14}deg`,
              }}
            >
              <Booklet guide={guide} priority={index === 0} />
            </div>
          ))}
          <div className="absolute bottom-0 left-0 rounded-full border border-[color:color-mix(in_srgb,var(--sage)_40%,transparent)] bg-[color:var(--paper-raised)] px-4 py-2 text-sm font-medium text-[color:var(--sage-dark)] shadow-sm">
            8 guides · 1 practical system
          </div>
        </div>
      </section>

      <div id="main-story">
        <section className="border-y border-[color:color-mix(in_srgb,var(--sage)_40%,transparent)] bg-[color:var(--paper-raised)] px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div className="rounded-[2rem] border border-[color:color-mix(in_srgb,var(--sage)_44%,transparent)] bg-[color:var(--background)] p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold text-[color:var(--sage-dark)]">Your first month priorities</p>
              <ol className="mt-6 space-y-4">
                {["Secure access", "Find the shutdowns", "Check life safety", "Create a baseline", "Catch small problems early"].map((priority, index) => (
                  <li className="flex gap-4 border-t border-[color:color-mix(in_srgb,var(--sage)_32%,transparent)] pt-4 first:border-t-0 first:pt-0" key={priority}>
                    <span className="display-font text-3xl text-[color:var(--sage)]">{index + 1}.</span>
                    <span className="pt-1 font-semibold">{priority}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--sage-dark)]">Start with the essentials</p>
              <h2 className="display-font mt-4 max-w-[680px] text-balance text-4xl leading-tight sm:text-6xl">Closing gives you the keys. It does not give you a plan.</h2>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-[color:var(--sage-dark)]">The first weeks of homeownership are full of small decisions that matter: what to secure, what to photograph, what to maintain, and what to keep for later. The system puts those decisions in one clear order.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:py-32">
          <TaglineReveal>A calmer first year starts with knowing what matters now and what can wait.</TaglineReveal>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[color:var(--sage-dark)]">The payoff</p>
            <h2 className="display-font mt-4 text-balance text-4xl sm:text-5xl">Make the work of owning a home feel manageable.</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              ["Start with the essentials", "Secure access, find shutdowns, record your baseline, and catch small problems early."],
              ["Keep the year on track", "Turn recurring maintenance into a practical rhythm instead of a vague intention."],
              ["Make records useful", "Keep warranty, appliance, emergency, and service information ready when you need it."],
              ["Make expensive decisions with context", "Plan repairs, compare contractors, and scope renovations before you commit."],
            ].map(([title, body], index) => (
              <article className="rounded-2xl border border-[color:color-mix(in_srgb,var(--sage)_44%,transparent)] bg-[color:var(--paper-raised)] p-6 sm:p-8" key={title}>
                <span className="display-font text-4xl text-[color:var(--terracotta)]">0{index + 1}</span>
                <h3 className="display-font mt-6 text-2xl">{title}</h3>
                <p className="mt-3 text-pretty leading-7 text-[color:var(--sage-dark)]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-[color:color-mix(in_srgb,var(--sage)_40%,transparent)] bg-[color:var(--paper-raised)] px-4 py-20 sm:px-6 lg:py-28" id="inside">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-[color:var(--sage-dark)]">What’s inside</p>
                <h2 className="display-font mt-4 text-balance text-4xl leading-tight sm:text-6xl">Everything you need for the work that comes with a home.</h2>
              </div>
              <p className="max-w-sm text-pretty leading-7 text-[color:var(--sage-dark)]">The complete set follows the actual order of homeownership, from the first day through your first year and the projects after that.</p>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
              {guides.map((guide) => (
                <article key={guide.id}>
                  <Booklet guide={guide} />
                  <p className="mt-5 text-xs font-semibold tracking-wide text-[color:var(--sage-dark)]">{GUIDE_JOBS[guide.slug]}</p>
                  <h3 className="display-font mt-2 text-xl leading-tight">{guide.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sage-dark)]">{guide.includedFiles.join(" + ")}</p>
                  <p className="mt-3 text-sm font-semibold">{formatPrice(guide.priceInCents)}</p>
                </article>
              ))}
            </div>
            <aside className="mt-20 grid gap-6 rounded-3xl border border-[color:var(--sage)] bg-[color:var(--background)] p-8 sm:p-10 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-[color:var(--sage-dark)]">The complete set</p>
                <h3 className="display-font mt-2 text-3xl sm:text-4xl">8 guides. Editable companions. One practical system.</h3>
                <p className="mt-4 max-w-xl leading-7 text-[color:var(--sage-dark)]">Save {formatPrice(bundleSaving)} compared with choosing every guide separately.</p>
              </div>
              <a className="rounded-full bg-[color:var(--terracotta)] px-5 py-3 text-center font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--terracotta-dark)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2" href="#kit-selector">Get the set for {formatPrice(completeSet.priceInCents)}</a>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28" id="how-it-works">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[color:var(--sage-dark)]">How it works</p>
            <h2 className="display-font mt-4 text-balance text-4xl sm:text-5xl">A simple route from closing day to a calmer home.</h2>
          </div>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              ["Choose the complete system", "Start with every guide or browse individual modules if one task is urgent."],
              ["Pay securely", "Confirm your email and complete checkout with a clear order summary."],
              ["Use the guide in front of you", "Receive your secure access route after payment confirmation, then print, save, or work through the editable companion."],
            ].map(([title, body], index) => (
              <li className="border-t border-[color:var(--sage)] pt-5" key={title}>
                <p className="display-font text-4xl text-[color:var(--terracotta)]">{index + 1}</p>
                <h3 className="display-font mt-5 text-2xl">{title}</h3>
                <p className="mt-3 leading-7 text-[color:var(--sage-dark)]">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-[color:var(--ink)] px-4 py-20 text-[color:var(--paper-raised)] sm:px-6 lg:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div className="mx-auto max-w-[260px]">
              <Booklet guide={guides[0]} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#c8b495]">A practical preview</p>
              <h2 className="display-font mt-4 text-balance text-4xl leading-tight sm:text-5xl">Designed for the kitchen table, not a forgotten download folder.</h2>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-[#d7d0c3]">The first guide starts with the work that matters immediately: secure access, home systems, life safety, a useful baseline, and the small problems that are easiest to catch early.</p>
              <Link className="mt-8 inline-flex min-h-11 items-center border-b border-[#c8b495] pb-1 font-semibold text-[#f4ebdd] transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#c8b495]" href="/guides/first-month-home-setup">Preview the first 30 days guide</Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:py-28" id="questions">
          <p className="text-sm font-semibold text-[color:var(--sage-dark)]">Questions</p>
          <h2 className="display-font mt-4 text-balance text-4xl sm:text-5xl">Clear answers before you choose.</h2>
          <div className="mt-10 divide-y divide-[color:color-mix(in_srgb,var(--sage)_45%,transparent)] border-y border-[color:color-mix(in_srgb,var(--sage)_45%,transparent)]">
            {[
              ["What is included in the complete set?", "All eight active homeowner guides shown on this page, each with its listed editable companion."],
              ["Can I buy one guide instead?", "Yes. The guide catalog lets you choose the module that fits the task in front of you."],
              ["When do I receive my files?", "Delivery begins after payment confirmation. The confirmation page and email provide the secure access route."],
              ["Are these guides useful after the first year?", "Yes. The first month guide is especially useful after closing, while maintenance, records, emergency, repair, contractor, renovation, and seasonal guides support ongoing ownership."],
            ].map(([question, answer]) => (
              <details className="group py-5" key={question}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)]">
                  {question}<span aria-hidden="true" className="text-2xl text-[color:var(--terracotta)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 max-w-2xl leading-7 text-[color:var(--sage-dark)]">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-[color:color-mix(in_srgb,var(--sage)_40%,transparent)] bg-[color:var(--paper-raised)] px-4 py-20 text-center sm:px-6 lg:py-28">
          <p className="text-sm font-semibold text-[color:var(--sage-dark)]">Your homeowner reference library</p>
          <h2 className="display-font mx-auto mt-4 max-w-3xl text-balance text-4xl leading-tight sm:text-6xl">Build a calmer first year, one clear task at a time.</h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-7 text-[color:var(--sage-dark)]">All eight guides and editable companions are ready when the work in front of you changes.</p>
          <a className="mt-8 inline-flex rounded-full bg-[color:var(--terracotta)] px-5 py-3 font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-[color:var(--terracotta-dark)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[color:var(--terracotta)] focus:ring-offset-2" href="#kit-selector">Get the complete set for {formatPrice(completeSet.priceInCents)}</a>
        </section>
      </div>

      <section className="home-kit-selector bg-[color:var(--background)] px-4 py-20 sm:px-6 lg:py-28" id="kit-selector">
        <KitSelector completeSet={completeSet} guides={guides} />
      </section>
    </main>
  );
}
