import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Privacy | The Complete New Homeowner System",
  description: "Draft privacy notice for guide purchases and downloads.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy"
      description="How the planned purchase and delivery flow handles personal data."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Information we use</h2>
        <p className="mt-3">
          To process an order and provide download access, we expect to use your
          email address, order and transaction references, selected guides,
          payment status, and limited delivery and download activity. We do not
          store full card numbers or CVV values.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Why we use it</h2>
        <p className="mt-3">
          We use this information to process payment, send the delivery email,
          protect downloads from unauthorized access, answer support requests,
          keep required business records, and investigate fraud or service
          issues. It is not used as marketing consent.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Service providers</h2>
        <p className="mt-3">
          The planned service uses Paystack for card payment processing,
          Supabase for database and private file storage, and Resend for
          transactional email delivery. Each provider processes information only
          as needed to provide its part of the service.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Retention and choices</h2>
        <p className="mt-3">
          We plan to keep order and payment records only for as long as needed
          for delivery, support, security, and legal obligations. You may ask
          about access, correction, or deletion by contacting support. Applicable
          law may affect which requests we can fulfill and which records we must
          retain.
        </p>
      </section>
    </PolicyPage>
  );
}
