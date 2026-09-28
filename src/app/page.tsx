import { KitSelector } from "@/components/kit-selector";
import { TaglineReveal } from "@/components/tagline-reveal";
import { getActiveCompleteSet, getActiveGuideCatalogue, hasSupabaseServerCredentials } from "@/lib/catalog-server";
import { formatPrice, type Guide } from "@/lib/catalog";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";

const GUIDE_JOBS: Record<string, string> = {
  "first-month-home-setup": "Set up", "first-year-home-maintenance": "Maintain", "home-emergency-binder": "Protect", "home-records-warranty": "Organize", "homeowner-budget-repair": "Plan", "contractor-hiring-home-repair": "Decide", "home-renovation-improvement": "Improve", "seasonal-home-care": "Prepare",
};

const MOMENTS = [
  { slug: "first-month-home-setup", kicker: "Your first month", title: "Start with the things that make a home feel like yours.", body: "Secure access, find the systems that matter, make a useful baseline, and get the early details out of your head and into one place.", note: "A practical checklist and editable companion for the first days after closing.", tone: "lime", image: true },
  { slug: "first-year-home-maintenance", kicker: "A year that stays on track", title: "Keep the small jobs from becoming surprise jobs.", body: "Build a maintenance rhythm around your actual home, then use the tracker to keep seasonal work visible and manageable.", note: "A complete first year rhythm with an editable maintenance tracker.", tone: "paper", image: false },
  { slug: "home-records-warranty", kicker: "A home with a memory", title: "Know where the important details live.", body: "Bring appliance details, warranties, service records, and the information you will want quickly into an organized reference.", note: "Keep records useful before a repair makes them urgent.", tone: "garden", image: true },
  { slug: "contractor-hiring-home-repair", kicker: "Repairs and projects", title: "Make the big decisions with a little more context.", body: "Prepare your questions, compare the work in front of you, and create a clearer plan before you call a contractor or start a project.", note: "Practical prompts and editable workbooks for repair and renovation decisions.", tone: "moss", image: false },
] as const;

function Booklet({ guide, priority = false }: { guide: Guide; priority?: boolean }) {
  return <Link aria-label={`Preview ${guide.title}`} className="booklet relative block w-full" href={`/guides/${guide.slug}`}><Image alt={`Guide cover for ${guide.title}`} className="booklet-cover aspect-[396/612] h-auto w-full object-cover" height={612} priority={priority} sizes="(max-width: 640px) 52vw, (max-width: 1024px) 32vw, 240px" src={`/guide-covers/${guide.slug}.png`} width={396} /></Link>;
}

function GuideMoment({ guide, moment, index }: { guide: Guide; moment: (typeof MOMENTS)[number]; index: number }) {
  return <article className={`guide-moment ${index % 2 === 1 ? "guide-moment-reverse" : ""}`}>
    <div className={`guide-moment-media guide-moment-${moment.tone}`}>
      {moment.image ? <Image alt="A calm backyard beside a recently purchased home" fill sizes="(max-width: 1024px) 100vw, 50vw" src="/home-garden-hero.png" className="guide-moment-photo" /> : null}
      <div className="guide-moment-cover"><Booklet guide={guide} priority={index === 0} /></div>
    </div>
    <div className="guide-moment-copy"><p className="eyebrow">{moment.kicker}</p><h3>{moment.title}</h3><p className="guide-moment-body">{moment.body}</p><p className="guide-moment-note">{moment.note}</p><Link className="text-link" href={`/guides/${guide.slug}`}>See the guide <span aria-hidden="true">→</span></Link></div>
  </article>;
}

export default async function Home() {
  if (hasSupabaseServerCredentials()) await connection();
  const [guides, completeSet] = await Promise.all([getActiveGuideCatalogue(), getActiveCompleteSet()]);
  const individualTotal = guides.reduce((total, guide) => total + guide.priceInCents, 0);
  const bundleSaving = individualTotal - completeSet.priceInCents;
  const heroGuides = guides.slice(0, 3);
  const featuredGuides = MOMENTS.map((moment) => guides.find((guide) => guide.slug === moment.slug)).filter((guide): guide is Guide => Boolean(guide));

  return <main id="main-content" className="home-kit flex-1 overflow-hidden">
    <a className="skip-link" href="#main-story">Skip to main content</a>
    <header className="site-header"><nav aria-label="Main navigation" className="site-nav"><Link className="brand-mark" href="/">Homeowner <span>System</span></Link><div className="site-nav-links"><a href="#inside">Guides</a><a href="#how-it-works">How it works</a><a href="#questions">Questions</a></div><Link className="button button-small" href="/?selection=complete#kit-selector">Get the system</Link></nav></header>

    <section className="hero-section"><div className="hero-copy"><p className="eyebrow">The complete new homeowner system</p><h1>Less guessing.<br />More <span>at home.</span></h1><p className="hero-intro">Your home did not come with an owner’s manual. These practical guides and editable tools help you see what matters now, and what can wait.</p><Link className="button" href="/?selection=complete#kit-selector">Get the complete set for {formatPrice(completeSet.priceInCents)}</Link><p className="hero-proof">Eight guides, eight editable companions, delivered after payment confirmation.</p></div><div aria-label="A stack of homeowner guide covers over a garden scene" className="hero-scene"><Image alt="A peaceful backyard at a recently purchased home" fill priority sizes="(max-width: 1024px) 100vw, 960px" src="/home-garden-hero.png" className="hero-photo" /><div className="hero-photo-shade" /><div className="hero-guide hero-guide-back-left"><Booklet guide={heroGuides[2]} /></div><div className="hero-guide hero-guide-back-right"><Booklet guide={heroGuides[1]} /></div><div className="hero-guide hero-guide-main"><Booklet guide={heroGuides[0]} priority /></div><p className="hero-scene-label">Your practical home reference library</p></div></section>

    <div id="main-story"><section className="intro-section"><div><p className="eyebrow">The moment after closing</p><h2>Owning a home is a lot of little questions.</h2></div><div className="intro-copy"><p>Who has access? Where are the shutoffs? What should you keep? What needs attention before another season passes?</p><p>It is easy to keep reacting when every answer lives in a different search, note, or folder.</p><strong>The Complete New Homeowner System keeps the order clear, so you can keep your head in the home.</strong></div></section>
      <section className="tagline-section"><TaglineReveal>A calmer first year begins with knowing what matters now and what can wait.</TaglineReveal></section>
      <section className="moments-section" id="inside">{featuredGuides.map((guide, index) => <GuideMoment guide={guide} index={index} key={guide.id} moment={MOMENTS[index]} />)}</section>
      <section className="library-section"><div className="library-heading"><p className="eyebrow">The full library</p><h2>Everything a homeowner needs. Nothing they do not.</h2><p>The guides meet you across the actual work of owning a home: setting up, maintaining, protecting, organizing, planning, and improving.</p></div><div className="library-grid">{guides.map((guide) => <Link className="library-item" href={`/guides/${guide.slug}`} key={guide.id}><span className="library-icon" aria-hidden="true">{GUIDE_JOBS[guide.slug].slice(0, 1)}</span><strong>{GUIDE_JOBS[guide.slug]}</strong><span>{guide.title}</span></Link>)}</div></section>
      <section className="home-story-section"><Image alt="A garden and home ready for the seasons ahead" fill sizes="100vw" src="/home-garden-hero.png" className="home-story-photo" /><div className="home-story-shade" /><div className="home-story-copy"><p className="eyebrow">Made for the years ahead</p><h2>From moving boxes<br />to making it yours.</h2><p>The system follows the rhythm of ownership: the first day, the first season, the first repair, and the projects that turn a house into home.</p><div className="home-story-stats" aria-label="The complete system includes eight guides and eight editable companions"><span><b>8</b> guides</span><span><b>8</b> editable companions</span><span><b>{formatPrice(completeSet.priceInCents)}</b> complete system</span></div></div></section>
      <section className="how-section" id="how-it-works"><div><p className="eyebrow">How it works</p><h2>A clear route from closing day to a calmer home.</h2></div><ol><li><span>01</span><h3>Choose your starting point</h3><p>Get the whole system for every stage, or choose the guide that fits the task in front of you.</p></li><li><span>02</span><h3>Complete secure checkout</h3><p>Confirm your email and review your order before payment.</p></li><li><span>03</span><h3>Use it at your kitchen table</h3><p>Your secure access route gives you the guides and editable companions after payment confirmation.</p></li></ol></section>
      <section className="faq-section" id="questions"><div><p className="eyebrow">FAQ</p><h2>Questions, answered.</h2><p>Everything you need to know before choosing your guide system.</p></div><div className="faq-list">{[["What is included in the complete set?", `All ${guides.length} active homeowner guides shown on this page, each with its editable companion.`], ["Can I buy one guide instead?", "Yes. Choose the individual guide that fits the work in front of you."], ["When do I receive the files?", "Delivery begins after payment confirmation. Your confirmation page and email provide a secure access route."], ["Are these guides professional advice?", "No. They are practical educational resources, not property specific inspection, legal, financial, engineering, or safety advice."], ["What if I need order or access help?", "Support can help with guide selection, delivery, access, and refund questions."]].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="final-cta-section"><div><p className="eyebrow">Your next step</p><h2>Your next homeowner question starts here.</h2><p>Get all eight guides and editable companions for {formatPrice(completeSet.priceInCents)}, a {formatPrice(bundleSaving)} value compared with choosing them one by one.</p><Link className="button button-dark" href="/?selection=complete#kit-selector">Get the complete system</Link></div><div className="final-cta-cover"><Booklet guide={heroGuides[0]} /></div></section>
    </div><section className="home-kit-selector" id="kit-selector"><KitSelector completeSet={completeSet} guides={guides} /></section>
  </main>;
}
