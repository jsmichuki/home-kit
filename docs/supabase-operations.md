# Supabase production operations

## Scope

Home Kit uses one production Supabase project. There is no staging project.

## Migration process

1. Create a new timestamped migration with `supabase migration new <change-name>`.
2. Review the SQL for access-control, data, and storage effects.
3. Test it locally when a local Supabase runtime is available.
4. Confirm the production backup and recovery point before any material data change.
5. Preview the remote change with `supabase db push --linked --dry-run`.
6. Apply it with `supabase db push --linked`.
7. Verify it appears in `supabase migration list --linked`.
8. Run `npm run lint:db` against the linked production schema.

## Verification commands

- `npm run test:db` runs the TAP database/RLS suite against a local Supabase runtime. It requires Docker or Podman and a prior `supabase start`.
- `npm run test:db:linked` runs the same transaction-wrapped, read-only assertion suite against the linked production project. It verifies deployed RLS, roles, and catalogue constraints without relying on a local image runtime.
- `npm run lint:db` checks the linked production database schema for Supabase lint findings. It is read-only.
- `npm run verify` runs the browser-selector tests, lint, and production build. It does not contact Supabase.

Never edit a migration that has already been applied to production. Make a new forward-fix migration instead. For a bad production migration, stop dependent releases, preserve evidence, create a narrowly scoped forward fix, apply it, and record the incident and recovery action.

## Secrets

Keep `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only in local `.env.local` files and the production deployment secret store. Never add an actual secret to source control, browser code, logs, tests, or issue trackers.

## Production safeguards

Before enabling live payments, enable SSL enforcement, review network restrictions, protect every Supabase owner account with MFA, and keep at least two organization owners. Confirm the backup and recovery options that apply to the selected Supabase plan before a material migration. See the broader [operations runbook](./operations-runbook.md) for alerting, retention, secret rotation, and incident procedures.
