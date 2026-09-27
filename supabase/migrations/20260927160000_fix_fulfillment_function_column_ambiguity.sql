-- Forward fix for the initial fulfillment functions. PL/pgSQL output column
-- names share identifiers with table columns, so every table reference is
-- qualified to keep execution deterministic.
create or replace function public.commerce_claim_fulfillment_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 900
)
returns table (
  id uuid,
  order_id uuid,
  job_type text,
  payload jsonb,
  attempts integer,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;

  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 60 and 3600';
  end if;

  update public.commerce_fulfillment_outbox as outbox
  set
    status = case when outbox.attempts >= 8 then 'failed' else 'pending' end,
    claimed_at = null,
    available_at = case when outbox.attempts >= 8 then outbox.available_at else now() end,
    last_error = coalesce(outbox.last_error, 'Worker lease expired.'),
    updated_at = now()
  where outbox.status = 'processing'
    and outbox.claimed_at < now() - make_interval(secs => p_lease_seconds);

  return query
  with candidates as (
    select outbox.id
    from public.commerce_fulfillment_outbox as outbox
    where outbox.status = 'pending'
      and outbox.available_at <= now()
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.commerce_fulfillment_outbox as outbox
    set
      status = 'processing',
      attempts = outbox.attempts + 1,
      claimed_at = now(),
      updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.order_id, outbox.job_type, outbox.payload,
      outbox.attempts, outbox.claimed_at
  )
  select claimed.id, claimed.order_id, claimed.job_type, claimed.payload,
    claimed.attempts, claimed.claimed_at
  from claimed;
end;
$$;

create or replace function public.commerce_fulfill_verified_paystack_charge(
  p_provider_event_id text,
  p_payload_hash text,
  p_reference text,
  p_transaction_id bigint,
  p_verified_amount_in_subunits integer,
  p_verified_currency text,
  p_verified_email text,
  p_verified_metadata jsonb,
  p_access_token_hash text,
  p_access_token_expires_at timestamptz,
  p_verification_summary jsonb
)
returns table (
  outcome text,
  order_public_id text,
  access_grant_id uuid,
  fulfilled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_grant_id uuid;
  v_fulfilled_at timestamptz;
begin
  if coalesce(nullif(trim(p_provider_event_id), ''), '') = ''
    or coalesce(nullif(trim(p_payload_hash), ''), '') = ''
    or coalesce(nullif(trim(p_reference), ''), '') = ''
    or coalesce(nullif(trim(p_access_token_hash), ''), '') = ''
    or p_verified_amount_in_subunits < 0
    or p_access_token_expires_at <= now()
    or jsonb_typeof(p_verified_metadata) <> 'object'
    or jsonb_typeof(p_verification_summary) <> 'object' then
    return query select 'rejected'::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from public.commerce_webhook_events as webhook_event
    where webhook_event.provider = 'paystack'
      and (webhook_event.provider_event_id = p_provider_event_id or webhook_event.payload_hash = p_payload_hash)
  ) then
    return query select 'duplicate'::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.commerce_webhook_events (
    provider,
    provider_event_id,
    payload_hash,
    reference,
    event_type,
    processing_status
  ) values (
    'paystack',
    p_provider_event_id,
    p_payload_hash,
    p_reference,
    'charge.success',
    'received'
  );

  select *
  into v_order
  from public.commerce_orders as commerce_order
  where commerce_order.paystack_reference = p_reference
  for update;

  if not found then
    update public.commerce_webhook_events as webhook_event
    set processing_status = 'ignored', processed_at = now()
    where webhook_event.provider = 'paystack' and webhook_event.payload_hash = p_payload_hash;
    return query select 'ignored'::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_order.status = 'fulfilled' then
    update public.commerce_webhook_events as webhook_event
    set processing_status = 'processed', processed_at = now()
    where webhook_event.provider = 'paystack' and webhook_event.payload_hash = p_payload_hash;
    select access_grant.id, access_grant.issued_at
    into v_grant_id, v_fulfilled_at
    from public.commerce_access_grants as access_grant
    where access_grant.order_id = v_order.id;
    return query select 'duplicate'::text, v_order.public_id, v_grant_id, v_fulfilled_at;
    return;
  end if;

  if v_order.status <> 'payment_pending'
    or v_order.amount_in_subunits <> p_verified_amount_in_subunits
    or v_order.currency <> upper(trim(p_verified_currency))
    or lower(trim(v_order.customer_email)) <> lower(trim(p_verified_email))
    or coalesce(p_verified_metadata ->> 'order_public_id', '') <> v_order.public_id
    or coalesce(p_verified_metadata ->> 'catalogue_version', '') <> v_order.catalogue_version::text then
    update public.commerce_webhook_events as webhook_event
    set
      processing_status = 'failed',
      processed_at = now(),
      error_message = 'Verified transaction did not match the pending order.'
    where webhook_event.provider = 'paystack' and webhook_event.payload_hash = p_payload_hash;
    return query select 'rejected'::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.commerce_payments (
    order_id,
    paystack_reference,
    paystack_transaction_id,
    status,
    verified_amount_in_subunits,
    verified_currency,
    verification_summary,
    verified_at
  ) values (
    v_order.id,
    p_reference,
    p_transaction_id,
    'success',
    p_verified_amount_in_subunits,
    upper(trim(p_verified_currency)),
    p_verification_summary,
    now()
  ) on conflict (order_id) do update
  set
    paystack_transaction_id = excluded.paystack_transaction_id,
    status = 'success',
    verified_amount_in_subunits = excluded.verified_amount_in_subunits,
    verified_currency = excluded.verified_currency,
    verification_summary = excluded.verification_summary,
    verified_at = excluded.verified_at,
    updated_at = now();

  insert into public.commerce_access_grants (
    order_id,
    token_hash,
    entitlement_snapshot,
    expires_at
  ) values (
    v_order.id,
    p_access_token_hash,
    v_order.entitlement_snapshot,
    p_access_token_expires_at
  ) returning commerce_access_grants.id into v_grant_id;

  update public.commerce_orders as commerce_order
  set
    status = 'fulfilled',
    paid_at = now(),
    fulfilled_at = now(),
    updated_at = now()
  where commerce_order.id = v_order.id
  returning commerce_order.fulfilled_at into v_fulfilled_at;

  insert into public.commerce_fulfillment_outbox (
    order_id,
    job_type,
    payload
  ) values (
    v_order.id,
    'send_delivery_email',
    jsonb_build_object(
      'order_public_id', v_order.public_id,
      'access_grant_id', v_grant_id
    )
  ) on conflict (order_id, job_type) do nothing;

  update public.commerce_webhook_events as webhook_event
  set processing_status = 'processed', processed_at = now()
  where webhook_event.provider = 'paystack' and webhook_event.payload_hash = p_payload_hash;

  return query select 'fulfilled'::text, v_order.public_id, v_grant_id, v_fulfilled_at;
end;
$$;
