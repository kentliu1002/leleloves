alter table public.holidays
  add column if not exists source text not null default 'manual',
  add column if not exists source_key text,
  add column if not exists source_year integer,
  add column if not exists source_url text,
  add column if not exists is_disabled boolean not null default false,
  add column if not exists synced_at timestamptz;

alter table public.workday_overrides
  add column if not exists source text not null default 'manual',
  add column if not exists source_key text,
  add column if not exists source_year integer,
  add column if not exists source_url text,
  add column if not exists is_disabled boolean not null default false,
  add column if not exists synced_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holidays_source_check') then
    alter table public.holidays
      add constraint holidays_source_check check (source in ('manual', 'government'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workday_overrides_source_check') then
    alter table public.workday_overrides
      add constraint workday_overrides_source_check check (source in ('manual', 'government'));
  end if;
end $$;

create unique index if not exists holidays_government_source_key
  on public.holidays (source_key)
  where source = 'government' and source_key is not null;

create unique index if not exists workdays_government_source_key
  on public.workday_overrides (source_key)
  where source = 'government' and source_key is not null;

create table if not exists public.calendar_sync_state (
  id text primary key,
  last_success_at timestamptz,
  synced_years integer[] not null default '{}',
  source_urls text[] not null default '{}',
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.calendar_sync_state enable row level security;
