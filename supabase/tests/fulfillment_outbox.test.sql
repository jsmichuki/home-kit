begin;

set local role service_role;

\echo 1..7

insert into public.commerce_orders (
  id,
  public_id,
  customer_email,
  selected_items,
  entitlement_snapshot,
  catalogue_version,
  currency,
  amount_in_subunits,
  paystack_reference
) values (
  '0f48d6c8-22d3-4648-a2b7-cf46de249720',
  'ord_outboxtest',
  'outbox-test@example.com',
  '[]'::jsonb,
  '[]'::jsonb,
  1,
  'USD',
  1200,
  'outbox_test_reference'
);

insert into public.commerce_fulfillment_outbox (id, order_id, job_type, payload)
values (
  '61c7e3b8-2fd8-49d3-9328-a3c9dc049745',
  '0f48d6c8-22d3-4648-a2b7-cf46de249720',
  'send_delivery_email',
  '{"order_public_id":"ord_outboxtest","access_grant_id":"de63ae95-7ed5-4995-a6cc-342be5ec0ce1"}'::jsonb
);

insert into public.commerce_orders (
  id,
  public_id,
  customer_email,
  selected_items,
  entitlement_snapshot,
  catalogue_version,
  currency,
  amount_in_subunits,
  paystack_reference
) values (
  'c263d9db-513a-459e-bb8a-1f96c4fa44ec',
  'ord_outboxretry',
  'outbox-retry@example.com',
  '[]'::jsonb,
  '[]'::jsonb,
  1,
  'USD',
  1200,
  'outbox_retry_reference'
);

select case when (
  select count(*) = 1
  from public.commerce_claim_fulfillment_jobs(1, 900)
) then 'ok 1 - one pending outbox job can be claimed'
else 'not ok 1 - one pending outbox job can be claimed' end;

select case when (
  select status = 'processing' and attempts = 1
  from public.commerce_fulfillment_outbox
  where id = '61c7e3b8-2fd8-49d3-9328-a3c9dc049745'
) then 'ok 2 - claiming records the worker lease and attempt'
else 'not ok 2 - claiming records the worker lease and attempt' end;

select case when (
  select count(*) = 0
  from public.commerce_claim_fulfillment_jobs(1, 900)
) then 'ok 3 - a processing job cannot be claimed twice'
else 'not ok 3 - a processing job cannot be claimed twice' end;

select case when public.commerce_retry_fulfillment_job(
  '61c7e3b8-2fd8-49d3-9328-a3c9dc049745',
  'Provider unavailable',
  1
) = 'failed'
then 'ok 4 - exhausted work moves to the durable failed state'
else 'not ok 4 - exhausted work moves to the durable failed state' end;

insert into public.commerce_fulfillment_outbox (id, order_id, job_type, payload, status, attempts, claimed_at)
values (
  'fe6cdf20-c307-4caf-b7b2-0fe8a119e6dc',
  'c263d9db-513a-459e-bb8a-1f96c4fa44ec',
  'send_delivery_email',
  '{"order_public_id":"ord_outboxtest","access_grant_id":"f8e7b88e-0d2e-4968-bf93-891b3cb2e93f"}'::jsonb,
  'processing',
  1,
  now() - interval '16 minutes'
);

select case when public.commerce_recover_stalled_fulfillment_jobs(900, 8) = 1
then 'ok 5 - recovery finds an expired worker lease'
else 'not ok 5 - recovery finds an expired worker lease' end;

select case when (
  select status = 'pending' and claimed_at is null
  from public.commerce_fulfillment_outbox
  where id = 'fe6cdf20-c307-4caf-b7b2-0fe8a119e6dc'
) then 'ok 6 - recovery returns stalled work to the queue'
else 'not ok 6 - recovery returns stalled work to the queue' end;

select case when not has_function_privilege(
  'anon',
  'public.commerce_claim_fulfillment_jobs(integer, integer)',
  'execute'
) then 'ok 7 - browser roles cannot claim fulfillment work'
else 'not ok 7 - browser roles cannot claim fulfillment work' end;

rollback;
