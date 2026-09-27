# Paystack kit checkout and delivery plan

## Objective

Let a visitor select one or more homeowner guides, pay by card through Paystack, and receive a safe, personal link to download exactly the guides they purchased.

The system must treat Paystack's webhook as the source of truth for fulfillment. A customer returning from Paystack is shown a confirmation screen, but no download access is granted until the server has verified and recorded the successful payment.

## Decisions and defaults

| Area | Decision |
| --- | --- |
| Checkout format | A focused, single page kit selector followed by Paystack's hosted checkout redirect. This keeps card handling outside the application and makes the path work well on mobile. |
| Payment method | Initialize Paystack with `channels: ["card"]`. Keep this configuration server side so other methods can be added later without changing the UI. |
| Pricing | The catalogue, prices, currency, bundle discount, and product identifiers live on the server. The browser sends product IDs only; it never submits or calculates an authoritative total. |
| Complete set | The complete set is a bundle SKU that resolves to every included guide. It cannot be purchased alongside individual kits. Choosing an individual kit removes the bundle; choosing the bundle replaces individual selections. |
| Fulfillment | A verified `charge.success` webhook creates one access grant per paid order, containing the resolved guide list. Webhook processing is idempotent. |
| Download link | Send one opaque, high entropy link for an order. It shows only the order's entitled guides and is valid for 30 days by default. A self service email based resend flow can issue a replacement link without exposing an account system. |
| Database | Supabase Postgres is the authoritative data store for the catalogue, orders, payment evidence, access grants, email history, and fulfillment outbox. Use SQL migrations as the only way to change this schema. |
| Files | Store the actual PDF or ZIP files in a private Supabase Storage bucket. Generate short lived signed URLs only after the access token has been checked. Do not place paid files under `public/`. |
| Email | Use Resend for transactional delivery from a verified sending domain. Send the delivery email with a Resend idempotency key and record the returned Resend email ID. |

The 30 day access window is a deliberate UX balance: it gives a buyer plenty of time while limiting a forwarded link's usefulness. Make the duration configurable and document it in the purchase terms.

## Customer journey

```text
Landing page → select guides or complete set → enter email and review total
→ Pay securely → hosted Paystack card checkout → return to confirmation screen
→ webhook verifies and fulfills payment → confirmation updates to "Your guides are ready"
→ delivery email → personal download page → signed download(s)
```

### 1. Landing page and kit selection

Use a minimal conversion page. Its one primary action is `Pay securely`. The hero should state the practical outcome for a new homeowner, then take the visitor directly into the selector rather than making them navigate a shop.

The selector should include:

- A clearly labelled card for every guide: title, a one sentence outcome, included format, price, and a 44 px or larger checkbox target.
- A visually distinct `Complete new homeowner set` card marked as the best value. Show the set price, the normal combined price, the saving, and the number of guides included.
- A live summary that says how many guides are selected, lists the selected titles, shows subtotal, discount, and total, and keeps the `Pay securely` button visible on mobile and desktop.
- An email field with a persistent visible label, plain helper copy saying that the receipt and download link go there, and inline validation before payment starts.
- A short reassurance below the call to action: card payment is handled securely by Paystack, a receipt and download link arrive by email, and no account is required.

Interaction details:

- Start with no kit selected and a disabled payment button that explains `Select at least one guide to continue`.
- Selecting the complete set replaces individual selections after an immediate, non modal status message: `The complete set includes every guide.` Selecting an individual guide after that switches back to individual pricing and explains why.
- Never make a visitor infer a discount. Always show the before and after totals when the bundle is active.
- Preserve the selection and email in local browser storage only until payment begins, so an accidental refresh does not lose work. Clear it once the order is fulfilled.
- Use normal labels, visible keyboard focus, semantic checkboxes, sufficient contrast, and clear loading, error, and disabled states. Avoid relying on colour alone to communicate selection or errors.

The rest of the landing page should answer the buying questions without competing calls to action: what each guide helps with, a three step `choose, pay, download` explanation, a preview or sample page for each guide, payment and delivery reassurance, FAQ, refund policy, and a final repetition of `Pay securely`.

### 2. Payment initiation

1. The customer presses `Pay securely`.
2. The client sends `{ email, productIds }` to `POST /api/checkout`.
3. The server validates the email and product IDs, derives the canonical line items and amount from the catalogue, creates an order in `payment_pending`, and creates a unique Paystack reference such as `order_<public-order-id>_<random>`.
4. The server initializes the Paystack transaction using its secret key, the order total in the currency subunit, customer email, `channels: ["card"]`, `callback_url`, and limited metadata containing the internal order ID and a catalogue version.
5. Store the Paystack reference, the amount and currency snapshot, and the authorization URL. Redirect the browser to that URL.

The client must never receive a Paystack secret key or choose the amount. Add a brief button loading state, prevent duplicate submits, and recover gracefully if initialization fails: retain the selection and show an inline `We could not start your payment. Please try again.` message.

### 3. Return and confirmation experience

Paystack returns the customer to `/payment/confirmation?reference=...`. That page is not proof of payment.

On arrival, display `We are confirming your payment` with a short explanation that delivery begins as soon as confirmation completes. The page calls `GET /api/orders/by-reference/:reference` every few seconds for a short, capped period:

- `fulfilled`: show a calm success state with the purchased guide count, email address masked except for the domain, an `Open my downloads` button, and a note that the email is on its way.
- `payment_pending`: keep the reassuring progress state. If the poll window ends, explain that confirmation can take a moment and that the email link will arrive automatically; provide a back to home link and support contact.
- `failed`, `abandoned`, or `cancelled`: explain that no payment was completed, retain an order specific retry button that makes a new Paystack transaction, and do not show downloads.
- unknown reference: show a safe generic help screen; do not reveal order details.

Do not make the customer wait indefinitely for email. Once fulfillment is recorded, the confirmation page should provide the same personal download link immediately. The email is the durable way to return later.

### 4. Webhook confirmation and fulfillment

`POST /api/webhooks/paystack` must:

1. Read the raw request body and validate `x-paystack-signature` with HMAC SHA512 using the Paystack secret key. Reject invalid signatures.
2. Accept the relevant successful charge event only and acknowledge valid receipt quickly with HTTP 200. In Supabase Postgres, write a durable fulfillment outbox record in the same transaction as the order change; a worker processes that outbox rather than making the webhook wait for email delivery.
3. Use the event reference to find the pending order. Call Paystack's server side transaction verification endpoint as a defence in depth check.
4. Require all of the following before fulfillment: verified status is `success`; reference matches; verified amount and currency equal the order snapshot; customer email and metadata match the expected order where available; order has not already been fulfilled.
5. In one database transaction, record the verified payment evidence, change the order to `paid`, create its access grant and secure token, resolve the entitled guide versions, and change the order to `fulfilled`.
6. Enqueue the delivery email with the access URL through Supabase Queues or a worker that drains the Postgres outbox. Record each Resend send attempt, its idempotency key, and the returned Resend email ID; retry transient failures safely.
7. Treat repeated webhook deliveries, a retry from the confirmation page, and parallel workers as no ops after the first successful fulfillment. Never send an additional entitlement or charge a second time.

Log invalid signatures, amount mismatches, unknown references, verification failures, and email failures with the order and Paystack references. Alert the team for any mismatch because it may be fraud or a configuration defect.

### 5. Email delivery

Use Resend with a verified sending domain for transactional email. Send both a payment receipt and access link in one concise delivery email after fulfillment. Keep `RESEND_API_KEY` server side only and send from a named, branded sender such as `Home Kit <guides@yourdomain.com>`.

Email content:

- Subject: `Your New Homeowner guides are ready`
- Plain language confirmation of what was purchased, the total and currency, and the transaction reference or receipt number.
- One primary `Download your guides` button linking to the opaque access URL.
- A plain text fallback URL, link expiry date, and support contact.
- A short safety note: the link is personal; do not forward it.

For the initial delivery, use a stable Resend idempotency key such as `delivery/<order-id>/<access-grant-version>`. Resend retains idempotency keys for 24 hours, while the `email_deliveries` table remains the durable record beyond that period. If the API result is uncertain, retry first with the same key; if the key window has passed, use the database state and a new, recorded retry key to decide whether another attempt is appropriate.

Configure Resend delivery event webhooks and record at least `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, and `suppressed` outcomes against the Resend email ID. Verify Resend webhook signatures before recording events. A permanent failure should raise a support alert, but never remove an already valid access grant.

If email delivery fails, keep the access grant valid, retry according to the delivery policy, and surface the successful confirmation page. Add a `Resend my download link` page that accepts an email address, always returns the same neutral success message, rate limits requests, and sends links only for fulfilled orders. This avoids leaking whether an email has purchased anything. A successful self service resend creates a separately recorded email delivery attempt and may reuse the still active access grant; support can rotate a compromised grant and revoke the old token.

### 6. Download page

Route: `/downloads/<opaque-token>`.

The server looks up a hash of the token, verifies that it is active, unexpired, and associated with a fulfilled order, then renders:

- A simple `Your purchased guides` heading and the buyer's first name if collected.
- One accessible download card per entitled guide, with title, short description, file format and size, and its own `Download PDF` or `Download ZIP` action.
- An optional `Download all` ZIP only if it is prepared and tested; individual downloads should always remain available.
- The expiry date, a resend link, support contact, and a back to the main site path.

Each download action requests a server generated signed storage URL with a short expiry, then redirects to it. Record downloads for support and abuse investigations, but do not block a legitimate buyer for reasonable repeated downloads. If the access URL has expired or been revoked, provide a friendly page with the resend flow rather than a blank 404.

## Recommended architecture

### Next.js routes and services

| Responsibility | Suggested route or service |
| --- | --- |
| Catalogue and selector | `app/page.tsx` plus a server supplied catalogue configuration |
| Create order and Paystack transaction | `POST /api/checkout` |
| Confirmation page and polling | `app/payment/confirmation/page.tsx`, `GET /api/orders/by-reference/[reference]` |
| Download access page | `app/downloads/[token]/page.tsx` |
| Create a signed file URL | `POST /api/downloads/[token]/[guideId]` |
| Resend access email | `POST /api/access/resend` |
| Paystack event intake | `POST /api/webhooks/paystack` with raw body validation and server side payment verification |
| Resend delivery event intake | `POST /api/webhooks/resend` with signature validation and idempotent event recording |
| Database and assets | Supabase Postgres, a private Supabase Storage `paid-guides` bucket, and Supabase Queues or a Postgres backed outbox worker |
| Fulfillment and email | an idempotent worker that claims outbox work, sends through Resend, and records the result |

Use Supabase Postgres for orders and entitlements, a private Supabase Storage bucket for guide assets, and Resend for email. All commerce data access goes through trusted Next.js server routes or workers. Keep secrets in deployment environment variables; never in source control or browser code.

### Supabase access model

This purchase flow does not require buyer accounts or direct browser database access. Keep commerce tables in an unexposed schema such as `commerce`, or enable Row Level Security and revoke `anon` and `authenticated` access to them. In either model, the browser must not be able to query orders, email addresses, access tokens, payments, or storage object paths directly.

- Use the Supabase publishable key only for intentionally public browser features, if any. It is not needed for checkout or downloads.
- Use the Supabase secret key only in trusted server routes and workers. It bypasses Row Level Security and must never be exposed to the browser, logs, or source control.
- Keep paid guide files in the private `paid-guides` bucket. Do not issue a storage signed URL until the application has validated the access token and the requested guide entitlement.
- Enable Row Level Security and least privilege grants for every table exposed through Supabase's Data API. Write allow and deny tests for each policy. Prefer no public Data API access for commerce tables.
- Apply schema, RLS, grant, index, and database function changes through versioned Supabase migrations. Validate each migration locally with the Supabase CLI before applying it to the production project, and take a production backup before material schema changes.

### Durable fulfillment work

Use a transactional outbox as the source of truth for post payment work. The webhook transaction inserts a uniquely keyed `fulfillment_outbox` row after it creates the access grant. A worker atomically claims the row, sends the delivery email through Resend, records the outcome, and retries recoverable failures with backoff. This prevents a brief Resend outage from losing a paid order.

Supabase Queues, backed by `pgmq`, may be used to trigger workers, but the outbox table remains the recovery mechanism. Schedule a small Supabase Cron job to find pending or stalled outbox rows and enqueue or process them. The worker must be safe to run more than once.

### Data model

| Entity | Key fields |
| --- | --- |
| `guides` | immutable UUID, slug, title, description, active flag, current version, private Supabase Storage object key |
| `catalogue_prices` | guide or bundle ID, currency, amount in subunits, active date range, catalogue version |
| `orders` | internal UUID, public ID, email, selected item snapshot, resolved entitlements snapshot, currency, amount, status, Paystack reference, timestamps |
| `payments` | order ID, Paystack transaction ID and reference, verified amount and currency, status, verified payload or relevant audit fields, received timestamp |
| `access_grants` | order ID, token hash, entitled guide IDs and versions, issued, expires, revoked, last accessed timestamps |
| `webhook_events` | provider event ID or payload hash, reference, event type, received time, processing result, used to enforce idempotency |
| `fulfillment_outbox` | unique order and job type, payload reference, state, attempts, available at, claimed at, last error; allows safe recovery after webhook or worker failure |
| `email_deliveries` | order ID, message type, Resend email ID, Resend idempotency key, state, attempts, last error, sent timestamp |
| `resend_events` | Resend event ID, Resend email ID, event type, signed payload audit fields, received timestamp, processing result |
| `download_events` | access grant ID, guide ID, time, signed URL issued or download requested, minimal security metadata |

Enforce unique constraints for `orders.paystack_reference`, `webhook_events` provider event identity or payload hash, `access_grants.token_hash`, `fulfillment_outbox` order and job type, `email_deliveries.resend_idempotency_key`, and `resend_events` event identity. Index the order reference, token hash, queue state and availability time, and provider email IDs used on customer facing or worker lookup paths.

Snapshots are essential: a later catalogue price change or revised guide must not change what an already paid order costs or entitles the buyer to receive.

## Security, privacy, and reliability requirements

- Use HTTPS everywhere and store only the customer information needed for payment receipt and delivery. Do not store card data.
- Validate Paystack webhook signatures against the raw body with a timing safe comparison; also consider Paystack's documented webhook IP allow list as an additional infrastructure control.
- Verify every successful webhook server to server before delivery, including exact amount and currency. A visited callback URL alone never unlocks files.
- Generate access tokens with a cryptographically secure random generator, store only their hash, use generic invalid link responses, rate limit token lookups and resend requests, and avoid tokens in application logs and analytics.
- Make transactions, webhook records, fulfillment jobs, and email sends idempotent. Paystack can retry webhooks, and users can return to a confirmation URL more than once.
- Keep raw file storage private in Supabase Storage. Signed file URLs must expire quickly, scope to one object, and use safe file names and appropriate `Content-Disposition` headers.
- Use `SUPABASE_URL` and a server only Supabase secret key, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, Paystack secret and public keys, webhook signing secrets, and the canonical application URL as protected deployment configuration. Maintain distinct test and production values.
- Verify and monitor the Resend sending domain. Process Resend bounce, complaint, suppression, and failed delivery events so support can assist a buyer without blindly sending repeated delivery messages.
- Publish privacy, terms, refund, delivery, and support policies before production. Include consent language if marketing email is planned; transactional delivery should remain separate from marketing consent.
- Monitor webhook health, fulfillment time, email bounces, download failures, Paystack verification mismatches, and unexpected error rates. Preserve enough audit data to investigate support cases without retaining unnecessary personal data.

## Implementation sequence

### Phase 1: define the offer and content

1. Create the guide catalogue: final titles, descriptions, previews, file formats, individual prices, complete set price, currency, discount, and included guide IDs.
2. Finalize the delivery and refund policy, support inbox, email sender identity, and access duration.
3. Move paid assets to private storage and prepare a tested bundle archive only if a combined download is desired.

### Phase 2: build the purchase interface

1. Build the landing page selector, summary, email validation, responsive layout, and all selection, loading, error, and empty states.
2. Add preview pages or sample pages, FAQ, legal links, metadata, a usable 404, and the accessible keyboard and mobile interactions described above.
3. Implement server owned catalogue pricing and the checkout creation route.

### Phase 3: integrate payment and fulfillment

1. Configure the production Supabase project: private `paid-guides` bucket, Postgres migrations, RLS and grants, outbox worker or queue, backups, and recovery checks. There is no staging project.
2. Validate the purchase flow locally using Paystack test keys and a temporary HTTPS tunnel for the callback and webhook endpoints. Use test buyer emails and test guide assets only.
3. Implement Paystack initialization and hosted checkout redirect.
4. Implement raw body signature validation, server side verification, event idempotency, order status transitions, and entitlement creation.
5. Implement the confirmation page polling experience and an order retry route for incomplete payments.

### Phase 4: deliver access

1. Verify the Resend sending domain, build the transactional delivery email, and send it from the fulfillment job using Resend idempotency keys.
2. Build token protected download pages, signed asset delivery, resend flow, expiry and revoked link states.
3. Add an internal, access controlled support view or simple query procedure for finding an order by reference or email, resending access, and revoking a compromised link.

### Phase 5: verify and launch

1. Test the full happy path with Paystack test cards and verify that webhook fulfillment, not the browser callback, creates access.
2. Test duplicate Paystack and Resend webhook events, out of order delivery, a visitor refreshing or closing the confirmation page, failed or abandoned payment, changed price data, bad signature, amount mismatch, expired link, revoked link, Resend API uncertainty and idempotent retry, email bounce, resend abuse, stalled outbox recovery, and repeated downloads.
3. Run mobile, keyboard, screen reader, contrast, and slow network checks on the selector and confirmation screens.
4. Deploy a TLS enabled production endpoint, add Paystack live keys and dashboard webhook configuration, make a small live test purchase, and confirm receipt, access, and audit logs end to end.

## Acceptance criteria

- A visitor can select any valid combination of individual guides or the complete set and sees an accurate, clear server backed total before paying.
- Card checkout begins through Paystack without exposing a secret key or accepting a client supplied price.
- Returning from Paystack never alone exposes a download; a verified successful webhook does.
- A successful payment results in exactly one fulfilled order, one scoped access grant, and a delivery email, even if events or page loads repeat.
- Supabase Postgres records every payment, entitlement, email attempt, and fulfillment state transition durably; paid files remain inaccessible without a validated entitlement.
- Resend sends the initial delivery at most once for its logical send request, delivery status is recorded, and failures have a recoverable retry or support path.
- The confirmation screen becomes useful as soon as fulfillment completes and the email supplies a durable recovery path.
- A valid access URL shows only the paid guides and each download is served from private storage through a short lived signed URL.
- Invalid, expired, revoked, or guessed links disclose no purchase information and give a safe recovery path where appropriate.
- The experience remains understandable and usable with keyboard navigation, a phone sized screen, slow email delivery, payment interruption, and transient provider failures.

## Sources to use during implementation

- [Paystack: Accept payments](https://paystack.com/docs/payments/accept-payments/)
- [Paystack: Verify payments](https://paystack.com/docs/payments/verify-payments/)
- [Paystack: Webhooks](https://paystack.com/docs/payments/webhooks/)
- [Resend: Idempotency keys](https://resend.com/changelog/idempotency-keys)
- [Resend: Webhooks](https://www.resend.com/features/webhooks)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Queues](https://supabase.com/docs/guides/queues)
