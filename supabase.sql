-- Smithers & Friends Staff & Volunteer Hub
-- Run ONCE in Supabase SQL Editor. The website is public; private data is protected by RLS.
create extension if not exists pgcrypto;

create table if not exists public.staff_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 role text not null check (role in ('admin','staff')),
 created_at timestamptz not null default now()
);
create table if not exists public.events (
 id uuid primary key default gen_random_uuid(),
 name text not null, event_date date not null, start_time time, end_time time,
 location text not null, description text not null default '',
 published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.roles (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 title text not null, capacity integer not null check(capacity between 1 and 1000),
 shift_time text not null default '', instructions text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.signups (
 id uuid primary key default gen_random_uuid(),
 role_id uuid not null references public.roles(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 2 and 100),
 email text not null check(length(trim(email)) between 5 and 254),
 phone text check(length(phone) <= 40),
 created_at timestamptz not null default now(),
 unique(role_id,email)
);
create table if not exists public.event_logs (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 kind text not null check(kind in ('note','supply','expense','attendance','station','followup','outcome')),
 title text not null, details text not null, number_value numeric,
 created_at timestamptz not null default now()
);

create or replace function public.is_snf_staff() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.staff_members where user_id=(select auth.uid()));
$$;

alter table public.staff_members enable row level security;
alter table public.events enable row level security;
alter table public.roles enable row level security;
alter table public.signups enable row level security;
alter table public.event_logs enable row level security;

create policy "Staff sees own access record" on public.staff_members
 for select to authenticated using (user_id=(select auth.uid()));
create policy "Public sees published events" on public.events
 for select to anon,authenticated using (published or public.is_snf_staff());
create policy "Staff adds events" on public.events
 for insert to authenticated with check(public.is_snf_staff());
create policy "Staff updates events" on public.events
 for update to authenticated using(public.is_snf_staff()) with check(public.is_snf_staff());
create policy "Public sees published roles" on public.roles
 for select to anon,authenticated using(
 public.is_snf_staff() or exists(select 1 from public.events e where e.id=event_id and e.published)
 );
create policy "Staff adds roles" on public.roles
 for insert to authenticated with check(public.is_snf_staff());
create policy "Staff updates roles" on public.roles
 for update to authenticated using(public.is_snf_staff()) with check(public.is_snf_staff());
create policy "Public registers volunteer" on public.signups
 for insert to anon,authenticated with check(true);
create policy "Staff sees signups" on public.signups
 for select to authenticated using(public.is_snf_staff());
create policy "Staff sees records" on public.event_logs
 for select to authenticated using(public.is_snf_staff());
create policy "Staff adds records" on public.event_logs
 for insert to authenticated with check(public.is_snf_staff());
create policy "Staff updates records" on public.event_logs
 for update to authenticated using(public.is_snf_staff()) with check(public.is_snf_staff());

-- Ensure volunteers cannot register for unpublished events or overbook an event role.
-- Lock the role row while counting signups to prevent two simultaneous last-slot claims.
create or replace function public.enforce_signup_capacity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare max_spaces integer; event_is_live boolean; taken integer;
begin
 select r.capacity,e.published into max_spaces,event_is_live
 from public.roles r join public.events e on e.id=r.event_id
 where r.id=new.role_id for update of r;
 if max_spaces is null or event_is_live is distinct from true then
  raise exception 'This role is not open for signups';
 end if;
 select count(*) into taken from public.signups where role_id=new.role_id;
 if taken >= max_spaces then raise exception 'This volunteer role is full'; end if;
 return new;
end;
$$;
drop trigger if exists validate_signup on public.signups;
create trigger validate_signup before insert on public.signups
 for each row execute function public.enforce_signup_capacity();

-- IMPORTANT: Add approved admins only AFTER creating their Auth users in
-- Supabase > Authentication > Users > Add user (invite or create).
-- Replace the UUID and name below, then run for each approved person:
-- insert into public.staff_members(user_id,display_name,role)
-- values ('PASTE_AUTH_USER_UUID','Katherine McGraw','admin');
-- Repeat with your own auth UUID and your name.
-- Never make the staff_members table publicly writable.
