"use client";

import { useState } from "react";

type ResendState = "idle" | "submitting" | "submitted";

export function AccessResendForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ResendState>("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter the email address you used at checkout.");
      return;
    }

    setError(null);
    setState("submitting");

    try {
      await fetch("/api/access/resend", {
        body: JSON.stringify({ email: normalizedEmail }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } finally {
      // The endpoint is intentionally neutral, including during a transient
      // provider failure, so this state cannot reveal whether an address has
      // an eligible order.
      setState("submitted");
    }
  }

  return (
    <section aria-labelledby="resend-access-heading" className="mt-8 rounded-lg border border-stone-300 bg-stone-50 p-5 sm:p-6">
      <h2 id="resend-access-heading" className="text-xl font-semibold tracking-tight text-stone-950">
        Need another access email?
      </h2>
      {state === "submitted" ? (
        <p className="mt-3 text-pretty text-base text-stone-700" role="status">
          If an eligible purchase uses that email address, we will send an access link shortly.
        </p>
      ) : (
        <form className="mt-4" noValidate onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-semibold text-stone-950" htmlFor="access-resend-email">
            Checkout email address
          </label>
          <input
            autoComplete="email"
            className="mt-2 min-h-11 w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-base text-stone-950 focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
            id="access-resend-email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
          {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
          <button
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-stone-950 px-3 py-2 text-base font-semibold text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-stone-800 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-stone-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-500"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Requesting access" : "Email my access link"}
          </button>
        </form>
      )}
    </section>
  );
}
