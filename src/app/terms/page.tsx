import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Terms of use | The Complete New Homeowner System",
  description: "Draft terms for guide purchases and downloads.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of use"
      description="The draft rules for buying and using the guides."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">The guides</h2>
        <p className="mt-3">
          The guides are digital resources for practical home ownership. They
          are educational information, not professional inspection, legal,
          financial, engineering, or safety advice for a particular property.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Your license</h2>
        <p className="mt-3">
          After payment is confirmed, you receive a personal, nonexclusive,
          nontransferable license to download and use the purchased guide files
          for your own household. You may not resell, distribute, publish, or
          share the files outside your household without written permission.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Orders and access</h2>
        <p className="mt-3">
          When checkout is live, a card payment will be processed by Paystack.
          A completed card flow alone does not grant access. Files are released
          only after we confirm payment and create a download link. Draft access
          links are intended to remain available for 30 days from fulfillment.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Changes and contact</h2>
        <p className="mt-3">
          We may update guide content or these terms when the service changes.
          Material changes will apply prospectively where required. Contact
          support before sharing any payment details by email.
        </p>
      </section>
    </PolicyPage>
  );
}
