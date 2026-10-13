-- Template only. Replace the placeholder with the Auth user UUID before running.
-- For the actual UUID, use a local ignored copy named supabase-admin.local.sql.
insert into public.admin_users (user_id)
values ('AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
