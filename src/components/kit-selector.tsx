"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { COMPLETE_SET, formatPrice, type Bundle, type Guide } from "@/lib/catalog";

const DRAFT_STORAGE_KEY = "home-kit-selection";

type KitSelectorProps = { completeSet?: Bundle; guides: readonly Guide[] };
type StoredDraft = { email?: string; productIds?: string[] };
type CheckoutError = { code: string; message: string; requestId?: string };
type CheckoutResponse = { authorizationUrl: string } | { error: CheckoutError };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readStoredDraft(): StoredDraft | null {
  const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) return null;
  try {
    return JSON.parse(rawDraft) as StoredDraft;
  } catch {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function formatCheckoutError(error: CheckoutError) {
  return error.requestId
    ? `${error.message} If it keeps happening, contact support and include reference ${error.requestId}.`
    : error.message;
}

function GuideArtwork({ guide, size = "card" }: { guide: Guide; size?: "card" | "list" }) {
  return <span aria-hidden="true" className={`guide-artwork guide-artwork-${size}`}><Image alt="" height={80} src={`/guide-covers/${guide.slug}.png`} width={52} /></span>;
}

function CheckIcon() {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 16 16"><path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 20 20"><path d="M3 10h13M11 4.5l5.5 5.5-5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
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
  const [isCheckoutSheetOpen, setIsCheckoutSheetOpen] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const mobileEmailRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const allowedProductIds = useMemo(() => new Set([...guides.map((guide) => guide.id), completeSet.id]), [completeSet.id, guides]);
  const completeSetRequested = (searchParams?.get("selection") ?? (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("selection"))) === "complete";
  const completeSetSelected = selectedProductIds.includes(completeSet.id);
  const selectedGuides = guides.filter((guide) => selectedProductIds.includes(guide.id));
  const individualTotal = selectedGuides.reduce((total, guide) => total + guide.priceInCents, 0);
  const completeSetIndividualPrice = guides.reduce((sum, guide) => sum + guide.priceInCents, 0);
  const bundleDiscount = completeSetIndividualPrice - completeSet.priceInCents;
  const total = completeSetSelected ? completeSet.priceInCents : individualTotal;
  const guideCount = completeSetSelected ? guides.length : selectedGuides.length;
  const emailError = emailTouched && !isValidEmail(email) ? "Enter a valid email address." : "";
  const canOpenCheckout = guideCount > 0 && !isCreatingCheckout;
  const canPay = canOpenCheckout && isValidEmail(email);
  const selectionSummary = completeSetSelected
    ? `${completeSet.title} selected. All ${guides.length} guides are included.`
    : selectedGuides.length === 0 ? "No guides selected." : `${selectedGuides.length} guide${selectedGuides.length === 1 ? "" : "s"} selected.`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const draft = readStoredDraft();
      if (completeSetRequested) {
        setSelectedProductIds([completeSet.id]);
        setStatusMessage(`The complete set includes all ${guides.length} guides.`);
      } else if (draft) {
        const ids = (draft.productIds ?? []).filter((id) => allowedProductIds.has(id));
        setSelectedProductIds(ids.includes(completeSet.id) ? [completeSet.id] : ids);
        setEmail(draft.email ?? "");
      }
      setHasRestoredDraft(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [allowedProductIds, completeSet.id, completeSetRequested, guides.length]);

  useEffect(() => {
    if (hasRestoredDraft) window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ email, productIds: selectedProductIds }));
  }, [email, hasRestoredDraft, selectedProductIds]);

  useEffect(() => {
    if (!isCheckoutSheetOpen) return;
    const frame = window.requestAnimationFrame(() => mobileEmailRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isCreatingCheckout) setIsCheckoutSheetOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCheckoutSheetOpen, isCreatingCheckout]);

  function toggleGuide(guideId: string) {
    if (isCreatingCheckout) return;
    setStatusMessage("");
    setFormError("");
    if (completeSetSelected) {
      setSelectedProductIds([guideId]);
      setStatusMessage("The complete set was replaced with your individual guide selection.");
      return;
    }
    setSelectedProductIds((currentIds) => currentIds.includes(guideId) ? currentIds.filter((id) => id !== guideId) : [...currentIds, guideId]);
  }

  function toggleCompleteSet() {
    if (isCreatingCheckout) return;
    setFormError("");
    setSelectedProductIds((currentIds) => {
      const nextSelection = currentIds.includes(completeSet.id) ? [] : [completeSet.id];
      setStatusMessage(nextSelection.length > 0 ? `The complete set includes all ${guides.length} guides.` : "The complete set was removed.");
      return nextSelection;
    });
  }

  function openCheckoutSheet() {
    if (!canOpenCheckout) return;
    setFormError("");
    setIsCheckoutSheetOpen(true);
  }

  function updateEmail(value: string) {
    setEmail(value);
    setFormError("");
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
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as CheckoutResponse | null;
      if (!response.ok || !result || !("authorizationUrl" in result)) {
        idempotencyKeyRef.current = null;
        setFormError(result && "error" in result ? formatCheckoutError(result.error) : "We could not start your payment. Please try again.");
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

  const emailField = (id: string, inputRef?: React.RefObject<HTMLInputElement | null>) => {
    const helpId = id === "customer-email" ? "email-help" : `${id}-help`;
    const errorId = id === "customer-email" ? "email-error" : `${id}-error`;

    return (
      <>
      <label className="checkout-email-label" htmlFor={id}>Email address</label>
      <p className="checkout-email-copy">Your receipt and download link will be sent here.</p>
      <input aria-describedby={emailError ? `${helpId} ${errorId}` : helpId} aria-invalid={emailError ? true : undefined} autoComplete="email" className="checkout-email-input" disabled={isCreatingCheckout} id={id} name="email" onBlur={() => setEmailTouched(true)} onChange={(event) => updateEmail(event.target.value)} placeholder="name@example.com" ref={inputRef} type="email" value={email} />
      <span className="sr-only" id={helpId}>Enter the email address where you want to receive your receipt and download link.</span>
      {emailError ? <p className="checkout-email-error" id={errorId}>{emailError}</p> : null}
    </>
  );
  };

  return (
    <section aria-labelledby="kit-selector-heading" className="kit-selector">
      <div className="kit-selector-shell">
        <div className="kit-selector-intro"><h2 id="kit-selector-heading">Choose your homeowner guides</h2><p>Keep every homeowner task in one place, or pick the guides that fit your needs.</p></div>
        <form aria-busy={isCreatingCheckout} className="kit-selector-form" onSubmit={handleSubmit}>
          {formError && !isCheckoutSheetOpen ? <CheckoutErrorMessage error={formError} errorRef={errorSummaryRef} /> : null}
          <fieldset className="kit-selector-options">
            <legend className="sr-only">Choose your guides</legend>
            <label className={`bundle-option ${completeSetSelected ? "is-selected" : ""}`}>
              <input checked={completeSetSelected} disabled={isCreatingCheckout} name="complete-set" onChange={toggleCompleteSet} type="checkbox" />
              <span className="bundle-check" aria-hidden="true"><CheckIcon /></span>
              <span className="bundle-artwork" aria-hidden="true">{guides.slice(0, 3).map((guide, index) => <Image alt="" className={`bundle-book bundle-book-${index + 1}`} height={106} key={guide.id} src={`/guide-covers/${guide.slug}.png`} width={70} />)}<span className="bundle-saving">Save {formatPrice(bundleDiscount)}</span></span>
              <span className="bundle-copy"><span className="best-value">Best value</span><span className="bundle-title">{completeSet.title}</span><span className="bundle-description">{completeSet.description}</span><span className="bundle-benefits"><span><CheckIcon />{guides.length} comprehensive guides</span><span><CheckIcon />Editable PDF and workbook files</span><span><CheckIcon />Everything you need in one place</span></span></span>
              <span className="bundle-price"><span>{formatPrice(completeSet.priceInCents)}</span><del>{formatPrice(completeSetIndividualPrice)}</del></span>
            </label>
            <div className="guide-divider"><span>Or pick individual guides</span></div>
            <div className="guide-section-heading"><div><h3>Select individual guides</h3><p>Choose the guides that fit your needs.</p></div><button disabled={isCreatingCheckout} onClick={() => setSelectedProductIds(guides.map((guide) => guide.id))} type="button">Select all</button></div>
            <div className="guide-options-grid">{guides.map((guide) => {
              const checked = selectedProductIds.includes(guide.id);
              return <label className={`guide-option ${checked ? "is-selected" : ""}`} key={guide.id}><input checked={checked} disabled={isCreatingCheckout} name="guides" onChange={() => toggleGuide(guide.id)} type="checkbox" /><span className="guide-check" aria-hidden="true"><CheckIcon /></span><GuideArtwork guide={guide} /><span className="guide-option-copy"><span className="guide-option-title">{guide.title}</span><span className="guide-option-description">{guide.description}</span><span className="guide-files">PDF <b>+</b> Editable workbook</span></span><span className="guide-option-price">{formatPrice(guide.priceInCents)}</span></label>;
            })}</div>
          </fieldset>
          <aside className="selection-panel">
            <h3>Your selection</h3><p aria-live="polite" className="selection-summary">{selectionSummary}</p>
            {completeSetSelected ? <ul className="selection-list">{guides.map((guide) => <li key={guide.id}><GuideArtwork guide={guide} size="list" /><span>{guide.title}</span></li>)}</ul> : selectedGuides.length > 0 ? <ul className="selection-list">{selectedGuides.map((guide) => <li key={guide.id}><GuideArtwork guide={guide} size="list" /><span>{guide.title}</span></li>)}</ul> : null}
            <dl className="selection-totals"><div><dt>Guides</dt><dd>{guideCount}</dd></div>{completeSetSelected ? <><div><dt>Individual total</dt><dd>{formatPrice(completeSetIndividualPrice)}</dd></div><div><dt>Bundle saving</dt><dd>{formatPrice(bundleDiscount)}</dd></div></> : <div><dt>Subtotal</dt><dd>{formatPrice(individualTotal)}</dd></div>}<div className="selection-total"><dt>Total</dt><dd>{formatPrice(total)}</dd></div></dl>
            <div className="desktop-checkout">{emailField("customer-email")}<button className="pay-button" disabled={!canPay} type="submit">{isCreatingCheckout ? "Starting secure payment" : "Pay securely"}</button><CheckoutNotes /></div>
            {statusMessage ? <p aria-live="polite" className="selection-status">{statusMessage}</p> : null}
          </aside>
          <div className="mobile-checkout-bar" aria-live="polite"><span><strong>{guideCount} guide{guideCount === 1 ? "" : "s"} selected</strong><b>{formatPrice(total)} total</b></span><button disabled={!canOpenCheckout} onClick={openCheckoutSheet} type="button">Continue to checkout <ArrowIcon /></button></div>
          {isCheckoutSheetOpen ? <div className="checkout-sheet-layer"><button aria-label="Close checkout" className="checkout-sheet-scrim" disabled={isCreatingCheckout} onClick={() => setIsCheckoutSheetOpen(false)} type="button" /><section aria-labelledby="checkout-sheet-heading" aria-modal="true" className="checkout-sheet" role="dialog"><div className="checkout-sheet-handle" /><div className="checkout-sheet-heading"><div><p>{guideCount} guide{guideCount === 1 ? "" : "s"} selected · {formatPrice(total)}</p><h3 id="checkout-sheet-heading">Where should we send your guides?</h3></div><button aria-label="Close checkout" disabled={isCreatingCheckout} onClick={() => setIsCheckoutSheetOpen(false)} type="button"><CloseIcon /></button></div>{formError ? <CheckoutErrorMessage error={formError} errorRef={errorSummaryRef} /> : null}<div className="checkout-sheet-form">{emailField("customer-email-mobile", mobileEmailRef)}<button className="pay-button" disabled={!canPay} type="submit">{isCreatingCheckout ? "Starting secure payment" : "Pay securely"}</button><CheckoutNotes /></div></section></div> : null}
        </form>
      </div>
    </section>
  );
}

function CheckoutErrorMessage({ error, errorRef }: { error: string; errorRef: React.RefObject<HTMLDivElement | null> }) {
  return <div aria-labelledby="selection-error-heading" className="checkout-error" ref={errorRef} role="alert" tabIndex={-1}><h3 id="selection-error-heading">Secure checkout could not start.</h3><p>{error}</p></div>;
}

function CheckoutNotes() {
  return <><p className="secure-payment-note">Secure card payment is handled by Paystack. Your download link is sent after payment confirmation.</p><p className="checkout-policy-note">Need help? Read our <Link href="/delivery">delivery policy</Link> and <Link href="/refunds">refund policy</Link>.</p></>;
}

function createIdempotencyKey() {
  if (typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
