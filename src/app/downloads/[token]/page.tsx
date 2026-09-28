import type { Metadata } from "next";
import Link from "next/link";

import { lookupActiveAccessGrant } from "@/lib/access";
import { AccessResendForm } from "@/components/access-resend-form";
import { DownloadGuideList } from "@/components/download-guide-list";
import { SUPPORT_MAILTO } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your guide downloads | The Complete New Homeowner System",
  description: "Access your purchased guide files.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

function formatExpiry(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "the end of your access period";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function AccessUnavailable() {
  return (
    <main id="main-content" className="site-page flex flex-1 items-center bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Download access</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          This download link is unavailable.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          It may have expired, been replaced, or no longer be active. Request another link using your checkout email, or contact support for help.
        </p>
        <AccessResendForm />
        <p className="mt-6 flex flex-wrap gap-x-4 gap-y-3 text-sm">
          <Link className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/">
            Return home
          </Link>
          <a className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href={SUPPORT_MAILTO}>
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}

export default async function DownloadsPage({
  params,
}: PageProps<"/downloads/[token]">) {
  const { token } = await params;
  const grant = await lookupActiveAccessGrant(token).catch(() => null);

  if (!grant) {
    return <AccessUnavailable />;
  }

  return (
    <main id="main-content" className="site-page flex-1 bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Your secure guide access</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          Your purchased guide files are ready.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          This access link is available until {formatExpiry(grant.expiresAt)}. Keep it private because it gives access to your purchased files.
        </p>
        <DownloadGuideList guides={grant.guides} token={token} />
        <AccessResendForm />
        <p className="mt-6 flex flex-wrap gap-x-4 gap-y-3 text-sm">
          <Link className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href="/">
            Return home
          </Link>
          <a className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2" href={SUPPORT_MAILTO}>
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
