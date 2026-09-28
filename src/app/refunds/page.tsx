import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Refunds | The Complete New Homeowner System",
  description: "Refund policy for guide purchases.",
};

export default function RefundsPage() {
  return (
    <PolicyPage
      title="Refund policy"
      description="How we handle requests about digital guide purchases."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Requesting a refund</h2>
        <p className="mt-3">
          If the delivered files are unavailable, materially different from the
          order, or defective, contact support within 14 days of purchase. Send
          the order email, transaction reference if available, and a short
          description of the issue. Do not include card details.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">How we review requests</h2>
        <p className="mt-3">
          We will review the purchase record and first try to restore access or
          replace a faulty file. If that does not resolve an eligible issue, we
          will refund the original payment method. Processing time can depend on
          the payment provider and your card issuer.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Your legal rights</h2>
        <p className="mt-3">
          This policy does not limit any consumer rights that apply where you
          live. Download access begins after payment confirmation.
        </p>
      </section>
    </PolicyPage>
  );
}
