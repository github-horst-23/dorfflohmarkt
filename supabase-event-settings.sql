-- Run once in the Supabase SQL Editor to enable shared event-date settings.
create table if not exists public.event_settings (
  id boolean primary key default true check (id = true),
  event_date date not null default date '2027-09-01'
);

insert into public.event_settings (id, event_date)
values (true, date '2027-09-01')
on conflict (id) do nothing;

alter table public.event_settings enable row level security;
revoke all on public.event_settings from anon, authenticated;
grant select on public.event_settings to anon, authenticated;
grant update on public.event_settings to authenticated;

drop policy if exists "Anyone can read event date" on public.event_settings;
create policy "Anyone can read event date" on public.event_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admins can update event date" on public.event_settings;
create policy "Admins can update event date" on public.event_settings
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_settings'
  ) then
    alter publication supabase_realtime add table public.event_settings;
  end if;
end $$;
