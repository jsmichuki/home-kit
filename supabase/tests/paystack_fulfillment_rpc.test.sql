begin;

set local role service_role;

\echo 1..7

select case when (
  select outcome = 'ignored'
  from public.commerce_fulfill_verified_paystack_charge(
    'evt_unknown_reference',
    repeat('a', 64),
    'unknown_reference',
    1001,
    1200,
    'USD',
    'buyer@example.com',
    '{"order_public_id":"ord_unknown","catalogue_version":"1"}'::jsonb,
    repeat('b', 64),
    now() + interval '30 days',
    '{}'::jsonb
  )
) then 'ok 1 - an unknown verified reference is safely ignored'
else 'not ok 1 - an unknown verified reference is safely ignored' end;

select case when exists (
  select 1 from public.commerce_webhook_events
  where provider_event_id = 'evt_unknown_reference' and processing_status = 'ignored'
) then 'ok 2 - ignored webhook evidence is retained'
else 'not ok 2 - ignored webhook evidence is retained' end;

insert into public.commerce_orders (
  id, public_id, customer_email, selected_items, entitlement_snapshot,
  catalogue_version, currency, amount_in_subunits, paystack_reference
) values
  ('7e8c36f8-6af5-49bf-a44d-52087a7a3f70', 'ord_amountmismatch', 'amount@example.com', '[]', '[]', 1, 'USD', 1200, 'ref_amount_mismatch'),
  ('1a6139c2-3554-4073-aea3-7a75f45f9c34', 'ord_currencymismatch', 'currency@example.com', '[]', '[]', 1, 'USD', 1200, 'ref_currency_mismatch'),
  ('c4dbd865-b2a3-4b4b-bb72-a24f65d9e34a', 'ord_fulfilltest', 'fulfilled@example.com', '[]', '[]', 1, 'USD', 1200, 'ref_fulfill_test');

select case when (
  select outcome = 'rejected'
  from public.commerce_fulfill_verified_paystack_charge(
    'evt_amount_mismatch', repeat('c', 64), 'ref_amount_mismatch', 1002, 1201, 'USD',
    'amount@example.com', '{"order_public_id":"ord_amountmismatch","catalogue_version":"1"}',
    repeat('d', 64), now() + interval '30 days', '{}'::jsonb
  )
) then 'ok 3 - an amount mismatch cannot fulfill an order'
else 'not ok 3 - an amount mismatch cannot fulfill an order' end;

select case when (
  select outcome = 'rejected'
  from public.commerce_fulfill_verified_paystack_charge(
    'evt_currency_mismatch', repeat('e', 64), 'ref_currency_mismatch', 1003, 1200, 'KES',
    'currency@example.com', '{"order_public_id":"ord_currencymismatch","catalogue_version":"1"}',
    repeat('f', 64), now() + interval '30 days', '{}'::jsonb
  )
) then 'ok 4 - a currency mismatch cannot fulfill an order'
else 'not ok 4 - a currency mismatch cannot fulfill an order' end;

select case when (
  select outcome = 'fulfilled'
  from public.commerce_fulfill_verified_paystack_charge(
    'evt_valid_fulfillment', repeat('1', 64), 'ref_fulfill_test', 1004, 1200, 'USD',
    'fulfilled@example.com', '{"order_public_id":"ord_fulfilltest","catalogue_version":"1"}',
    repeat('2', 64), now() + interval '30 days', '{"status":"success"}'::jsonb
  )
) then 'ok 5 - a matching verified event fulfills exactly once'
else 'not ok 5 - a matching verified event fulfills exactly once' end;

select case when (
  select outcome = 'duplicate'
  from public.commerce_fulfill_verified_paystack_charge(
    'evt_valid_fulfillment', repeat('1', 64), 'ref_fulfill_test', 1004, 1200, 'USD',
    'fulfilled@example.com', '{"order_public_id":"ord_fulfilltest","catalogue_version":"1"}',
    repeat('2', 64), now() + interval '30 days', '{"status":"success"}'::jsonb
  )
) then 'ok 6 - a duplicate provider event is a no op'
else 'not ok 6 - a duplicate provider event is a no op' end;

select case when (
  select
    (select count(*) from public.commerce_access_grants where order_id = 'c4dbd865-b2a3-4b4b-bb72-a24f65d9e34a') = 1
    and
    (select count(*) from public.commerce_fulfillment_outbox where order_id = 'c4dbd865-b2a3-4b4b-bb72-a24f65d9e34a') = 1
) then 'ok 7 - repeated fulfillment creates one grant and one delivery job'
else 'not ok 7 - repeated fulfillment creates one grant and one delivery job' end;

rollback;
