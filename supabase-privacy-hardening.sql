-- Run in the Supabase SQL Editor to ensure registration PII cannot be read publicly.
alter table public.admin_users enable row level security;
alter table public.stand_registrations enable row level security;
alter table public.published_stands enable row level security;

revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.stand_registrations from public, anon, authenticated;
revoke all on public.published_stands from public, anon, authenticated;
grant select (user_id) on public.admin_users to authenticated;
grant insert on public.stand_registrations to anon, authenticated;
grant select on public.stand_registrations to authenticated;
grant select (id, created_at, address, categories, food_available, food_description, description, lat, lng)
  on public.published_stands to anon, authenticated;
grant update, delete on public.published_stands to authenticated;

do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('admin_users', 'stand_registrations', 'published_stands')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy "Admins can see their own admin marker" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Public can submit pending applications" on public.stand_registrations
  for insert to anon, authenticated with check (status = 'pending');
create policy "Admins can review applications" on public.stand_registrations
  for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Public can read published stands" on public.published_stands
  for select to anon, authenticated using (true);
create policy "Admins can manage published stands" on public.published_stands
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
