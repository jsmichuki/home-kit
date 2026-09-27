import Link from "next/link";

import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

export function PurchaseExplainer() {
  return (
    <section className="mx-auto mt-16 max-w-4xl border-t border-stone-200 pt-12">
      <h2 className="text-2xl font-semibold tracking-tight">
        Choose the guides that fit the work ahead.
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        <li className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="font-semibold">1. Choose</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            Select individual guides or the complete set. Your choices and total
            are always visible before checkout.
          </p>
        </li>
        <li className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="font-semibold">2. Pay</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            When checkout is enabled, card payment will be handled by Paystack
            and confirmed before any files are released.
          </p>
        </li>
        <li className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="font-semibold">3. Download</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            A unique link will be emailed to you and will open a page with only
            the guides in your order.
          </p>
        </li>
      </ol>

      <div className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          <details className="p-5">
            <summary className="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2">
              What is included in the complete set?
            </summary>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Every active guide shown in the selector, at the set price shown
              there. The order records the exact guide versions included.
            </p>
          </details>
          <details className="p-5">
            <summary className="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2">
              Can I choose individual guides?
            </summary>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Yes. Select only the guides you need. Choosing an individual guide
              after the complete set returns your selection to individual pricing.
            </p>
          </details>
          <details className="p-5">
            <summary className="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2">
              When will I receive the files?
            </summary>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              When checkout is live, delivery begins after payment confirmation.
              The email and confirmation page will provide the secure access
              route.
            </p>
          </details>
          <details className="p-5">
            <summary className="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2">
              What if I need help?
            </summary>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Email{" "}
              <a className="underline underline-offset-4" href={SUPPORT_MAILTO}>
                {SUPPORT_EMAIL}
              </a>
              . We aim to respond within two business days.
            </p>
          </details>
        </div>
      </div>

      <p className="mt-8 text-sm text-stone-700">
        Review our <Link className="underline underline-offset-4" href="/delivery">delivery policy</Link>,{" "}
        <Link className="underline underline-offset-4" href="/refunds">refund policy</Link>, and{" "}
        <Link className="underline underline-offset-4" href="/privacy">privacy notice</Link> before purchase.
      </p>
    </section>
  );
}
