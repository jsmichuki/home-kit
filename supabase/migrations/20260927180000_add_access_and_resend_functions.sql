create or replace function public.commerce_lookup_active_access_grant(
  p_token_hash text
)
returns table (
  access_grant_id uuid,
  order_id uuid,
  order_public_id text,
  customer_email text,
  expires_at timestamptz,
  entitlement_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_token_hash, '') !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  return query
  with active_grant as (
    update public.commerce_access_grants as access_grant
    set last_accessed_at = now()
    from public.commerce_orders as commerce_order
    where access_grant.token_hash = p_token_hash
      and access_grant.order_id = commerce_order.id
      and access_grant.revoked_at is null
      and access_grant.expires_at > now()
      and commerce_order.status = 'fulfilled'
    returning access_grant.id, access_grant.order_id, access_grant.expires_at,
      access_grant.entitlement_snapshot
  )
  select active_grant.id, active_grant.order_id, commerce_order.public_id,
    commerce_order.customer_email, active_grant.expires_at,
    active_grant.entitlement_snapshot
  from active_grant
  join public.commerce_orders as commerce_order on commerce_order.id = active_grant.order_id;
end;
$$;

create or replace function public.commerce_record_download_event(
  p_access_grant_id uuid,
  p_guide_id uuid,
  p_guide_asset_id uuid,
  p_event_type text,
  p_ip_hash text,
  p_user_agent text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in ('signed_url_issued', 'download_requested')
    or coalesce(p_ip_hash, '') !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  if not exists (
    select 1
    from public.commerce_access_grants as access_grant
    join public.commerce_orders as commerce_order on commerce_order.id = access_grant.order_id
    join public.commerce_guide_assets as guide_asset
      on guide_asset.id = p_guide_asset_id
      and guide_asset.guide_id = p_guide_id
    where access_grant.id = p_access_grant_id
      and access_grant.revoked_at is null
      and access_grant.expires_at > now()
      and commerce_order.status = 'fulfilled'
      and access_grant.entitlement_snapshot @> jsonb_build_array(
        jsonb_build_object('guide_id', p_guide_id::text)
      )
  ) then
    return false;
  end if;

  insert into public.commerce_download_events (
    access_grant_id,
    guide_id,
    guide_asset_id,
    event_type,
    ip_hash,
    user_agent
  ) values (
    p_access_grant_id,
    p_guide_id,
    p_guide_asset_id,
    p_event_type,
    p_ip_hash,
    left(coalesce(p_user_agent, ''), 512)
  );

  return true;
end;
$$;

create or replace function public.commerce_request_access_resend(
  p_normalized_email text,
  p_email_hash text,
  p_ip_hash text
)
returns table (accepted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_email_count integer;
  v_ip_count integer;
begin
  if coalesce(p_normalized_email, '') = ''
    or coalesce(p_email_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_ip_hash, '') !~ '^[a-f0-9]{64}$' then
    return query select true;
    return;
  end if;

  insert into public.commerce_access_resend_requests (email_hash, ip_hash)
  values (p_email_hash, p_ip_hash)
  returning id into v_request_id;

  select count(*) into v_email_count
  from public.commerce_access_resend_requests
  where email_hash = p_email_hash
    and created_at >= now() - interval '1 hour';

  select count(*) into v_ip_count
  from public.commerce_access_resend_requests
  where ip_hash = p_ip_hash
    and created_at >= now() - interval '1 hour';

  if v_email_count > 3 or v_ip_count > 10 then
    return query select true;
    return;
  end if;

  insert into public.commerce_fulfillment_outbox (
    order_id,
    job_type,
    delivery_request_id,
    payload
  )
  select
    commerce_order.id,
    'send_delivery_email_resend',
    v_request_id,
    jsonb_build_object(
      'access_grant_id', access_grant.id,
      'delivery_request_id', v_request_id,
      'message_type', 'delivery_link_resend',
      'order_public_id', commerce_order.public_id
    )
  from public.commerce_orders as commerce_order
  join public.commerce_access_grants as access_grant on access_grant.order_id = commerce_order.id
  where lower(trim(commerce_order.customer_email)) = lower(trim(p_normalized_email))
    and commerce_order.status = 'fulfilled'
    and access_grant.revoked_at is null
    and access_grant.expires_at > now()
  on conflict do nothing;

  return query select true;
end;
$$;

create or replace function public.commerce_prepare_delivery_email(
  p_order_id uuid,
  p_access_grant_id uuid,
  p_idempotency_key text,
  p_message_type text,
  p_delivery_request_id uuid default null
)
returns table (
  delivery_email text,
  order_public_id text,
  paystack_reference text,
  selected_items jsonb,
  amount_in_subunits integer,
  currency char(3),
  access_grant_expires_at timestamptz,
  resend_idempotency_key text,
  resend_email_id text,
  delivery_status text,
  attempts integer,
  should_send boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.commerce_email_deliveries%rowtype;
  v_order public.commerce_orders%rowtype;
  v_grant public.commerce_access_grants%rowtype;
  v_should_send boolean := false;
begin
  if p_message_type not in ('delivery_link', 'delivery_link_resend')
    or coalesce(nullif(trim(p_idempotency_key), ''), '') = '' then
    return;
  end if;

  select * into v_order
  from public.commerce_orders as commerce_order
  where commerce_order.id = p_order_id
    and commerce_order.status = 'fulfilled';
  if not found then
    return;
  end if;

  select * into v_grant
  from public.commerce_access_grants as access_grant
  where access_grant.id = p_access_grant_id
    and access_grant.order_id = v_order.id
    and access_grant.revoked_at is null
    and access_grant.expires_at > now();
  if not found then
    return;
  end if;

  if (p_message_type = 'delivery_link' and p_delivery_request_id is not null)
    or (p_message_type = 'delivery_link_resend' and p_delivery_request_id is null) then
    return;
  end if;

  insert into public.commerce_email_deliveries (
    order_id,
    access_grant_id,
    message_type,
    resend_idempotency_key
  ) values (
    v_order.id,
    v_grant.id,
    p_message_type,
    p_idempotency_key
  ) on conflict (resend_idempotency_key) do nothing;

  select * into v_delivery
  from public.commerce_email_deliveries as email_delivery
  where email_delivery.resend_idempotency_key = p_idempotency_key
  for update;

  if v_delivery.resend_email_id is null
    and v_delivery.status in ('pending', 'failed') then
    update public.commerce_email_deliveries as email_delivery
    set attempts = email_delivery.attempts + 1,
      status = 'pending',
      updated_at = now()
    where email_delivery.id = v_delivery.id
    returning * into v_delivery;
    v_should_send := true;
  end if;

  return query select
    v_order.customer_email,
    v_order.public_id,
    v_order.paystack_reference,
    v_order.selected_items,
    v_order.amount_in_subunits,
    v_order.currency,
    v_grant.expires_at,
    v_delivery.resend_idempotency_key,
    v_delivery.resend_email_id,
    v_delivery.status,
    v_delivery.attempts,
    v_should_send;
end;
$$;

create or replace function public.commerce_record_resend_send_result(
  p_order_id uuid,
  p_idempotency_key text,
  p_resend_email_id text,
  p_provider_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(trim(p_resend_email_id), ''), '') = ''
    or jsonb_typeof(p_provider_response) <> 'object' then
    return false;
  end if;

  update public.commerce_email_deliveries as email_delivery
  set resend_email_id = p_resend_email_id,
    provider_response = p_provider_response,
    status = 'sent',
    sent_at = now(),
    last_error = null,
    updated_at = now()
  where email_delivery.order_id = p_order_id
    and email_delivery.resend_idempotency_key = p_idempotency_key
    and (email_delivery.resend_email_id is null or email_delivery.resend_email_id = p_resend_email_id);

  return found;
end;
$$;

create or replace function public.commerce_record_resend_send_failure(
  p_order_id uuid,
  p_idempotency_key text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commerce_email_deliveries as email_delivery
  set status = 'pending',
    last_error = left(coalesce(nullif(p_error, ''), 'Email delivery failed.'), 200),
    updated_at = now()
  where email_delivery.order_id = p_order_id
    and email_delivery.resend_idempotency_key = p_idempotency_key
    and email_delivery.resend_email_id is null;

  return found;
end;
$$;

create or replace function public.commerce_record_resend_webhook_event(
  p_resend_event_id text,
  p_resend_email_id text,
  p_event_type text,
  p_payload_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(nullif(trim(p_resend_event_id), ''), '') = ''
    or coalesce(nullif(trim(p_payload_hash), ''), '') = '' then
    return false;
  end if;

  insert into public.commerce_resend_events (
    resend_event_id,
    resend_email_id,
    event_type,
    payload_hash,
    processing_status,
    processed_at
  ) values (
    p_resend_event_id,
    nullif(trim(p_resend_email_id), ''),
    p_event_type,
    p_payload_hash,
    'processed',
    now()
  ) on conflict do nothing;

  if not found then
    return false;
  end if;

  v_status := case p_event_type
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    else null
  end;

  if v_status is not null and nullif(trim(p_resend_email_id), '') is not null then
    update public.commerce_email_deliveries as email_delivery
    set status = v_status,
      updated_at = now()
    where email_delivery.resend_email_id = p_resend_email_id;
  end if;

  return true;
end;
$$;

revoke all on function public.commerce_lookup_active_access_grant(text) from public, anon, authenticated;
revoke all on function public.commerce_record_download_event(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.commerce_request_access_resend(text, text, text) from public, anon, authenticated;
revoke all on function public.commerce_prepare_delivery_email(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.commerce_record_resend_send_result(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.commerce_record_resend_send_failure(uuid, text, text) from public, anon, authenticated;
revoke all on function public.commerce_record_resend_webhook_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.commerce_lookup_active_access_grant(text) to service_role;
grant execute on function public.commerce_record_download_event(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.commerce_request_access_resend(text, text, text) to service_role;
grant execute on function public.commerce_prepare_delivery_email(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.commerce_record_resend_send_result(uuid, text, text, jsonb) to service_role;
grant execute on function public.commerce_record_resend_send_failure(uuid, text, text) to service_role;
grant execute on function public.commerce_record_resend_webhook_event(text, text, text, text) to service_role;
