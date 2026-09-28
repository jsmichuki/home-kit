"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  COMPLETE_SET,
  formatPrice,
  type Bundle,
  type Guide,
} from "@/lib/catalog";

const DRAFT_STORAGE_KEY = "home-kit-selection";

type KitSelectorProps = {
  completeSet?: Bundle;
  guides: readonly Guide[];
};

type StoredDraft = {
  email?: string;
  productIds?: string[];
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readStoredDraft(): StoredDraft | null {
  const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    return JSON.parse(rawDraft) as StoredDraft;
  } catch {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function formatCheckoutError(error: CheckoutError) {
  if (!error.requestId) {
    return error.message;
  }

  return `${error.message} If it keeps happening, contact support and include reference ${error.requestId}.`;
}

export function KitSelector({ completeSet = COMPLETE_SET, guides }: KitSelectorProps) {
  const searchParams = useSearchParams();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [formError, setFormError] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const allowedProductIds = useMemo(
    () => new Set([...guides.map((guide) => guide.id), completeSet.id]),
    [completeSet.id, guides],
  );
  const completeSetRequested = (searchParams?.get("selection")
    ?? (typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("selection"))) === "complete";
  const completeSetSelected = selectedProductIds.includes(completeSet.id);
  const selectedGuides = guides.filter((guide) =>
    selectedProductIds.includes(guide.id),
  );
  const individualTotal = selectedGuides.reduce(
    (total, guide) => total + guide.priceInCents,
    0,
  );
  const completeSetIndividualPrice = guides.reduce(
    (sum, guide) => sum + guide.priceInCents,
    0,
  );
  const bundleDiscount = completeSetIndividualPrice - completeSet.priceInCents;
  const total = completeSetSelected ? completeSet.priceInCents : individualTotal;
  const guideCount = completeSetSelected ? guides.length : selectedGuides.length;
  const emailError = emailTouched && !isValidEmail(email)
    ? "Enter a valid email address."
    : "";
  const canContinue = guideCount > 0 && isValidEmail(email) && !isCreatingCheckout;

  const selectionSummary = completeSetSelected
    ? `${completeSet.title} selected. All ${guides.length} guides are included.`
    : selectedGuides.length === 0
      ? "No guides selected."
      : `${selectedGuides.length} guide${selectedGuides.length === 1 ? "" : "s"} selected.`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const draft = readStoredDraft();

      if (completeSetRequested) {
        setSelectedProductIds([completeSet.id]);
        setStatusMessage(`The complete set includes all ${guides.length} guides.`);
      } else if (draft) {
        const restoredProductIds = (draft.productIds ?? []).filter((id) =>
          allowedProductIds.has(id),
        );

        if (restoredProductIds.includes(completeSet.id)) {
          setSelectedProductIds([completeSet.id]);
        } else {
          setSelectedProductIds(restoredProductIds);
        }

        setEmail(draft.email ?? "");
      }

      setHasRestoredDraft(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [allowedProductIds, completeSet.id, completeSetRequested, guides.length]);

  useEffect(() => {
    if (!hasRestoredDraft) {
      return;
    }

    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ email, productIds: selectedProductIds }),
    );
  }, [email, hasRestoredDraft, selectedProductIds]);

  function toggleGuide(guideId: string) {
    if (isCreatingCheckout) {
      return;
    }
    setStatusMessage("");
    setFormError("");

    if (completeSetSelected) {
      setSelectedProductIds([guideId]);
      setStatusMessage(
        "The complete set was replaced with your individual guide selection.",
      );
      return;
    }

    setSelectedProductIds((currentIds) =>
      currentIds.includes(guideId)
        ? currentIds.filter((id) => id !== guideId)
        : [...currentIds, guideId],
    );
  }

  function toggleCompleteSet() {
    if (isCreatingCheckout) {
      return;
    }
    setFormError("");
    setSelectedProductIds((currentIds) => {
      const nextSelection = currentIds.includes(completeSet.id)
        ? []
        : [completeSet.id];

      setStatusMessage(
        nextSelection.length > 0
          ? `The complete set includes all ${guides.length} guides.`
          : "The complete set was removed.",
      );

      return nextSelection;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (guideCount === 0) {
      setFormError("Select at least one guide to continue.");
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    if (!isValidEmail(email)) {
      setEmailTouched(true);
      setFormError("Enter a valid email address to continue.");
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    setFormError("");
    setStatusMessage("");
    setIsCreatingCheckout(true);

    const idempotencyKey = idempotencyKeyRef.current ?? createIdempotencyKey();
    idempotencyKeyRef.current = idempotencyKey;

    try {
      const response = await fetch("/api/checkout", {
        body: JSON.stringify({ email, productIds: selectedProductIds }),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as CheckoutResponse | null;

      if (!response.ok || !result || !("authorizationUrl" in result)) {
        idempotencyKeyRef.current = null;
        setFormError(
          result && "error" in result
            ? formatCheckoutError(result.error)
            : "We could not start your payment. Please try again.",
        );
        window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
        return;
      }

      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.location.assign(result.authorizationUrl);
    } catch {
      idempotencyKeyRef.current = null;
      setFormError("We could not start your payment. Check your connection and try again.");
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setIsCreatingCheckout(false);
    }
  }

  return (
    <section aria-labelledby="kit-selector-heading" className="mt-12">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 id="kit-selector-heading" className="text-3xl font-semibold text-stone-950">
            Choose the plan that gives you a clear start
          </h2>
          <p className="mt-3 text-base text-stone-700">
            Choose the complete system to keep every homeowner task in one place, or select the guide that fits the question in front of you.
          </p>
        </div>

        <form aria-busy={isCreatingCheckout} className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]" onSubmit={handleSubmit}>
          {formError ? (
            <div
              aria-labelledby="selection-error-heading"
              className="rounded-md border border-red-700 bg-white p-4 text-red-950 lg:col-span-2"
              ref={errorSummaryRef}
              role="alert"
              tabIndex={-1}
            >
              <h3 id="selection-error-heading" className="text-base font-semibold">
                Secure checkout could not start.
              </h3>
              <p className="mt-1 text-sm">{formError}</p>
            </div>
          ) : null}
          <fieldset className="grid gap-3">
            <legend className="sr-only">Choose your guides</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-stone-950 bg-stone-100 p-4 text-left transition-colors duration-200 hover:bg-stone-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-950 has-[:focus-visible]:ring-offset-2">
              <input
                checked={completeSetSelected}
                className="mt-1 size-5 accent-stone-950"
                disabled={isCreatingCheckout}
                name="complete-set"
                onChange={toggleCompleteSet}
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-stone-950">
                  {completeSet.title}
                </span>
                <span className="mt-1 block text-sm text-stone-700">
                  {completeSet.description}
                </span>
                <span className="mt-2 block text-sm font-medium text-stone-950">
                  Save {formatPrice(bundleDiscount)} compared with individual guides.
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold text-stone-950">
                {formatPrice(completeSet.priceInCents)}
              </span>
            </label>
            <details className="group rounded-lg border border-stone-300 bg-white">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-4 text-base font-semibold text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-inset">
                Build a custom kit instead
                <span aria-hidden="true" className="text-xl font-normal transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <div className="grid gap-3 border-t border-stone-200 p-3">
                {guides.map((guide) => {
                  const checked = selectedProductIds.includes(guide.id);

                  return (
                    <div key={guide.id} className="rounded-lg border border-stone-300 bg-white">
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 p-4 text-left transition-colors duration-200 hover:bg-stone-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-950 has-[:focus-visible]:ring-offset-2">
                        <input
                          checked={checked}
                          className="mt-1 size-5 accent-stone-950"
                          disabled={isCreatingCheckout}
                          name="guides"
                          onChange={() => toggleGuide(guide.id)}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-stone-950">
                            {guide.title}
                          </span>
                          <span className="mt-1 block text-sm text-stone-700">
                            {guide.description}
                          </span>
                          <span className="mt-2 block text-sm text-stone-600">
                            Includes {guide.includedFiles.join(" and ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-base font-semibold text-stone-950">
                          {formatPrice(guide.priceInCents)}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </details>
          </fieldset>

          <aside className="order-first h-fit rounded-lg border border-stone-300 bg-white p-4 lg:order-none lg:sticky lg:top-6">
            <h3 className="text-lg font-semibold text-stone-950">Your selection</h3>
            <p aria-live="polite" className="mt-2 text-sm text-stone-700">
              {selectionSummary}
            </p>
            {completeSetSelected ? (
              <details className="mt-4 text-sm text-stone-700">
                <summary className="cursor-pointer font-semibold text-stone-950 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2">
                  See all included guides
                </summary>
                <ul className="mt-3 space-y-1">
                  {guides.map((guide) => (
                    <li key={guide.id}>{guide.title}</li>
                  ))}
                </ul>
              </details>
            ) : selectedGuides.length > 0 ? (
              <ul className="mt-4 space-y-1 text-sm text-stone-700">
                {selectedGuides.map((guide) => (
                  <li key={guide.id}>{guide.title}</li>
                ))}
              </ul>
            ) : null}
            <dl className="mt-4 space-y-2 text-sm text-stone-700">
              <div className="flex items-center justify-between gap-3">
                <dt>Guides</dt>
                <dd>{guideCount}</dd>
              </div>
              {completeSetSelected ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Individual total</dt>
                    <dd>{formatPrice(completeSetIndividualPrice)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Bundle saving</dt>
                    <dd>{formatPrice(bundleDiscount)}</dd>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(individualTotal)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2 text-base font-semibold text-stone-950">
                <dt>Total</dt>
                <dd>{formatPrice(total)}</dd>
              </div>
            </dl>

            <label className="mt-6 block text-sm font-semibold text-stone-950" htmlFor="customer-email">
              Email address
            </label>
            <p className="mt-1 text-sm text-stone-700">
              Your receipt and download link will be sent here.
            </p>
            <input
              aria-describedby={emailError ? "email-help email-error" : "email-help"}
              aria-invalid={emailError ? true : undefined}
              autoComplete="email"
              className="mt-3 min-h-11 w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-base text-stone-950 outline-none transition-colors duration-200 placeholder:text-stone-500 focus:border-stone-950 focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
              id="customer-email"
              name="email"
              disabled={isCreatingCheckout}
              onBlur={() => setEmailTouched(true)}
              onChange={(event) => {
                setEmail(event.target.value);
                setFormError("");
              }}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
            <span id="email-help" className="sr-only">
              Enter the email address where you want to receive your receipt and download link.
            </span>
            {emailError ? (
              <p className="mt-2 text-sm text-red-800" id="email-error">
                {emailError}
              </p>
            ) : null}

            <button
              className="mt-6 min-h-11 w-full rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-colors duration-200 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={!canContinue}
              type="submit"
            >
              {isCreatingCheckout ? "Starting secure payment" : "Pay securely"}
            </button>
            {!canContinue ? (
              <p className="mt-2 text-sm text-stone-700">
                {guideCount === 0
                  ? "Select at least one guide to continue."
                  : "Enter a valid email address to continue."}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-stone-700">
              Secure card payment is handled by Paystack. Your download link is sent after payment confirmation.
            </p>
            <p className="mt-2 text-sm text-stone-700">
              Need help with delivery or access? Read our <Link className="underline underline-offset-4" href="/delivery">delivery policy</Link> and <Link className="underline underline-offset-4" href="/refunds">refund policy</Link>.
            </p>
            {statusMessage ? (
              <p aria-live="polite" className="mt-3 text-sm text-stone-800">
                {statusMessage}
              </p>
            ) : null}
          </aside>
        </form>
      </div>
    </section>
  );
}

type CheckoutError = { code: string; message: string; requestId?: string };

type CheckoutResponse =
  | { authorizationUrl: string }
  | { error: CheckoutError };

function createIdempotencyKey() {
  if (typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
