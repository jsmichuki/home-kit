# Paystack kit implementation checklist

Use this checklist alongside [the checkout and delivery plan](./paystack-kit-checkout-plan.md). Check an item only after it has been implemented and tested in the relevant environment.

## 1. Product catalogue and offer

- [x] Finalize every guide's stable UUID, slug, title, short description, long description, and active status.
- [x] Prepare the current approved file version for each guide.
- [x] Record each individual guide price in the supported currency and its smallest currency unit.
- [x] Resolve only currently effective server-side catalogue prices; future prices cannot appear early.
- [x] Create the complete set bundle SKU.
- [x] Define exactly which guides and versions the complete set includes.
- [x] Add regression coverage for guide identity, active status, included formats, complete-set contents, and approved prices.
- [x] Set the complete set price, normal combined price, and displayed saving.
- [x] Establish the catalogue versioning convention used in orders and Paystack metadata.
- [x] Choose and document the default download access duration, initially 30 days.
- [x] Publish clearly labelled draft delivery, refund, privacy, terms, and support pages for prelaunch review.
- [ ] Finalize the delivery, refund, privacy, terms, and support policies with qualified counsel before live payment.
- [x] Identify the support email address and expected support response process.

## 2. Landing page and kit selector

- [ ] State the practical homeowner outcome in the hero and make `Pay securely` the primary action.
- [x] Add a kit card for every active guide.
- [x] Include title, concise outcome, file format, price, and a visible checkbox label on every kit card.
- [x] Ensure checkbox controls have a minimum 44 px target area.
- [x] Add an accessible, visually distinct complete set card.
- [x] Display complete set price, normal combined price, saving, and number of included guides.
- [x] Start with no selection and a disabled payment button explaining how to continue.
- [x] Make complete set selection replace individual guide selections.
- [x] Make selecting an individual guide after the complete set return to individual pricing.
- [x] Announce selection changes accessibly and explain why the selection changed.
- [x] Show a live order summary with selected titles, count, subtotal, bundle discount, and total.
- [x] Keep the order summary and payment action available on small screens without obscuring content.
- [x] Add an email field with a persistent visible label and helper text explaining delivery.
- [x] Validate email format, required selection, and checkout state inline before payment initiation.
- [ ] Show specific loading, success, error, and disabled states for every interactive element.
- [ ] Prevent repeated payment requests while checkout creation is in progress.
- [x] Retain selection and email in browser storage until payment begins.
- [x] Add automated selector coverage for disabled state, selection totals, bundle replacement, email validation, draft restore, and pre-payment feedback.
- [x] Run a mobile Lighthouse accessibility audit with no failed audits and add keyboard-selection regression coverage.
- [x] Respect visitors' reduced-motion preference for selector and page transitions.
- [ ] Clear retained checkout data after successful fulfillment.
- [x] Add guide previews or sample pages where available.
- [x] Add a `choose, pay, download` explanation, FAQs, and links to delivery, refund, privacy, and support information.
- [ ] Add payment reassurance and a final payment action when checkout creation is implemented.
- [x] Add footer links to legal policies and support.
- [x] Add a usable custom 404, page title, meta description, social metadata, and favicon.
- [ ] Test at phone, tablet, laptop, and wide desktop widths.
- [ ] Test keyboard-only interaction, focus visibility, semantic checkbox behaviour, screen reader labels, and contrast.

## 3. Supabase foundation and database schema

- [x] Create and secure the single production Supabase project; do not create a staging project.
- [x] Document all required server environment variables without committing secret values.
- [ ] Store production deployment secrets separately from local development values.
- [x] Reject partial Supabase server configuration instead of silently serving the local catalogue fallback.
- [x] Add the Supabase CLI and a versioned migration workflow to the repository.
- [x] Create an unexposed `commerce` schema, or otherwise isolate commerce tables from public Data API access.
- [x] Create `guides` table with stable UUIDs, active status, version, and private storage key.
- [x] Create `catalogue_prices` table with currency, amount in subunits, active range, and catalogue version.
- [x] Create `orders` table with public ID, buyer email, item and entitlement snapshots, totals, currency, status, and Paystack reference.
- [x] Create `payments` table with Paystack verification evidence and transaction reference.
- [x] Create `access_grants` table with token hash, entitled guide versions, lifecycle timestamps, and revocation state.
- [x] Create `webhook_events` table for provider event idempotency and processing history.
- [x] Create `fulfillment_outbox` table for durable post-payment work.
- [x] Create `email_deliveries` table with Resend email ID, idempotency key, send state, attempts, and error details.
- [x] Create `resend_events` table for delivery event history.
- [x] Create `download_events` table with minimal support and security audit data.
- [x] Add a unique constraint for every Paystack transaction reference.
- [x] Add a unique constraint for each webhook provider event identity or payload hash.
- [x] Add a unique constraint for access token hashes.
- [x] Add a unique constraint for each order and fulfillment job type pair.
- [x] Add a unique constraint for each Resend idempotency key and Resend event identity.
- [x] Index Paystack reference, public order ID, access token hash, queue state and availability time, and Resend email ID.
- [x] Snapshot the purchased items, guide versions, price, amount, currency, and catalogue version at order creation.
- [x] Add database checks or enum constraints for valid order, payment, grant, outbox, and email states.
- [ ] Test migrations locally against a Supabase CLI database before applying them to production.
- [x] Confirm rollback or forward-fix procedures for every migration.
- [x] Run a read-only schema lint against the linked production project.

## 4. Supabase security and private file storage

- [x] Create the private Supabase Storage bucket named `paid-guides`.
- [x] Upload paid guide files only to the private bucket, never to `public/`.
- [x] Store the expected object key, file type, file size, and guide version in the catalogue.
- [x] Constrain guide asset metadata to the private `guides/` path convention and supported delivery media types.
- [x] Enforce no more than one open-ended current price for a SKU and currency.
- [x] Enable RLS on every table exposed through the Supabase Data API.
- [x] Revoke `anon` and `authenticated` access to private commerce data unless an explicitly tested policy requires it.
- [x] Confirm browser clients cannot list or read orders, payments, email addresses, access grants, token hashes, or paid storage object paths.
- [x] Use the Supabase secret key only in trusted server routes and workers.
- [ ] Ensure the Supabase secret key never reaches browser code, source control, logs, analytics, or error messages.
- [x] Write allow and deny tests for each policy and role that remains exposed.
- [x] Run the deployed RLS, role, and catalogue-invariant assertion suite against the linked production project (18 assertions).
- [ ] Generate Supabase Storage signed URLs only after entitlement validation.
- [x] Limit each signed URL to a single file and a short expiry.
- [x] Set safe download file names and `Content-Disposition` headers.
- [x] Verify every current paid guide object rejects the public Storage endpoint.
- [ ] Test direct object URLs, guessed paths, expired signed URLs, and unauthorized bucket access.

## 5. Checkout creation and Paystack redirect

- [x] Implement `POST /api/checkout`.
- [x] Accept only an email address and guide or bundle product IDs from the browser.
- [x] Validate email format and normalize it for reliable lookup without changing the address used for delivery.
- [x] Validate every requested product ID against the active server catalogue.
- [x] Resolve bundle and individual selections server side.
- [x] Reject invalid combinations such as the complete set plus individual guides.
- [x] Calculate the complete authoritative amount, currency, discount, and entitlement list on the server.
- [x] Create the pending order and its immutable purchase snapshot before contacting Paystack.
- [x] Generate a unique Paystack reference tied to the pending order.
- [x] Initialize Paystack from the server with the secret key.
- [x] Set Paystack `channels` to card only.
- [x] Submit amount in the correct currency subunit.
- [x] Include the buyer email, callback URL, reference, and minimal internal metadata.
- [x] Store the Paystack authorization URL and reference on the order.
- [x] Redirect only to the authorization URL returned by Paystack.
- [x] Do not expose any Paystack secret key to the client.
- [x] Rate limit checkout creation and make duplicate clicks safe.
- [x] Retain customer selection after a recoverable initialization failure.
- [x] Test invalid email, no selection, inactive product, altered client price, repeat click, Paystack initialization error, and card-only channel configuration.

## 6. Payment confirmation page

- [x] Add `/payment/confirmation?reference=...`.
- [x] Treat arrival at the callback URL as pending, never as evidence of a successful payment.
- [x] Show a calm `We are confirming your payment` progress state.
- [x] Poll a server owned status endpoint using the transaction reference for a short, capped period.
- [x] Return only safe, minimal status information from `GET /api/orders/by-reference/[reference]`.
- [ ] Show the fulfilled state with purchased guide count, masked email, download action, and email delivery note. The secure action waits for Section 10.
- [x] Show a reassuring pending timeout state with support and home paths.
- [x] Show failure, abandonment, and cancellation states without revealing downloads.
- [x] Provide a retry path that creates a new payment transaction instead of reusing an uncertain payment attempt.
- [x] Show a generic help state for unknown references without revealing order data.
- [x] Prevent a reference alone from granting access to order details or files.
- [x] Test successful webhook arrival before callback, after callback, delayed webhook, page refresh, browser close, unknown reference, and failed payment.

## 7. Paystack webhook verification and fulfillment

- [ ] Use a temporary HTTPS tunnel to expose local callback and Paystack test webhook endpoints during development.
- [ ] Configure the production Paystack webhook only when live payments are ready to launch.
- [x] Implement `POST /api/webhooks/paystack` with raw body access.
- [x] Validate `x-paystack-signature` using HMAC SHA512 and a timing safe comparison.
- [x] Reject missing or invalid signatures.
- [x] Accept only the relevant successful charge event.
- [x] Return an HTTP 200 acknowledgement quickly after valid intake.
- [x] Record webhook identity before or within fulfillment processing to make duplicate events safe.
- [x] Find the pending order by the event reference.
- [x] Call Paystack's server side transaction verification endpoint before delivery.
- [x] Require verified status `success`.
- [x] Require matching Paystack reference, amount, currency, expected metadata, and buyer email where available.
- [x] Record verification evidence and payment status in one database transaction.
- [x] Create an access grant and cryptographically secure token in that transaction.
- [x] Store only the token hash, never the plaintext token.
- [x] Resolve and snapshot exactly the guide versions entitled by the order.
- [x] Mark the order fulfilled only once all fulfillment records are committed.
- [x] Insert a unique delivery job in `fulfillment_outbox` within the same transaction.
- [x] Make repeated events, concurrent workers, and confirmation page retries no ops after initial fulfillment.
- [x] Log non-sensitive failure categories for invalid signatures, unknown references, verification failures, amount mismatches, and currency mismatches.
- [ ] Configure an external alert destination for webhook failures before live payment.
- [x] Test duplicate events, invalid signature, altered body, unknown reference, mismatched amount, mismatch currency, failed verification, and webhook retry behaviour.

## 8. Fulfillment outbox, queue, and recovery

- [x] Define outbox job types and their state transitions.
- [x] Add a unique job key for delivery email work per order and grant version. Each order currently has one immutable grant.
- [x] Implement atomic worker claiming to prevent concurrent job processing.
- [x] Record attempt count, claim time, available time, completion time, and last error.
- [x] Add exponential backoff for recoverable delivery failures.
- [ ] Define an external alert path for exhausted retries before enabling delivery email.
- [x] Keep the Postgres outbox as the durable recovery source; no `pgmq` trigger is required before the Resend worker exists.
- [x] Schedule Supabase Cron to locate stalled or pending outbox jobs.
- [x] Make recovery processing safe to run repeatedly.
- [x] Test atomic claiming, provider failure retry, exhausted retry, and stalled-worker recovery.
- [ ] Test a real Resend outage and worker interruption after the Section 9 delivery worker is enabled.

## 9. Resend transactional email and event tracking

- [ ] Create and verify the Resend sending domain and all required DNS records.
- [ ] Store `RESEND_API_KEY` and `RESEND_FROM_EMAIL` only in server side deployment configuration.
- [x] Configure a named sender such as `Home Kit <home-kit@astralrefine.com>`.
- [x] Build a responsive HTML delivery email and plain text alternative.
- [x] Include purchased guide summary, total, currency, receipt or transaction reference, access button, fallback URL, expiry, and support contact.
- [x] Avoid using the delivery email as marketing consent.
- [x] Use a deterministic initial Resend idempotency key such as `delivery/<order-id>/<grant-version>`.
- [x] Record the idempotency key, Resend email ID, provider response, attempt count, and send time in `email_deliveries`.
- [x] Reuse the same idempotency key for uncertain or immediate retry attempts.
- [x] Use a newly recorded retry key only when the original key has expired and database state supports a new attempt.
- [x] Configure `POST /api/webhooks/resend`.
- [x] Verify Resend webhook signatures before writing delivery events.
- [x] Record Resend `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, and `suppressed` outcomes.
- [x] Make duplicate Resend events safe through the provider event ID constraint.
- [ ] Raise a support alert for permanent delivery failures without revoking valid download access.
- [ ] Test the email in major clients and on mobile.
- [ ] Test a successful send, uncertain API response, duplicate send request, delayed event, bounce, complaint, suppression, failed event, and webhook replay.

## 10. Secure access links and download experience

- [x] Generate opaque, cryptographically secure access tokens for each fulfilled order.
- [x] Store only access token hashes in Supabase Postgres.
- [x] Set issuance, expiry, revocation, and last access timestamps on each grant.
- [x] Implement `/downloads/<opaque-token>`.
- [x] Lookup and validate the token hash, order fulfillment status, grant activity, and expiry on the server.
- [x] Use a generic safe failure response for invalid or guessed links.
- [x] Show only the guides and versions purchased by the validated order.
- [x] Include title, concise description, format, size, and a dedicated download action for each guide.
- [ ] Offer `Download all` only if the combined archive is built, complete, and tested.
- [x] Create the file's short lived Supabase Storage signed URL after each permitted download request.
- [x] Record minimal download events without logging the full opaque access token.
- [x] Add expiry, resend, support, and main site paths to the download page.
- [x] Implement a friendly expired or revoked link state with a recovery path.
- [x] Implement `POST /api/access/resend`.
- [x] Always return a neutral response from the resend request form to avoid account enumeration.
- [x] Send only to fulfilled orders and rate limit requests by email, IP, and time window.
- [x] Reuse an active grant for self service resend, or rotate and revoke access only through a deliberate support action.
- [ ] Provide an internal, access controlled support process to find orders, resend delivery, and revoke a compromised grant.
- [x] Test valid link, multiple guides, guessed link, expired link, revoked link, missing entitlement, repeated downloads, direct file URL, self service resend, and rate limit behaviour.

## 11. Observability, privacy, and operations

- [x] Ensure no card data is stored or logged.
- [x] Store only the buyer data needed for receipt, delivery, support, and legal obligations.
- [x] Redact opaque access tokens, payment secrets, email provider keys, and full sensitive payloads from logs and analytics.
- [ ] Monitor Paystack webhook receipt, verification failures, and retry health.
- [ ] Monitor outbox backlog, worker failures, and stalled jobs.
- [ ] Monitor Resend sends, bounces, complaints, suppressions, and delivery failures.
- [ ] Monitor signed URL failures, invalid token lookups, and download errors.
- [ ] Alert for payment amount or currency mismatches and repeated invalid webhook signatures.
- [x] Document incident response for a payment issue, email outage, leaked access link, and compromised secret.
- [x] Add a tested server only redaction helper and dependency free tracked-file secret scan.
- [x] Document alert signals, retention proposals, secret rotation, and production ownership in the operations runbook.

## 12. End to end QA and launch

- [ ] Use Paystack test cards to complete the full purchase flow.
- [ ] Confirm the callback page alone cannot fulfill an order.
- [ ] Confirm a verified Paystack webhook creates exactly one payment, fulfillment, access grant, and delivery job.
- [ ] Confirm the confirmation page becomes ready after fulfillment and before email delivery if necessary.
- [ ] Confirm the Resend email contains the expected purchased guide list and working access link.
- [ ] Confirm a valid download link grants only the purchased files.
- [ ] Confirm paid files are not publicly reachable from the repository, application, or Supabase Storage.
- [ ] Test desktop and mobile checkout under slow or interrupted network conditions.
- [ ] Complete keyboard, screen reader, focus, contrast, and responsive QA.
- [ ] Complete cross browser QA for supported browser versions.
- [ ] Test every negative and recovery scenario listed in the feature sections above.
- [ ] Review database constraints, indexes, RLS, secrets, and webhook validation with a second engineer before launch.
- [ ] Validate end to end locally with Paystack test mode, a temporary HTTPS callback and webhook tunnel, test buyer emails, test guide assets, and the local worker path.
- [ ] Configure production domains, TLS, Paystack live keys, Paystack webhook URL, Resend production domain, Supabase production secrets, and monitoring alerts.
- [ ] Make a small real production purchase and verify payment, fulfillment, receipt, email status, access link, signed download, audit records, and support lookup.
- [ ] Record launch date, deployed version, and responsible contact for operational handoff.
