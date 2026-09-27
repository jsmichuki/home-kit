-- The Paystack webhook may attempt delivery immediately after the durable
-- fulfillment transaction commits. Claim only that grant's initial delivery
-- job, so it cannot accidentally process another buyer's queued work.
create or replace function public.commerce_claim_initial_delivery_for_grant(
  p_access_grant_id uuid,
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
  if p_access_grant_id is null
    or p_lease_seconds < 60
    or p_lease_seconds > 3600 then
    raise exception 'A grant ID and a lease between 60 and 3600 seconds are required';
  end if;

  -- Recover only this job when an earlier immediate attempt was interrupted.
  update public.commerce_fulfillment_outbox as outbox
  set
    status = case when outbox.attempts >= 8 then 'failed' else 'pending' end,
    claimed_at = null,
    available_at = case when outbox.attempts >= 8 then outbox.available_at else now() end,
    last_error = coalesce(outbox.last_error, 'Worker lease expired.'),
    updated_at = now()
  where outbox.job_type = 'send_delivery_email'
    and outbox.payload ->> 'access_grant_id' = p_access_grant_id::text
    and outbox.status = 'processing'
    and outbox.claimed_at < now() - make_interval(secs => p_lease_seconds);

  return query
  with candidate as (
    select outbox.id
    from public.commerce_fulfillment_outbox as outbox
    where outbox.job_type = 'send_delivery_email'
      and outbox.payload ->> 'access_grant_id' = p_access_grant_id::text
      and outbox.status = 'pending'
      and outbox.available_at <= now()
    for update skip locked
    limit 1
  )
  update public.commerce_fulfillment_outbox as outbox
  set
    status = 'processing',
    attempts = outbox.attempts + 1,
    claimed_at = now(),
    updated_at = now()
  from candidate
  where outbox.id = candidate.id
  returning outbox.id, outbox.order_id, outbox.job_type, outbox.payload,
    outbox.attempts, outbox.claimed_at;
end;
$$;

revoke all on function public.commerce_claim_initial_delivery_for_grant(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_claim_initial_delivery_for_grant(uuid, integer)
  to service_role;
