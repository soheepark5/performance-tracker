-- ============================================================================
--  Capacity — Supabase schema
--  Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--  Safe to re-run: every statement is idempotent.
-- ============================================================================
--
--  Design note. The database stores and syncs; it never computes. Every stage,
--  threshold and bottleneck is derived in the frontend from raw rows, so
--  Postgres does not need to understand the measurement model at all. That is
--  why the evolving parts live in JSONB and only the stable dimensions —  who,
--  when, what kind — are real columns: the model can keep changing through 2028
--  without a single schema migration.
--
--  Security. Row Level Security is the only thing protecting this data: the
--  anon key shipped to the browser is public by design. Every policy below is
--  scoped to auth.uid(), so a signed-in user can reach their own rows and
--  nothing else. Never put a service-role key in the frontend.

-- ---------------------------------------------------------------- config ---
-- One small document per user: settings, the five lifts, anchor protocols.
create table if not exists public.capacity_config (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ days ---
-- One row per calendar day: morning, evening, attention samples.
create table if not exists public.capacity_days (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  day        date        not null,
  payload    jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists capacity_days_user_day_idx
  on public.capacity_days (user_id, day desc);

-- --------------------------------------------------------------- records ---
-- Everything else, discriminated by `kind`:
--   workout | weekly | target | anchor | stress | impulse | focus
-- `record_id` is the app's own identifier (a uid, or the week's Monday for
-- weekly checks and intensity targets). `occurred_on` is a real date so rows
-- can be ordered and windowed in SQL without opening the payload.
create table if not exists public.capacity_records (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null,
  record_id   text        not null,
  occurred_on date,
  payload     jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind, record_id),
  constraint capacity_records_kind_check
    check (kind in ('workout', 'weekly', 'target', 'anchor', 'stress', 'impulse', 'focus'))
);

create index if not exists capacity_records_user_kind_idx
  on public.capacity_records (user_id, kind, occurred_on desc);

-- ------------------------------------------------------- updated_at touch ---
-- Set on every write, so incremental sync stays available later without
-- another migration.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists capacity_config_touch on public.capacity_config;
create trigger capacity_config_touch
  before update on public.capacity_config
  for each row execute function public.touch_updated_at();

drop trigger if exists capacity_days_touch on public.capacity_days;
create trigger capacity_days_touch
  before update on public.capacity_days
  for each row execute function public.touch_updated_at();

drop trigger if exists capacity_records_touch on public.capacity_records;
create trigger capacity_records_touch
  before update on public.capacity_records
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------ row level security ---
alter table public.capacity_config  enable row level security;
alter table public.capacity_days    enable row level security;
alter table public.capacity_records enable row level security;

-- One policy per operation per table. `using` governs which existing rows are
-- visible to select/update/delete; `with check` governs what may be written,
-- which is what stops a client inserting a row under someone else's user_id.

-- config
drop policy if exists capacity_config_select on public.capacity_config;
create policy capacity_config_select on public.capacity_config
  for select using (auth.uid() = user_id);

drop policy if exists capacity_config_insert on public.capacity_config;
create policy capacity_config_insert on public.capacity_config
  for insert with check (auth.uid() = user_id);

drop policy if exists capacity_config_update on public.capacity_config;
create policy capacity_config_update on public.capacity_config
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists capacity_config_delete on public.capacity_config;
create policy capacity_config_delete on public.capacity_config
  for delete using (auth.uid() = user_id);

-- days
drop policy if exists capacity_days_select on public.capacity_days;
create policy capacity_days_select on public.capacity_days
  for select using (auth.uid() = user_id);

drop policy if exists capacity_days_insert on public.capacity_days;
create policy capacity_days_insert on public.capacity_days
  for insert with check (auth.uid() = user_id);

drop policy if exists capacity_days_update on public.capacity_days;
create policy capacity_days_update on public.capacity_days
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists capacity_days_delete on public.capacity_days;
create policy capacity_days_delete on public.capacity_days
  for delete using (auth.uid() = user_id);

-- records
drop policy if exists capacity_records_select on public.capacity_records;
create policy capacity_records_select on public.capacity_records
  for select using (auth.uid() = user_id);

drop policy if exists capacity_records_insert on public.capacity_records;
create policy capacity_records_insert on public.capacity_records
  for insert with check (auth.uid() = user_id);

drop policy if exists capacity_records_update on public.capacity_records;
create policy capacity_records_update on public.capacity_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists capacity_records_delete on public.capacity_records;
create policy capacity_records_delete on public.capacity_records
  for delete using (auth.uid() = user_id);

-- ============================================================================
--  After running this:
--    Authentication -> Providers -> Email: enable it, and turn "Confirm email"
--    OFF. That is the entire auth setup. The app signs in with email and
--    password, so there are no email templates to edit, no SMTP to configure
--    and no redirect URLs to allow-list.
--
--    Anyone with valid credentials can sign in; the policies below are what
--    keep each account to its own rows. To stop new accounts being created,
--    turn "Enable email signups" off once yours exists.
--
-- ============================================================================
