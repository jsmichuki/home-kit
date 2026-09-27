import type { Metadata } from "next";

import { PaymentConfirmationPanel } from "@/components/payment-confirmation-panel";

export const metadata: Metadata = {
  title: "Payment confirmation | The Complete New Homeowner System",
  description: "Confirming your guide purchase.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function PaymentConfirmationPage({
  searchParams,
}: PageProps<"/payment/confirmation">) {
  const query = await searchParams;
  const reference = typeof query.reference === "string" ? query.reference : "";
  const confirmation = typeof query.confirmation === "string"
    ? query.confirmation
    : "";

  return (
    <main id="main-content" className="flex flex-1 items-center bg-stone-50 px-4 py-12 text-stone-950 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <PaymentConfirmationPanel confirmation={confirmation} reference={reference} />
      </div>
    </main>
  );
}
