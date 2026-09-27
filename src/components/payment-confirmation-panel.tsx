"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  isPaymentConfirmationResponse,
  isValidConfirmationSecret,
  isValidPaymentReference,
  type PaymentConfirmationResponse,
} from "@/lib/payment-confirmation";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

const POLL_INTERVAL_MS = 2_500;
const MAX_POLL_ATTEMPTS = 10;

type DisplayState = PaymentConfirmationResponse["status"] | "timeout";

type PaymentConfirmationPanelProps = {
  confirmation: string;
  reference: string;
};

function pluralizeGuides(count: number) {
  return `${count} guide${count === 1 ? " is" : "s are"}`;
}

function HelpLinks() {
  return (
    <p className="mt-6 flex flex-wrap gap-x-4 gap-y-3 text-sm">
      <Link
        className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
        href="/"
      >
        Return home
      </Link>
      <a
        className="font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
        href={SUPPORT_MAILTO}
      >
        Contact support
      </a>
    </p>
  );
}

function NewPaymentLink() {
  return (
    <div className="mt-6">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-stone-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
        href="/?retry=payment"
      >
        Start a new payment
      </Link>
      <p className="mt-3 text-sm text-stone-700">
        This creates a separate payment attempt and does not reuse the earlier one.
      </p>
    </div>
  );
}

export function PaymentConfirmationPanel({
  confirmation,
  reference,
}: PaymentConfirmationPanelProps) {
  const [state, setState] = useState<DisplayState>("pending");
  const [result, setResult] = useState<PaymentConfirmationResponse | null>(null);
  const callbackIsValid = isValidPaymentReference(reference)
    && isValidConfirmationSecret(confirmation);

  useEffect(() => {
    if (!callbackIsValid) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timeoutId: number | undefined;
    const controller = new AbortController();

    async function poll() {
      attempts += 1;

      try {
        const response = await fetch(
          `/api/orders/by-reference/${encodeURIComponent(reference)}?confirmation=${encodeURIComponent(confirmation)}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const payload: unknown = response.ok ? await response.json() : null;

        if (cancelled) {
          return;
        }

        if (isPaymentConfirmationResponse(payload) && payload.status !== "pending") {
          setResult(payload);
          setState(payload.status);
          return;
        }

        if (isPaymentConfirmationResponse(payload)) {
          setResult(payload);
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        setState("timeout");
        return;
      }

      timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [callbackIsValid, confirmation, reference]);

  const displayState = callbackIsValid ? state : "unknown";

  if (displayState === "fulfilled") {
    const guideCount = result?.guideCount ?? 0;
    const maskedEmail = result?.maskedEmail ?? "your email address";

    return (
      <section aria-labelledby="payment-confirmed-heading" className="rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Payment confirmed</p>
        <h1 id="payment-confirmed-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          Your {pluralizeGuides(guideCount)} ready.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          We will send your secure download link to {maskedEmail}. Keep that link private because it provides access to your purchased guides.
        </p>
        {result?.downloadPath ? (
          <Link
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-stone-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
            href={result.downloadPath}
          >
            Download your guides
          </Link>
        ) : (
          <p className="mt-6 text-sm text-stone-700" role="status">
            Your secure download page is being prepared. The email link is the safe way to access your files.
          </p>
        )}
        <HelpLinks />
      </section>
    );
  }

  if (
    displayState === "failed"
    || displayState === "abandoned"
    || displayState === "cancelled"
  ) {
    const heading = displayState === "cancelled"
      ? "Your payment was cancelled."
      : displayState === "abandoned"
        ? "Your payment was not completed."
        : "We could not confirm a successful payment.";

    return (
      <section aria-labelledby="payment-not-complete-heading" className="rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Payment not complete</p>
        <h1 id="payment-not-complete-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          {heading}
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          No files have been released for this payment attempt.
        </p>
        <NewPaymentLink />
        <HelpLinks />
      </section>
    );
  }

  if (displayState === "timeout") {
    return (
      <section aria-labelledby="payment-still-confirming-heading" className="rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Confirmation is taking longer than usual</p>
        <h1 id="payment-still-confirming-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          We are still confirming your payment.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          You do not need to pay again while confirmation is in progress. If you need help, contact {SUPPORT_EMAIL}.
        </p>
        <HelpLinks />
      </section>
    );
  }

  if (displayState === "unknown") {
    return (
      <section aria-labelledby="payment-help-heading" className="rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-700">Payment help</p>
        <h1 id="payment-help-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
          We could not find a payment to confirm.
        </h1>
        <p className="mt-4 text-pretty text-base text-stone-700">
          For your privacy, this page cannot show payment details. Return home or contact support if you need help.
        </p>
        <HelpLinks />
      </section>
    );
  }

  return (
    <section aria-labelledby="payment-confirming-heading" aria-live="polite" className="rounded-lg border border-stone-300 bg-white p-6 sm:p-8">
      <p className="text-sm font-semibold text-stone-700">Payment confirmation</p>
      <h1 id="payment-confirming-heading" className="mt-2 text-balance text-3xl font-semibold tracking-tight text-stone-950">
        We are confirming your payment.
      </h1>
      <p className="mt-4 text-pretty text-base text-stone-700">
        This can take a short moment. Payment return alone does not release files. Please keep this page open while we check for confirmation.
      </p>
    </section>
  );
}

export const paymentConfirmationPolling = {
  intervalMs: POLL_INTERVAL_MS,
  maxAttempts: MAX_POLL_ATTEMPTS,
};
