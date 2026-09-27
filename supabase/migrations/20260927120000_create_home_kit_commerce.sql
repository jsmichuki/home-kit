create extension if not exists pgcrypto with schema extensions;

create table if not exists public.commerce_guides (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  short_description text not null check (char_length(short_description) between 1 and 500),
  is_active boolean not null default true,
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_guide_assets (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.commerce_guides(id) on delete cascade,
  version integer not null check (version > 0),
  storage_bucket text not null default 'paid-guides' check (storage_bucket = 'paid-guides'),
  storage_object_key text not null unique,
  display_name text not null,
  media_type text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  created_at timestamptz not null default now(),
  unique (guide_id, version, storage_object_key)
);

create table if not exists public.commerce_bundles (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  short_description text not null check (char_length(short_description) between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_bundle_guides (
  bundle_id uuid not null references public.commerce_bundles(id) on delete cascade,
  guide_id uuid not null references public.commerce_guides(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (bundle_id, guide_id)
);

create table if not exists public.commerce_catalogue_prices (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  guide_id uuid references public.commerce_guides(id) on delete restrict,
  bundle_id uuid references public.commerce_bundles(id) on delete restrict,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_in_subunits integer not null check (amount_in_subunits >= 0),
  catalogue_version integer not null default 1 check (catalogue_version > 0),
  active_from timestamptz not null default now(),
  active_until timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(guide_id, bundle_id) = 1),
  check (active_until is null or active_until > active_from),
  unique (sku, currency, active_from)
);

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^ord_[a-zA-Z0-9]+$'),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  selected_items jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_items) = 'array'),
  entitlement_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(entitlement_snapshot) = 'array'),
  catalogue_version integer not null check (catalogue_version > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_in_subunits integer not null check (amount_in_subunits >= 0),
  status text not null default 'payment_pending' check (status in ('payment_pending', 'paid', 'fulfilled', 'failed', 'abandoned', 'cancelled', 'refunded')),
  paystack_reference text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.commerce_orders(id) on delete restrict,
  paystack_reference text not null unique,
  paystack_transaction_id bigint,
  status text not null check (status in ('pending', 'success', 'failed', 'abandoned', 'reversed')),
  verified_amount_in_subunits integer,
  verified_currency char(3),
  verification_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(verification_summary) = 'object'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_access_grants (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.commerce_orders(id) on delete restrict,
  token_hash text not null unique,
  entitlement_snapshot jsonb not null check (jsonb_typeof(entitlement_snapshot) = 'array'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  check (expires_at > issued_at)
);

create table if not exists public.commerce_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('paystack', 'resend')),
  provider_event_id text,
  payload_hash text not null,
  reference text,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (provider, payload_hash),
  unique (provider, provider_event_id)
);

create table if not exists public.commerce_fulfillment_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete restrict,
  job_type text not null check (job_type in ('send_delivery_email')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, job_type)
);

create table if not exists public.commerce_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete restrict,
  access_grant_id uuid references public.commerce_access_grants(id) on delete set null,
  message_type text not null check (message_type in ('delivery_link', 'delivery_link_resend')),
  resend_email_id text unique,
  resend_idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_resend_events (
  id uuid primary key default gen_random_uuid(),
  resend_event_id text not null unique,
  resend_email_id text,
  event_type text not null,
  payload_hash text not null unique,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  error_message text
);

create table if not exists public.commerce_download_events (
  id uuid primary key default gen_random_uuid(),
  access_grant_id uuid not null references public.commerce_access_grants(id) on delete restrict,
  guide_id uuid not null references public.commerce_guides(id) on delete restrict,
  guide_asset_id uuid references public.commerce_guide_assets(id) on delete set null,
  event_type text not null check (event_type in ('signed_url_issued', 'download_requested')),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists commerce_orders_paystack_reference_idx
  on public.commerce_orders (paystack_reference);
create index if not exists commerce_access_grants_token_hash_idx
  on public.commerce_access_grants (token_hash);
create index if not exists commerce_outbox_available_idx
  on public.commerce_fulfillment_outbox (status, available_at)
  where status in ('pending', 'processing');
create index if not exists commerce_email_resend_email_idx
  on public.commerce_email_deliveries (resend_email_id)
  where resend_email_id is not null;
create index if not exists commerce_resend_events_email_idx
  on public.commerce_resend_events (resend_email_id)
  where resend_email_id is not null;
create index if not exists commerce_guide_assets_guide_idx
  on public.commerce_guide_assets (guide_id, version);

create or replace function public.commerce_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commerce_guides_set_updated_at on public.commerce_guides;
create trigger commerce_guides_set_updated_at
before update on public.commerce_guides
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_bundles_set_updated_at on public.commerce_bundles;
create trigger commerce_bundles_set_updated_at
before update on public.commerce_bundles
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_orders_set_updated_at on public.commerce_orders;
create trigger commerce_orders_set_updated_at
before update on public.commerce_orders
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_payments_set_updated_at on public.commerce_payments;
create trigger commerce_payments_set_updated_at
before update on public.commerce_payments
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_outbox_set_updated_at on public.commerce_fulfillment_outbox;
create trigger commerce_outbox_set_updated_at
before update on public.commerce_fulfillment_outbox
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_email_deliveries_set_updated_at on public.commerce_email_deliveries;
create trigger commerce_email_deliveries_set_updated_at
before update on public.commerce_email_deliveries
for each row execute function public.commerce_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paid-guides',
  'paid-guides',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.commerce_guides (id, slug, title, short_description)
values
  ('ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75', 'first-month-home-setup', 'First 30 Days in Your New Home', 'A practical checklist for your first month of homeownership.'),
  ('65552c2c-ec08-4aa8-9d60-e5d9e9451daf', 'first-year-home-maintenance', 'First Year Home Maintenance System', 'Plan the routines that keep your home in good condition.'),
  ('c647987e-3eba-4da7-bd6e-3313d2aaf518', 'home-emergency-binder', 'Home Safety and Emergency Binder', 'Keep emergency information and home safety plans together.'),
  ('e8507a23-4892-4cf1-8fa8-5dd386498e30', 'homeowner-budget-repair', 'Homeowner Budget and Repair Planner', 'Prepare for regular costs and unexpected repairs.'),
  ('32e97c48-0bf1-4259-9cf4-9f83b49d415d', 'contractor-hiring-home-repair', 'Contractor Hiring and Home Repair Toolkit', 'Make confident decisions before starting home repairs.'),
  ('8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e', 'home-renovation-improvement', 'Home Renovation and Improvement Planner', 'Turn an improvement idea into a manageable plan.'),
  ('7ad05bc0-6252-418c-bb0a-95ce70eeb81b', 'home-records-warranty', 'Home Records and Warranty Organizer', 'Organize the records that make future repairs simpler.'),
  ('4a4478d7-fd4b-43e6-ab98-bdb655fc502f', 'seasonal-home-care', 'Seasonal Home Care Pack', 'Stay ahead of seasonal tasks throughout the year.')
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  short_description = excluded.short_description;

insert into public.commerce_guide_assets (
  guide_id,
  version,
  storage_object_key,
  display_name,
  media_type,
  file_size_bytes
)
values
  ('ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75', 1, 'guides/first-month-home-setup/first-month-home-setup-checklist.pdf', 'First Month Home Setup Checklist.pdf', 'application/pdf', 25656319),
  ('ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75', 1, 'guides/first-month-home-setup/first-month-home-setup-checklist.xlsx', 'First Month Home Setup Checklist.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 7444),
  ('65552c2c-ec08-4aa8-9d60-e5d9e9451daf', 1, 'guides/first-year-home-maintenance/first-year-home-maintenance-system.pdf', 'First Year Home Maintenance System.pdf', 'application/pdf', 29218596),
  ('65552c2c-ec08-4aa8-9d60-e5d9e9451daf', 1, 'guides/first-year-home-maintenance/first-year-home-maintenance-tracker.xlsx', 'First Year Home Maintenance Tracker.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8034),
  ('c647987e-3eba-4da7-bd6e-3313d2aaf518', 1, 'guides/home-emergency-binder/home-emergency-binder.pdf', 'Home Emergency Binder.pdf', 'application/pdf', 15806858),
  ('c647987e-3eba-4da7-bd6e-3313d2aaf518', 1, 'guides/home-emergency-binder/home-emergency-binder.xlsx', 'Home Emergency Binder.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 7751),
  ('e8507a23-4892-4cf1-8fa8-5dd386498e30', 1, 'guides/homeowner-budget-repair/homeowner-budget-repair-planner.pdf', 'Homeowner Budget and Repair Planner.pdf', 'application/pdf', 20735192),
  ('e8507a23-4892-4cf1-8fa8-5dd386498e30', 1, 'guides/homeowner-budget-repair/homeowner-budget-repair-planner.xlsx', 'Homeowner Budget and Repair Planner.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8103),
  ('32e97c48-0bf1-4259-9cf4-9f83b49d415d', 1, 'guides/contractor-hiring-home-repair/contractor-hiring-home-repair-toolkit.pdf', 'Contractor Hiring and Home Repair Toolkit.pdf', 'application/pdf', 23751271),
  ('32e97c48-0bf1-4259-9cf4-9f83b49d415d', 1, 'guides/contractor-hiring-home-repair/contractor-hiring-home-repair-toolkit.xlsx', 'Contractor Hiring and Home Repair Toolkit.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 7083),
  ('8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e', 1, 'guides/home-renovation-improvement/home-renovation-improvement-planner.pdf', 'Home Renovation Improvement Planner.pdf', 'application/pdf', 32374563),
  ('8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e', 1, 'guides/home-renovation-improvement/home-renovation-improvement-planner.xlsx', 'Home Renovation Improvement Planner.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8710),
  ('7ad05bc0-6252-418c-bb0a-95ce70eeb81b', 1, 'guides/home-records-warranty/home-records-warranty-organizer.pdf', 'Home Records and Warranty Organizer.pdf', 'application/pdf', 23969394),
  ('7ad05bc0-6252-418c-bb0a-95ce70eeb81b', 1, 'guides/home-records-warranty/home-records-warranty-organizer.xlsx', 'Home Records and Warranty Organizer.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 11190),
  ('4a4478d7-fd4b-43e6-ab98-bdb655fc502f', 1, 'guides/seasonal-home-care/seasonal-home-care-pack.pdf', 'Seasonal Home Care Pack.pdf', 'application/pdf', 43691726),
  ('4a4478d7-fd4b-43e6-ab98-bdb655fc502f', 1, 'guides/seasonal-home-care/seasonal-home-care-pack.xlsx', 'Seasonal Home Care Pack.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 6580)
on conflict (storage_object_key) do update
set
  display_name = excluded.display_name,
  media_type = excluded.media_type,
  file_size_bytes = excluded.file_size_bytes;

insert into public.commerce_bundles (id, slug, title, short_description)
values (
  '8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38',
  'complete-new-homeowner-system',
  'Complete New Homeowner System',
  'All eight homeowner guides and their editable workbooks.'
)
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  short_description = excluded.short_description;

insert into public.commerce_bundle_guides (bundle_id, guide_id)
values
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', 'ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', '65552c2c-ec08-4aa8-9d60-e5d9e9451daf'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', 'c647987e-3eba-4da7-bd6e-3313d2aaf518'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', 'e8507a23-4892-4cf1-8fa8-5dd386498e30'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', '32e97c48-0bf1-4259-9cf4-9f83b49d415d'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', '8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', '7ad05bc0-6252-418c-bb0a-95ce70eeb81b'),
  ('8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38', '4a4478d7-fd4b-43e6-ab98-bdb655fc502f')
on conflict do nothing;

insert into public.commerce_catalogue_prices (sku, guide_id, currency, amount_in_subunits, catalogue_version, active_from)
values
  ('guide:first-month-home-setup', 'ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75', 'USD', 1200, 1, '2026-09-27T00:00:00Z'),
  ('guide:first-year-home-maintenance', '65552c2c-ec08-4aa8-9d60-e5d9e9451daf', 'USD', 2400, 1, '2026-09-27T00:00:00Z'),
  ('guide:home-emergency-binder', 'c647987e-3eba-4da7-bd6e-3313d2aaf518', 'USD', 1500, 1, '2026-09-27T00:00:00Z'),
  ('guide:homeowner-budget-repair', 'e8507a23-4892-4cf1-8fa8-5dd386498e30', 'USD', 1900, 1, '2026-09-27T00:00:00Z'),
  ('guide:contractor-hiring-home-repair', '32e97c48-0bf1-4259-9cf4-9f83b49d415d', 'USD', 1900, 1, '2026-09-27T00:00:00Z'),
  ('guide:home-renovation-improvement', '8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e', 'USD', 2400, 1, '2026-09-27T00:00:00Z'),
  ('guide:home-records-warranty', '7ad05bc0-6252-418c-bb0a-95ce70eeb81b', 'USD', 1500, 1, '2026-09-27T00:00:00Z'),
  ('guide:seasonal-home-care', '4a4478d7-fd4b-43e6-ab98-bdb655fc502f', 'USD', 1500, 1, '2026-09-27T00:00:00Z')
on conflict (sku, currency, active_from) do nothing;

insert into public.commerce_catalogue_prices (sku, bundle_id, currency, amount_in_subunits, catalogue_version, active_from)
values (
  'bundle:complete-new-homeowner-system',
  '8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38',
  'USD',
  6900,
  1,
  '2026-09-27T00:00:00Z'
)
on conflict (sku, currency, active_from) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commerce_guides',
    'commerce_guide_assets',
    'commerce_bundles',
    'commerce_bundle_guides',
    'commerce_catalogue_prices',
    'commerce_orders',
    'commerce_payments',
    'commerce_access_grants',
    'commerce_webhook_events',
    'commerce_fulfillment_outbox',
    'commerce_email_deliveries',
    'commerce_resend_events',
    'commerce_download_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;
