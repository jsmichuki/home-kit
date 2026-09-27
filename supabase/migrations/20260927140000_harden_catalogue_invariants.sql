-- Keep paid asset metadata aligned with the private bucket's permitted paths
-- and content types. Existing rows are validated immediately after creation.
alter table public.commerce_guide_assets
  add constraint commerce_guide_assets_storage_key_check
  check (
    storage_object_key ~ '^guides/[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*\.(pdf|xlsx|zip)$'
  ) not valid,
  add constraint commerce_guide_assets_media_type_check
  check (
    media_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip'
    )
  ) not valid;

alter table public.commerce_guide_assets
  validate constraint commerce_guide_assets_storage_key_check,
  validate constraint commerce_guide_assets_media_type_check;

-- An open-ended price represents the current price. A future price must close
-- the previous price first, which prevents two current prices for one SKU.
create unique index if not exists commerce_catalogue_prices_one_open_price_idx
  on public.commerce_catalogue_prices (sku, currency)
  where active_until is null;
