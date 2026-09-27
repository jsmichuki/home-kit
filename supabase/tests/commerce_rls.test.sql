begin;

\echo 1..18

select case when (
  select relrowsecurity from pg_class where oid = 'public.commerce_guides'::regclass
) then 'ok 1 - commerce guides has row level security enabled'
else 'not ok 1 - commerce guides has row level security enabled' end;

select case when (
  select relrowsecurity from pg_class where oid = 'public.commerce_orders'::regclass
) then 'ok 2 - commerce orders has row level security enabled'
else 'not ok 2 - commerce orders has row level security enabled' end;

select case when (
  select relrowsecurity from pg_class where oid = 'public.commerce_access_grants'::regclass
) then 'ok 3 - commerce access grants has row level security enabled'
else 'not ok 3 - commerce access grants has row level security enabled' end;

select case when (
  select relrowsecurity from pg_class where oid = 'public.commerce_fulfillment_outbox'::regclass
) then 'ok 4 - commerce fulfillment outbox has row level security enabled'
else 'not ok 4 - commerce fulfillment outbox has row level security enabled' end;

select case when not has_table_privilege('anon', 'public.commerce_guides', 'select')
then 'ok 5 - anon cannot read the guide catalogue directly'
else 'not ok 5 - anon cannot read the guide catalogue directly' end;

select case when not has_table_privilege('anon', 'public.commerce_orders', 'select')
then 'ok 6 - anon cannot read orders'
else 'not ok 6 - anon cannot read orders' end;

select case when not has_table_privilege('anon', 'public.commerce_access_grants', 'select')
then 'ok 7 - anon cannot read access grants'
else 'not ok 7 - anon cannot read access grants' end;

select case when not has_table_privilege('anon', 'public.commerce_payments', 'select')
then 'ok 8 - anon cannot read payments'
else 'not ok 8 - anon cannot read payments' end;

select case when not has_table_privilege('authenticated', 'public.commerce_guides', 'select')
then 'ok 9 - authenticated users cannot read the guide catalogue directly'
else 'not ok 9 - authenticated users cannot read the guide catalogue directly' end;

select case when not has_table_privilege('authenticated', 'public.commerce_orders', 'select')
then 'ok 10 - authenticated users cannot read orders'
else 'not ok 10 - authenticated users cannot read orders' end;

select case when not has_table_privilege('authenticated', 'public.commerce_access_grants', 'select')
then 'ok 11 - authenticated users cannot read access grants'
else 'not ok 11 - authenticated users cannot read access grants' end;

select case when not has_table_privilege('authenticated', 'public.commerce_payments', 'select')
then 'ok 12 - authenticated users cannot read payments'
else 'not ok 12 - authenticated users cannot read payments' end;

select case when has_table_privilege('service_role', 'public.commerce_orders', 'select')
then 'ok 13 - service role can read orders for trusted server work'
else 'not ok 13 - service role can read orders for trusted server work' end;

select case when has_table_privilege('service_role', 'public.commerce_access_grants', 'select')
then 'ok 14 - service role can read grants for trusted server work'
else 'not ok 14 - service role can read grants for trusted server work' end;

select case when has_table_privilege('service_role', 'public.commerce_fulfillment_outbox', 'update')
then 'ok 15 - service role can claim fulfillment work'
else 'not ok 15 - service role can claim fulfillment work' end;

select case when exists (
  select 1
  from pg_constraint
  where conname = 'commerce_guide_assets_storage_key_check'
) then 'ok 16 - guide asset keys are restricted to the private guide path convention'
else 'not ok 16 - guide asset keys are restricted to the private guide path convention' end;

select case when exists (
  select 1
  from pg_constraint
  where conname = 'commerce_guide_assets_media_type_check'
) then 'ok 17 - guide asset metadata is restricted to supported delivery media types'
else 'not ok 17 - guide asset metadata is restricted to supported delivery media types' end;

select case when exists (
  select 1
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'commerce_catalogue_prices_one_open_price_idx'
) then 'ok 18 - only one open-ended price can exist for a catalogue SKU and currency'
else 'not ok 18 - only one open-ended price can exist for a catalogue SKU and currency' end;

rollback;
