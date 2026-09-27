-- Keep the base idempotency row as the worker-serialization lock and make
-- that lock observable to PL/pgSQL, avoiding the unused-local lint warning.
create or replace function public.commerce_prepare_delivery_email(
  p_order_id uuid, p_access_grant_id uuid, p_idempotency_key text,
  p_message_type text, p_delivery_request_id uuid default null
)
returns table (
  delivery_email text, order_public_id text, paystack_reference text,
  selected_items jsonb, amount_in_subunits integer, currency char(3),
  access_grant_expires_at timestamptz, resend_idempotency_key text,
  resend_email_id text, delivery_status text, attempts integer, should_send boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_base_delivery public.commerce_email_deliveries%rowtype;
  v_delivery public.commerce_email_deliveries%rowtype;
  v_order public.commerce_orders%rowtype;
  v_grant public.commerce_access_grants%rowtype;
  v_next_key text;
  v_retry_number integer;
  v_should_send boolean := false;
begin
  if p_message_type not in ('delivery_link', 'delivery_link_resend')
    or coalesce(nullif(trim(p_idempotency_key), ''), '') = ''
    or char_length(p_idempotency_key) > 230 then return; end if;

  select * into v_order from public.commerce_orders as commerce_order
  where commerce_order.id = p_order_id and commerce_order.status = 'fulfilled';
  if not found then return; end if;

  select * into v_grant from public.commerce_access_grants as access_grant
  where access_grant.id = p_access_grant_id and access_grant.order_id = v_order.id
    and access_grant.revoked_at is null and access_grant.expires_at > now();
  if not found
    or (p_message_type = 'delivery_link' and p_delivery_request_id is not null)
    or (p_message_type = 'delivery_link_resend' and p_delivery_request_id is null) then return; end if;

  insert into public.commerce_email_deliveries (
    order_id, access_grant_id, message_type, resend_idempotency_key
  ) values (
    v_order.id, v_grant.id, p_message_type, p_idempotency_key
  ) on conflict on constraint commerce_email_deliveries_resend_idempotency_key_key do nothing;

  select * into v_base_delivery from public.commerce_email_deliveries as email_delivery
  where email_delivery.resend_idempotency_key = p_idempotency_key for update;
  if v_base_delivery.id is null then return; end if;

  select * into v_delivery from public.commerce_email_deliveries as email_delivery
  where email_delivery.order_id = v_order.id
    and email_delivery.access_grant_id = v_grant.id
    and email_delivery.message_type = p_message_type
    and (email_delivery.resend_idempotency_key = p_idempotency_key
      or email_delivery.resend_idempotency_key like p_idempotency_key || '/retry/%')
  order by email_delivery.created_at desc, email_delivery.id desc limit 1 for update;

  if v_delivery.resend_email_id is null
    and v_delivery.status in ('pending', 'failed')
    and v_delivery.created_at <= now() - interval '24 hours' then
    update public.commerce_email_deliveries as email_delivery
    set status = 'failed', last_error = 'resend_idempotency_window_expired', updated_at = now()
    where email_delivery.id = v_delivery.id;

    select count(*)::integer + 1 into v_retry_number
    from public.commerce_email_deliveries as email_delivery
    where email_delivery.order_id = v_order.id
      and email_delivery.access_grant_id = v_grant.id
      and email_delivery.message_type = p_message_type
      and email_delivery.resend_idempotency_key like p_idempotency_key || '/retry/%';
    v_next_key := p_idempotency_key || '/retry/' || v_retry_number::text;
    insert into public.commerce_email_deliveries (
      order_id, access_grant_id, message_type, resend_idempotency_key
    ) values (
      v_order.id, v_grant.id, p_message_type, v_next_key
    ) returning * into v_delivery;
  end if;

  if v_delivery.resend_email_id is null and v_delivery.status in ('pending', 'failed') then
    update public.commerce_email_deliveries as email_delivery
    set attempts = email_delivery.attempts + 1, status = 'pending', updated_at = now()
    where email_delivery.id = v_delivery.id returning * into v_delivery;
    v_should_send := true;
  end if;

  return query select
    v_order.customer_email, v_order.public_id, v_order.paystack_reference,
    v_order.selected_items, v_order.amount_in_subunits, v_order.currency,
    v_grant.expires_at, v_delivery.resend_idempotency_key,
    v_delivery.resend_email_id, v_delivery.status, v_delivery.attempts, v_should_send;
end;
$$;
