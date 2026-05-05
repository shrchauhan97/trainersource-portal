# Supabase Migrations

Apply via Supabase Dashboard → SQL Editor → paste file contents → Run.
Filenames are `YYYY-MM-DD-<feature>.sql`. Every file must be idempotent
(uses `IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN duplicate_object` pattern).

`schema.sql` at the parent directory holds the full schema for dev seeding;
every new migration's DDL must also be appended there so a fresh dev project
can be stood up from `schema.sql` alone.
