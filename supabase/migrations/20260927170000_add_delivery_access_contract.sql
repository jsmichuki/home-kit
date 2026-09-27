create table if not exists public.commerce_access_resend_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists commerce_access_resend_requests_email_created_idx
  on public.commerce_access_resend_requests (email_hash, created_at desc);
create index if not exists commerce_access_resend_requests_ip_created_idx
  on public.commerce_access_resend_requests (ip_hash, created_at desc);

alter table public.commerce_fulfillment_outbox
  add column if not exists delivery_request_id uuid references public.commerce_access_resend_requests(id) on delete restrict;

alter table public.commerce_fulfillment_outbox
  drop constraint if exists commerce_fulfillment_outbox_job_type_check,
  drop constraint if exists commerce_fulfillment_outbox_order_id_job_type_key;

alter table public.commerce_fulfillment_outbox
  add constraint commerce_fulfillment_outbox_job_type_check
  check (job_type in ('send_delivery_email', 'send_delivery_email_resend')),
  add constraint commerce_fulfillment_outbox_delivery_request_check
  check (
    (job_type = 'send_delivery_email' and delivery_request_id is null)
    or
    (job_type = 'send_delivery_email_resend' and delivery_request_id is not null)
  );

create unique index if not exists commerce_outbox_initial_delivery_unique_idx
  on public.commerce_fulfillment_outbox (order_id, job_type)
  where job_type = 'send_delivery_email';

create unique index if not exists commerce_outbox_resend_delivery_unique_idx
  on public.commerce_fulfillment_outbox (order_id, job_type, delivery_request_id)
  where job_type = 'send_delivery_email_resend';

alter table public.commerce_email_deliveries
  add column if not exists provider_response jsonb not null default '{}'::jsonb
  check (jsonb_typeof(provider_response) = 'object');

alter table public.commerce_access_resend_requests enable row level security;
revoke all on table public.commerce_access_resend_requests from anon, authenticated;
grant all on table public.commerce_access_resend_requests to service_role;
