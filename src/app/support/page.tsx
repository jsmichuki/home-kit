import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support | The Complete New Homeowner System",
  description: "Get help with guide selection, delivery, or downloads.",
};

export default function SupportPage() {
  return (
    <PolicyPage
      title="Support"
      description="Help with choosing guides, delivery, access, and refunds."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Contact support</h2>
        <p className="mt-3">
          Email{" "}
          <a
            className="font-medium underline underline-offset-4 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
            href={SUPPORT_MAILTO}
          >
            {SUPPORT_EMAIL}
          </a>
          . Our initial response target is two business days.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">What to include</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>The email address used at checkout.</li>
          <li>Your transaction or order reference, if you have one.</li>
          <li>The guide or download issue and any error message.</li>
        </ul>
        <p className="mt-3">
          Never send your full card number, CVV, password, or download link to
          support by email.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Before you write</h2>
        <p className="mt-3">
          For a missing delivery email, check spam or junk and confirm the
          checkout email. For an expired or unavailable download, include the
          order details above so we can locate the purchase securely.
        </p>
      </section>
    </PolicyPage>
  );
}
