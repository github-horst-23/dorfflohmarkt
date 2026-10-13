-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.stand_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  address text not null check (length(trim(address)) between 5 and 120),
  categories text[] not null check (cardinality(categories) > 0 and cardinality(categories) <= 30),
  food_available text not null default 'Nein' check (food_available in ('Ja', 'Nein')),
  food_description text not null default '' check (length(food_description) <= 500),
  description text not null default '' check (length(description) <= 1000),
  lat double precision,
  lng double precision,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

-- Contains only fields intended for public display. Names and email addresses stay private.
create table if not exists public.published_stands (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.stand_registrations(id) on delete cascade,
  created_at timestamptz not null default now(),
  address text not null,
  categories text[] not null,
  food_available text not null,
  food_description text not null default '',
  description text not null default '',
  lat double precision,
  lng double precision
);

alter table public.admin_users enable row level security;
alter table public.stand_registrations enable row level security;
alter table public.published_stands enable row level security;

revoke all on public.admin_users from anon, authenticated;
revoke all on public.stand_registrations from anon, authenticated;
revoke all on public.published_stands from anon, authenticated;
grant select on public.admin_users to authenticated;
grant insert on public.stand_registrations to anon, authenticated;
grant select on public.stand_registrations to authenticated;
grant select on public.published_stands to anon, authenticated;
grant insert, update, delete on public.published_stands to authenticated;

create policy "Admins can see their own admin marker" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Public can submit pending applications" on public.stand_registrations
  for insert to anon, authenticated with check (status = 'pending');
create policy "Admins can review applications" on public.stand_registrations
  for select to authenticated using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Public can read published stands" on public.published_stands
  for select to anon, authenticated using (true);
create policy "Admins can manage published stands" on public.published_stands
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create or replace function public.approve_stand_registration(registration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.stand_registrations%rowtype;
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select * into r from public.stand_registrations where id = registration_id and status = 'pending' for update;
  if not found then raise exception 'registration_not_pending' using errcode = 'P0002'; end if;
  insert into public.published_stands(registration_id,address,categories,food_available,food_description,description,lat,lng)
  values(r.id,r.address,r.categories,r.food_available,r.food_description,r.description,r.lat,r.lng);
  update public.stand_registrations set status = 'approved' where id = r.id;
end;
$$;

create or replace function public.reject_stand_registration(registration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  update public.stand_registrations set status = 'rejected'
    where id = registration_id and status = 'pending';
  if not found then raise exception 'registration_not_pending' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.approve_stand_registration(uuid) from public, anon;
revoke all on function public.reject_stand_registration(uuid) from public, anon;
grant execute on function public.approve_stand_registration(uuid) to authenticated;
grant execute on function public.reject_stand_registration(uuid) to authenticated;

-- Enable live updates for the app's public stand list.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'published_stands'
  ) then
    alter publication supabase_realtime add table public.published_stands;
  end if;
end $$;

-- After creating the Auth user, run supabase-admin.sql to grant admin access.
