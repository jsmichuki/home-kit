-- Replacing the legacy signature preserves webhook retry compatibility while
-- the current application uses v2 with a caller-generated grant identifier.
create or replace function public.commerce_fulfill_verified_paystack_charge_v2(
  p_provider_event_id text,
  p_payload_hash text,
  p_reference text,
  p_transaction_id bigint,
  p_verified_amount_in_subunits integer,
  p_verified_currency text,
  p_verified_email text,
  p_verified_metadata jsonb,
  p_access_grant_id uuid,
  p_access_token_hash text,
  p_access_token_expires_at timestamptz,
  p_verification_summary jsonb
)
returns table (outcome text, order_public_id text, access_grant_id uuid, fulfilled_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_order public.commerce_orders%rowtype; v_grant_id uuid; v_fulfilled_at timestamptz;
begin
  if coalesce(nullif(trim(p_provider_event_id), ''), '') = ''
    or coalesce(nullif(trim(p_payload_hash), ''), '') = ''
    or coalesce(nullif(trim(p_reference), ''), '') = ''
    or p_access_grant_id is null
    or coalesce(nullif(trim(p_access_token_hash), ''), '') = ''
    or p_verified_amount_in_subunits < 0
    or p_access_token_expires_at <= now()
    or jsonb_typeof(p_verified_metadata) <> 'object'
    or jsonb_typeof(p_verification_summary) <> 'object' then
    return query select 'rejected'::text, null::text, null::uuid, null::timestamptz; return;
  end if;
  if exists (select 1 from public.commerce_webhook_events as event where event.provider = 'paystack' and (event.provider_event_id = p_provider_event_id or event.payload_hash = p_payload_hash)) then
    return query select 'duplicate'::text, null::text, null::uuid, null::timestamptz; return;
  end if;
  insert into public.commerce_webhook_events (provider, provider_event_id, payload_hash, reference, event_type, processing_status)
  values ('paystack', p_provider_event_id, p_payload_hash, p_reference, 'charge.success', 'received');
  select * into v_order from public.commerce_orders as commerce_order where commerce_order.paystack_reference = p_reference for update;
  if not found then
    update public.commerce_webhook_events as event set processing_status = 'ignored', processed_at = now() where event.provider = 'paystack' and event.payload_hash = p_payload_hash;
    return query select 'ignored'::text, null::text, null::uuid, null::timestamptz; return;
  end if;
  if v_order.status = 'fulfilled' then
    update public.commerce_webhook_events as event set processing_status = 'processed', processed_at = now() where event.provider = 'paystack' and event.payload_hash = p_payload_hash;
    select access_grant.id, access_grant.issued_at into v_grant_id, v_fulfilled_at from public.commerce_access_grants as access_grant where access_grant.order_id = v_order.id;
    return query select 'duplicate'::text, v_order.public_id, v_grant_id, v_fulfilled_at; return;
  end if;
  if v_order.status <> 'payment_pending'
    or v_order.amount_in_subunits <> p_verified_amount_in_subunits
    or v_order.currency <> upper(trim(p_verified_currency))
    or lower(trim(v_order.customer_email)) <> lower(trim(p_verified_email))
    or coalesce(p_verified_metadata ->> 'order_public_id', '') <> v_order.public_id
    or coalesce(p_verified_metadata ->> 'catalogue_version', '') <> v_order.catalogue_version::text then
    update public.commerce_webhook_events as event set processing_status = 'failed', processed_at = now(), error_message = 'Verified transaction did not match the pending order.' where event.provider = 'paystack' and event.payload_hash = p_payload_hash;
    return query select 'rejected'::text, null::text, null::uuid, null::timestamptz; return;
  end if;
  insert into public.commerce_payments (order_id, paystack_reference, paystack_transaction_id, status, verified_amount_in_subunits, verified_currency, verification_summary, verified_at)
  values (v_order.id, p_reference, p_transaction_id, 'success', p_verified_amount_in_subunits, upper(trim(p_verified_currency)), p_verification_summary, now())
  on conflict (order_id) do update set paystack_transaction_id = excluded.paystack_transaction_id, status = 'success', verified_amount_in_subunits = excluded.verified_amount_in_subunits, verified_currency = excluded.verified_currency, verification_summary = excluded.verification_summary, verified_at = excluded.verified_at, updated_at = now();
  insert into public.commerce_access_grants (id, order_id, token_hash, entitlement_snapshot, expires_at)
  values (p_access_grant_id, v_order.id, p_access_token_hash, v_order.entitlement_snapshot, p_access_token_expires_at)
  returning commerce_access_grants.id into v_grant_id;
  update public.commerce_orders as commerce_order set status = 'fulfilled', paid_at = now(), fulfilled_at = now(), updated_at = now() where commerce_order.id = v_order.id returning commerce_order.fulfilled_at into v_fulfilled_at;
  insert into public.commerce_fulfillment_outbox (order_id, job_type, payload)
  values (v_order.id, 'send_delivery_email', jsonb_build_object('access_grant_id', v_grant_id, 'message_type', 'delivery_link', 'order_public_id', v_order.public_id))
  on conflict do nothing;
  update public.commerce_webhook_events as event set processing_status = 'processed', processed_at = now() where event.provider = 'paystack' and event.payload_hash = p_payload_hash;
  return query select 'fulfilled'::text, v_order.public_id, v_grant_id, v_fulfilled_at;
end;
$$;

create or replace function public.commerce_fulfill_verified_paystack_charge(
  p_provider_event_id text, p_payload_hash text, p_reference text, p_transaction_id bigint,
  p_verified_amount_in_subunits integer, p_verified_currency text, p_verified_email text,
  p_verified_metadata jsonb, p_access_token_hash text, p_access_token_expires_at timestamptz,
  p_verification_summary jsonb
)
returns table (outcome text, order_public_id text, access_grant_id uuid, fulfilled_at timestamptz)
language sql security definer set search_path = public as $$
  select * from public.commerce_fulfill_verified_paystack_charge_v2(
    p_provider_event_id, p_payload_hash, p_reference, p_transaction_id,
    p_verified_amount_in_subunits, p_verified_currency, p_verified_email,
    p_verified_metadata, extensions.gen_random_uuid(), p_access_token_hash,
    p_access_token_expires_at, p_verification_summary
  );
$$;

create or replace function public.commerce_prepare_delivery_email(
  p_order_id uuid, p_access_grant_id uuid, p_idempotency_key text,
  p_message_type text, p_delivery_request_id uuid default null
)
returns table (
  delivery_email text, order_public_id text, paystack_reference text, selected_items jsonb,
  amount_in_subunits integer, currency char(3), access_grant_expires_at timestamptz,
  resend_idempotency_key text, resend_email_id text, delivery_status text,
  attempts integer, should_send boolean
)
language plpgsql security definer set search_path = public as $$
declare v_delivery public.commerce_email_deliveries%rowtype; v_order public.commerce_orders%rowtype; v_grant public.commerce_access_grants%rowtype; v_should_send boolean := false;
begin
  if p_message_type not in ('delivery_link', 'delivery_link_resend') or coalesce(nullif(trim(p_idempotency_key), ''), '') = '' then return; end if;
  select * into v_order from public.commerce_orders as commerce_order where commerce_order.id = p_order_id and commerce_order.status = 'fulfilled';
  if not found then return; end if;
  select * into v_grant from public.commerce_access_grants as access_grant where access_grant.id = p_access_grant_id and access_grant.order_id = v_order.id and access_grant.revoked_at is null and access_grant.expires_at > now();
  if not found or (p_message_type = 'delivery_link' and p_delivery_request_id is not null) or (p_message_type = 'delivery_link_resend' and p_delivery_request_id is null) then return; end if;
  insert into public.commerce_email_deliveries (order_id, access_grant_id, message_type, resend_idempotency_key)
  values (v_order.id, v_grant.id, p_message_type, p_idempotency_key)
  on conflict on constraint commerce_email_deliveries_resend_idempotency_key_key do nothing;
  select * into v_delivery from public.commerce_email_deliveries as email_delivery where email_delivery.resend_idempotency_key = p_idempotency_key for update;
  if v_delivery.resend_email_id is null and v_delivery.status in ('pending', 'failed') then
    update public.commerce_email_deliveries as email_delivery set attempts = email_delivery.attempts + 1, status = 'pending', updated_at = now() where email_delivery.id = v_delivery.id returning * into v_delivery;
    v_should_send := true;
  end if;
  return query select v_order.customer_email, v_order.public_id, v_order.paystack_reference, v_order.selected_items, v_order.amount_in_subunits, v_order.currency, v_grant.expires_at, v_delivery.resend_idempotency_key, v_delivery.resend_email_id, v_delivery.status, v_delivery.attempts, v_should_send;
end;
$$;

revoke all on function public.commerce_fulfill_verified_paystack_charge_v2(text, text, text, bigint, integer, text, text, jsonb, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.commerce_fulfill_verified_paystack_charge_v2(text, text, text, bigint, integer, text, text, jsonb, uuid, text, timestamptz, jsonb) to service_role;
