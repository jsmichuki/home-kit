# Home Kit operations runbook

## Status and ownership

This is the production operations runbook for the single Home Kit Supabase project. There is no staging project. It is an engineering operating draft, not jurisdiction specific legal advice. A designated owner must review the alert destination, retention schedule, incident contacts, and provider access before enabling live payments.

Keep the following owner information in the deployment platform or internal password manager, never in this repository:

- Primary operational owner and backup owner
- Alert destination and escalation contact
- Paystack dashboard administrator
- Resend dashboard administrator
- Supabase organization owners
- Deployment platform administrator

`support@astralrefine.com` is the customer support inbox. It is not an emergency paging channel.

## Required deployment controls

- Serve the site, callback, and webhook endpoints over HTTPS only. Redirect HTTP to HTTPS at the hosting edge and enable HSTS only after every intended subdomain supports HTTPS.
- Configure the canonical public site URL with `https://`; reject non HTTPS production values during deployment review.
- Keep all provider keys in the deployment secret store. Do not set them as browser exposed environment variables or add values to analytics, issue trackers, logs, or fixtures.
- Protect the Supabase, Paystack, Resend, source control, and hosting accounts with MFA. Keep at least two Supabase organization owners.
- Restrict production dashboard access to the people who operate the service. Review members and access keys every quarter and whenever a person leaves the team.
- Before live payments, configure an external alert destination, test its delivery, and record the test date here or in the release record.

## Delivery worker schedule

The verified Paystack webhook creates the durable outbox row and makes one immediate, post-response delivery attempt. The GitHub Actions workflow at `.github/workflows/fulfillment-worker.yml` is the recovery path: it calls the authenticated `POST /api/internal/fulfillment/drain` endpoint every five minutes, so it retries work left pending by a Resend outage or an interrupted immediate attempt.

Before enabling the workflow, add these repository settings in GitHub:

- Repository secret `FULFILLMENT_WORKER_SECRET`, with exactly the same value used in the Vercel Production environment.
- Repository variable `FULFILLMENT_WORKER_URL`, set to the canonical HTTPS site origin with no trailing slash.

Keep the workflow on the default branch. Its manual `workflow_dispatch` trigger is the approved way to run recovery after investigating an incident. Do not put the worker secret in the workflow file, issue tracker, or support inbox.

## Safe event logging

Use `@/lib/observability/safe-log` for server operational events. It redacts credential shaped values, access and confirmation tokens, authorization values, payload and header fields, card number shaped strings, and full email addresses. It also bounds nested data so an accidental large object cannot become a log dump.

Log concise event names and safe identifiers only:

```ts
logOperationalEvent("warn", "paystack.webhook.rejected", {
  reason: "signature_invalid",
  reference: "order_reference_if_known",
});
```

Never pass a `Request`, headers, raw body, provider payload, access URL, email address, secret, authorization value, or opaque token to a logger. Prefer a stable category such as `signature_invalid`, `amount_mismatch`, `resend_timeout`, or `download_token_invalid` over a provider error body. The helper is a guardrail, not permission to log untrusted data.

Run `npm run check:secrets` before every release and in continuous integration. It scans tracked files for supported credential formats and deliberately prints only the file and line of a finding, never the matched value. It cannot prove that the repository is secret free; review secret manager, provider dashboards, deployment logs, and git history if an exposure is suspected.

## Monitoring and alerts

Send structured application events and the listed database queries to the chosen alerting destination. The current code records durable order, webhook, email, outbox, and download evidence in Supabase. It does not itself provide a hosted monitoring service, alert transport, or on call rotation.

| Signal | Source | Alert condition | First response |
| --- | --- | --- | --- |
| Paystack webhook receipt and verification | `commerce_webhook_events`, structured `paystack.webhook.*` events | No successful receipt during an expected payment window, or verification failures increase unexpectedly | Check Paystack event history, endpoint availability, and recent deploys; do not fulfill from a callback alone. |
| Amount or currency mismatch | Webhook processing result | Any occurrence | Page the operational owner immediately. Preserve reference and timestamps, disable live checkout if systemic, and investigate before manual fulfillment. |
| Invalid webhook signatures | Structured rejection event | Five or more in ten minutes, or any sustained pattern | Verify the configured endpoint and secret; check edge logs without copying payloads; consider IP filtering as a defence in depth control. |
| Outbox health | `commerce_fulfillment_outbox` | Any `failed` job, pending job older than 15 minutes, or processing lease older than 15 minutes | Run the documented recovery path, inspect only redacted failure categories, and keep the grant valid. |
| Resend delivery health | `commerce_email_deliveries`, `commerce_resend_events` | Any bounce, complaint, suppression, permanent failure, or sustained delayed sends | Stop repeated sends to the affected recipient, assist through support, and do not revoke download access solely because email failed. |
| Download health | `commerce_download_events`, structured `download.*` events | Unexpected signed URL failures or a sustained rise in invalid token lookups | Check storage availability and release history; do not log or request a customer token in support tickets. |

Check the outbox at least daily even with automated alerts. Before launch, establish a dashboard or saved query for each source above and test one non production alert path where possible.

## Data minimization and retention

The application should retain only what is needed for receipts, access delivery, support, fraud investigation, and applicable legal or tax obligations. Do not add buyer profile fields, card data, full provider webhook payloads, or marketing consent to this transactional flow without a documented purpose and policy review.

Proposed retention schedule, to be approved by counsel and configured as a scheduled, auditable deletion or anonymization job before relying on it:

| Data | Proposed retention | Action after period |
| --- | --- | --- |
| Orders, payment evidence, and receipt fields | 7 years, unless applicable law requires longer or shorter | Delete or irreversibly anonymize buyer contact fields while preserving only legally required accounting data. |
| Access grants and token hashes | 30 day access window plus 90 days for support and fraud review | Revoke or expire access; delete the hash and entitlement link unless still needed for a documented dispute. |
| Email deliveries and Resend events | 180 days | Delete provider IDs, delivery metadata, and error details after resolving support issues. |
| Download events and IP hashes | 90 days | Delete the event and IP hash. |
| Operational logs | 30 days | Delete according to the hosting log retention control. |

The table is a policy proposal, not evidence that deletion is currently automated. Until a scheduled retention job exists, do not mark retention enforcement complete.

## Incident response

1. Open an incident record with a time, affected references or internal IDs, responder, scope, and decisions. Do not include a secret, raw webhook, full email address, access token, or card information.
2. Preserve minimal evidence: redacted event category, provider event ID, order reference, timestamps, deployment version, and relevant database record IDs.
3. Assign an incident lead and customer communications owner. Use the support inbox for customer updates and the external alert destination for responders.
4. Contain the issue, recover safely, notify affected buyers when appropriate, and record a follow up action before closing the incident.

### Payment issue or amount mismatch

- Treat a verified amount or currency mismatch as potential fraud or configuration failure. Stop manual fulfillment for the reference and preserve evidence.
- Check Paystack event history and server side verification results. A browser callback is never proof of payment.
- If the issue is systemic, disable new checkout traffic at the deployment edge or application configuration, then reconcile affected pending orders with Paystack before resuming.
- Do not create an access grant or send a delivery email until a matching, server verified payment is recorded.

### Email provider outage

- Leave fulfilled orders and active grants valid. Email delivery failure must not remove a buyer's valid access.
- Pause repeated sends if the provider is failing broadly. Keep the durable outbox job and its safe failure category for retry after recovery.
- Check Resend status and webhook event history. Retry through the same recorded idempotency policy, then confirm the final delivery outcome.
- Use the confirmation or secure download path for an already fulfilled buyer when it is available; do not ask them to send an access token to support.

### Suspected leaked access link

- Ask the buyer not to forward the link and do not request that they paste it into email or chat.
- Identify the order through approved internal support procedures. When the controlled support action exists, revoke the affected grant, record the reason and time, and issue a replacement only after verifying the request.
- Review minimal download event data for scope. Do not copy a token into the incident record.
- Notify the buyer of the replacement and document any additional account or product impact.

### Compromised provider or deployment secret

- Treat the key as exposed. Remove it from the deployment configuration, rotate it in the provider dashboard, and deploy the replacement from the secret store.
- Rotate dependent secrets and webhook signing configuration when the provider requires it. Revoke obsolete credentials and review provider activity, deployment logs, source control history, and access lists.
- Verify checkout, webhook signature validation, email delivery, and storage access with safe test data after rotation.
- If a secret was committed, do not rely on deleting the commit. Rotate first, then use the repository incident process to remove exposure where practical.

## Rotation and release checklist

- Rotate provider and Supabase secrets at least every 90 days, on role changes, and immediately after suspected exposure. Rotate one integration at a time with an owner and rollback plan.
- Before rotation, inventory each use: checkout initialization, webhook validation, transaction verification, email send, email webhook validation, Supabase server access, and scheduled workers.
- Deploy the replacement through the secret store, verify a safe endpoint or provider test event, then revoke the old key. Record the date, owner, systems checked, and old key revocation confirmation outside this repository.
- Run `npm run check:secrets`, `npm test`, `npm run lint`, and the appropriate Supabase checks before release. A green secret scan does not replace a manual review of deployment configuration.
- After every production release, record deployed version, schema migration state, confirmation of HTTPS, and alert delivery test.

## Provider references

- [Paystack webhook guidance](https://paystack.com/docs/payments/webhooks/) documents signature verification, fast acknowledgement, retry behavior, and its webhook event history.
- [Resend webhook guidance](https://resend.com/docs/webhooks/introduction) documents signed webhook verification, event replay, and using event data for alert workflows.
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) covers RLS, SSL enforcement, network restrictions, MFA, backups, and production ownership.
