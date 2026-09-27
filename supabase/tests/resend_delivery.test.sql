begin;

set local role service_role;

\echo 1..10

insert into public.commerce_orders (
  id, public_id, customer_email, selected_items, entitlement_snapshot,
  catalogue_version, currency, amount_in_subunits, paystack_reference, status, fulfilled_at
) values (
  '23927791-867d-48d4-9e89-799616a3634a',
  'ord_resenddelivery',
  'delivery-test@example.com',
  '[{"product_title":"Home Maintenance Guide"}]'::jsonb,
  '[]'::jsonb,
  1, 'USD', 6900, 'resend_delivery_reference', 'fulfilled', now()
);

insert into public.commerce_access_grants (
  id, order_id, token_hash, entitlement_snapshot, expires_at
) values (
  '4126d9c3-773e-48a5-a840-62311eea04fb',
  '23927791-867d-48d4-9e89-799616a3634a',
  repeat('a', 64), '[]'::jsonb, now() + interval '30 days'
);

select case when (
  select should_send and delivery_email = 'delivery-test@example.com'
  from public.commerce_prepare_delivery_email(
    '23927791-867d-48d4-9e89-799616a3634a',
    '4126d9c3-773e-48a5-a840-62311eea04fb',
    'home-kit/delivery/delivery_link/4126d9c3-773e-48a5-a840-62311eea04fb',
    'delivery_link', null
  )
) then 'ok 1 - initial delivery work creates a sendable email record'
else 'not ok 1 - initial delivery work creates a sendable email record' end;

select case when (
  select count(*) = 1 and min(attempts) = 1
  from public.commerce_email_deliveries
  where resend_idempotency_key = 'home-kit/delivery/delivery_link/4126d9c3-773e-48a5-a840-62311eea04fb'
) then 'ok 2 - initial delivery has one durable deterministic idempotency key'
else 'not ok 2 - initial delivery has one durable deterministic idempotency key' end;

select case when public.commerce_record_resend_send_result(
  '23927791-867d-48d4-9e89-799616a3634a',
  'home-kit/delivery/delivery_link/4126d9c3-773e-48a5-a840-62311eea04fb',
  'resend_email_123',
  '{"id":"resend_email_123"}'::jsonb
) then 'ok 3 - provider email identity and minimal response are recorded'
else 'not ok 3 - provider email identity and minimal response are recorded' end;

select case when (
  select resend_email_id = 'resend_email_123'
    and status = 'sent'
    and provider_response = '{"id":"resend_email_123"}'::jsonb
  from public.commerce_email_deliveries
  where resend_idempotency_key = 'home-kit/delivery/delivery_link/4126d9c3-773e-48a5-a840-62311eea04fb'
) then 'ok 4 - send state is persisted without a provider payload dump'
else 'not ok 4 - send state is persisted without a provider payload dump' end;

select case when (
  select not should_send
  from public.commerce_prepare_delivery_email(
    '23927791-867d-48d4-9e89-799616a3634a',
    '4126d9c3-773e-48a5-a840-62311eea04fb',
    'home-kit/delivery/delivery_link/4126d9c3-773e-48a5-a840-62311eea04fb',
    'delivery_link', null
  )
) then 'ok 5 - a recorded provider ID prevents another send attempt'
else 'not ok 5 - a recorded provider ID prevents another send attempt' end;

select case when public.commerce_record_resend_webhook_event(
  'svix_resend_delivery_event_123', 'resend_email_123', 'email.delivered', repeat('b', 64)
) then 'ok 6 - a delivery event is recorded once'
else 'not ok 6 - a delivery event is recorded once' end;

select case when (
  not public.commerce_record_resend_webhook_event(
    'svix_resend_delivery_event_123', 'resend_email_123', 'email.delivered', repeat('b', 64)
  ) and exists (
    select 1 from public.commerce_email_deliveries
    where resend_email_id = 'resend_email_123' and status = 'delivered'
  )
) then 'ok 7 - duplicate event IDs are no ops while delivery state is retained'
else 'not ok 7 - duplicate event IDs are no ops while delivery state is retained' end;

insert into public.commerce_orders (
  id, public_id, customer_email, selected_items, entitlement_snapshot,
  catalogue_version, currency, amount_in_subunits, paystack_reference, status, fulfilled_at
) values (
  '12bc1efc-f11a-45fd-b7e1-bb5e5fa57fca',
  'ord_resendexpired',
  'expired-delivery-test@example.com',
  '[{"product_title":"Home Maintenance Guide"}]'::jsonb,
  '[]'::jsonb,
  1, 'USD', 6900, 'resend_expired_reference', 'fulfilled', now()
);

insert into public.commerce_access_grants (
  id, order_id, token_hash, entitlement_snapshot, expires_at
) values (
  'b2db8a78-857d-44ea-9e22-18e31af2cd60',
  '12bc1efc-f11a-45fd-b7e1-bb5e5fa57fca',
  repeat('c', 64), '[]'::jsonb, now() + interval '30 days'
);

select case when (
  select should_send
  from public.commerce_prepare_delivery_email(
    '12bc1efc-f11a-45fd-b7e1-bb5e5fa57fca',
    'b2db8a78-857d-44ea-9e22-18e31af2cd60',
    'home-kit/delivery/delivery_link/b2db8a78-857d-44ea-9e22-18e31af2cd60',
    'delivery_link', null
  )
) then 'ok 8 - unresolved initial work can be prepared before the provider window expires'
else 'not ok 8 - unresolved initial work can be prepared before the provider window expires' end;

update public.commerce_email_deliveries
set created_at = now() - interval '25 hours'
where resend_idempotency_key = 'home-kit/delivery/delivery_link/b2db8a78-857d-44ea-9e22-18e31af2cd60';

select case when (
  select should_send
    and resend_idempotency_key = 'home-kit/delivery/delivery_link/b2db8a78-857d-44ea-9e22-18e31af2cd60/retry/1'
  from public.commerce_prepare_delivery_email(
    '12bc1efc-f11a-45fd-b7e1-bb5e5fa57fca',
    'b2db8a78-857d-44ea-9e22-18e31af2cd60',
    'home-kit/delivery/delivery_link/b2db8a78-857d-44ea-9e22-18e31af2cd60',
    'delivery_link', null
  )
) then 'ok 9 - an expired unresolved key gets one recorded retry identity'
else 'not ok 9 - an expired unresolved key gets one recorded retry identity' end;

select case when (
  select count(*) = 2
    and count(*) filter (where last_error = 'resend_idempotency_window_expired') = 1
    and count(*) filter (where resend_email_id is null) = 2
  from public.commerce_email_deliveries
  where order_id = '12bc1efc-f11a-45fd-b7e1-bb5e5fa57fca'
) then 'ok 10 - the old unresolved attempt remains durable history'
else 'not ok 10 - the old unresolved attempt remains durable history' end;

rollback;
