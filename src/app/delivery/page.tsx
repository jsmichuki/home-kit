import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Delivery | The Complete New Homeowner System",
  description: "Digital delivery policy for guide purchases.",
};

export default function DeliveryPage() {
  return (
    <PolicyPage
      title="Digital delivery"
      description="What happens after a guide purchase is confirmed."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Confirmation before delivery</h2>
        <p className="mt-3">
          Delivery begins only after Paystack confirms payment. Returning from a
          card payment page is not confirmation on its own. Once confirmed, we
          create a unique download link for the guide versions included in the
          order.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Email and download page</h2>
        <p className="mt-3">
          We send the link to the email address entered at checkout and show the
          same access route on the payment confirmation page. The link opens a
          page listing only the files included in your purchase. Please check
          your spam or junk folder before contacting support.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Access window</h2>
        <p className="mt-3">
          The initial access window is 30 days from fulfillment.
          Individual file download links will be short lived for security. If
          access does not work during that period, contact support with the
          order email and transaction reference.
        </p>
      </section>
    </PolicyPage>
  );
}
