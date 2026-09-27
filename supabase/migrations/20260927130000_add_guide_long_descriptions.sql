alter table public.commerce_guides
  add column if not exists long_description text;

update public.commerce_guides
set long_description = case slug
  when 'first-month-home-setup' then 'Use this guide to organize the tasks that matter immediately after closing, from securing entry points to locating home systems and setting up essential services.'
  when 'first-year-home-maintenance' then 'Build a realistic maintenance rhythm for the first year, with a clear tracker for recurring tasks and seasonal checks.'
  when 'home-emergency-binder' then 'Create one dependable place for emergency contacts, household safety details, shutoff information, and important response plans.'
  when 'homeowner-budget-repair' then 'Plan ownership costs, set aside a repair reserve, and use editable worksheets to make repair decisions with a clearer picture of your budget.'
  when 'contractor-hiring-home-repair' then 'Use practical prompts and editable comparison tools to define work, assess quotes, and keep a home repair project organized.'
  when 'home-renovation-improvement' then 'Turn an improvement idea into a prioritized, budget-aware plan before committing to renovation work or contractor conversations.'
  when 'home-records-warranty' then 'Keep appliance, warranty, service, and household records organized so important information is ready when you need it.'
  when 'seasonal-home-care' then 'Follow a practical seasonal routine that helps you prepare your home for changing weather and prevent overlooked maintenance tasks.'
end
where slug in (
  'first-month-home-setup',
  'first-year-home-maintenance',
  'home-emergency-binder',
  'homeowner-budget-repair',
  'contractor-hiring-home-repair',
  'home-renovation-improvement',
  'home-records-warranty',
  'seasonal-home-care'
);

alter table public.commerce_guides
  alter column long_description set not null,
  add constraint commerce_guides_long_description_length
    check (char_length(long_description) between 1 and 2000);
