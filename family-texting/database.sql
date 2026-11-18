-- Smithers & Friends — private parent SMS tables.
-- Run the site's supabase.sql first. This module depends on public.is_snf_staff().
-- ONLY execute this script in your PRIVATE Supabase project SQL Editor.
-- Never store family numbers or server keys in a public GitHub file.

create extension if not exists pgcrypto;

create table if not exists public.family_contacts (
  id uuid primary key default gen_random_uuid(),
  family_name text not null check (length(trim(family_name)) between 2 and 120),
  phone_e164 text not null unique check (phone_e164 ~ '^[+]1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  notes text not null default '' check (length(notes) <= 500),
  opted_in boolean not null default false,
  consent_source text check (length(consent_source) <= 250),
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_consent_source_check check (
    not opted_in or (consent_source is not null and length(trim(consent_source))>0)
  )
);

create table if not exists public.family_campaigns (
  id uuid primary key,
  campaign_name text not null check (length(campaign_name) between 1 and 100),
  body text not null check (length(body) between 1 and 600),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.family_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.family_contacts(id),
  campaign_id uuid references public.family_campaigns(id),
  direction text not null check (direction in ('in','out')),
  body text not null check (length(body) between 1 and 700),
  status text not null check (status in ('queued','accepted','sent','delivered','failed','undelivered','received')),
  provider_sid text unique,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,contact_id)
);

create index if not exists family_messages_contact_created on public.family_messages(contact_id,created_at desc);
create index if not exists family_messages_provider_sid on public.family_messages(provider_sid);

alter table public.family_contacts enable row level security;
alter table public.family_campaigns enable row level security;
alter table public.family_messages enable row level security;

create policy "snf_text_contacts_staff_read" on public.family_contacts
  for select to authenticated using (public.is_snf_staff());
create policy "snf_text_contacts_staff_insert" on public.family_contacts
  for insert to authenticated with check (public.is_snf_staff());
create policy "snf_text_contacts_staff_update" on public.family_contacts
  for update to authenticated using (public.is_snf_staff()) with check (public.is_snf_staff());

create policy "snf_text_campaigns_staff_read" on public.family_campaigns
  for select to authenticated using (public.is_snf_staff());
create policy "snf_text_messages_staff_read" on public.family_messages
  for select to authenticated using (public.is_snf_staff());

-- Browser clients are NOT allowed to invent message delivery history.
-- Only trusted, server-side SMS functions use a service role to create/modify messages.

create or replace function public.family_protect_carrier_optout()
returns trigger language plpgsql
set search_path = public,pg_temp
as $$
begin
  if old.unsubscribed_at is not null and current_user = 'authenticated' then
    if new.opted_in is distinct from old.opted_in or
       new.unsubscribed_at is distinct from old.unsubscribed_at then
       raise exception 'This parent opted out by SMS; only an inbound START message may reactivate';
    end if;
  end if;
  if new.opted_in and (new.consent_source is null or length(trim(new.consent_source))=0) then
    raise exception 'SMS permission requires a recorded source';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
drop trigger if exists family_carrier_optout_guard on public.family_contacts;
create trigger family_carrier_optout_guard before update on public.family_contacts
for each row execute function public.family_protect_carrier_optout();

-- Keep anonymous access disabled. Only your approved S&F staff can view records.
-- Verify staff authentication, carrier compliance, rate limits and MFA before importing real data.
