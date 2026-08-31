-- Monster Pocket CARD-tel HQ — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

-- 1. Extension for gen_random_uuid
create extension if not exists "pgcrypto";

-- 2. Items table (covers raw cards AND graded slabs via `category`)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  category text not null default 'raw' check (category in ('raw', 'graded')),
  name text not null,
  set_name text,
  card_number text,
  rarity text,
  condition text,               -- e.g. "Near Mint" for raw cards

  grading_company text,         -- PSA / BGS / CGC / SGC / other
  grade numeric,                -- e.g. 10, 9.5
  cert_number text,

  quantity integer not null default 1,

  purchase_price numeric(10,2) not null default 0,
  purchase_date date,
  markup_percent numeric(6,2) not null default 30,
  -- Not a generated column: the app sets this directly. It's driven by
  -- eBay's recent-sold market average whenever that data is available;
  -- cost + markup is only ever a fallback before market data exists yet,
  -- or for items with no comparable sold listings.
  asking_price numeric(10,2) not null default 0,

  is_sold boolean not null default false,
  sold_price numeric(10,2),
  sold_date date,

  notes text,
  front_image_url text,
  back_image_url text,
  slab_image_url text,

  market_estimate jsonb,        -- eBay recently-sold summary: {average, median, low, high, sample_size, listings, checked_at}
  card_reference jsonb,         -- canonical card data from the Pokémon TCG database: reference image, stats, TCGPlayer prices
  condition_report jsonb,       -- AI photo-based condition estimate for raw cards: {condition, confidence, corners, edges, surface, centering, notes}
  cert_verification jsonb,      -- Direct lookup on the grading company's own site (PSA/CGC) by cert number: description, grade, sold comps
  price_guide jsonb,            -- PriceCharting + Collectr price-by-grade data, a second signal alongside eBay/SoldComps
  check_price_guide boolean not null default false, -- opt-in per item — the price guide check costs ~4 Parse.bot credits, so it's off by default
  pricing_source text not null default 'median' check (pricing_source in ('median','psa','custom')), -- which number actually becomes asking_price
  custom_asking_price numeric(10,2), -- only used when pricing_source = 'custom'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items (user_id);
create index if not exists items_category_idx on public.items (category);
create index if not exists items_is_sold_idx on public.items (is_sold);

-- If you set up this database before market_estimate existed, this adds it
-- without touching anything else (safe to run again any time).
alter table public.items add column if not exists market_estimate jsonb;
alter table public.items add column if not exists card_reference jsonb;
alter table public.items add column if not exists condition_report jsonb;
alter table public.items add column if not exists cert_verification jsonb;
alter table public.items add column if not exists price_guide jsonb;
alter table public.items add column if not exists check_price_guide boolean not null default false;
alter table public.items add column if not exists pricing_source text not null default 'median';
do $$ begin
  alter table public.items add constraint items_pricing_source_check check (pricing_source in ('median','psa','custom'));
exception when duplicate_object then null;
end $$;
alter table public.items add column if not exists custom_asking_price numeric(10,2);

-- If you set up this database before asking_price stopped being a
-- generated column, this converts it to a normal editable column,
-- keeping every existing value exactly as it was calculated before.
-- Safe to run again — it's a no-op once already converted.
alter table public.items alter column asking_price drop expression if exists;
alter table public.items alter column asking_price set default 0;

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- 3. Row Level Security — each collector only sees their own inventory
alter table public.items enable row level security;

drop policy if exists "Users manage their own items" on public.items;
create policy "Users manage their own items"
  on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. User settings (default markup %, display prefs)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_markup_percent numeric(6,2) not null default 30,
  currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users manage their own settings" on public.user_settings;
create policy "Users manage their own settings"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Share link: a random token per user that unlocks a public, read-only
-- view of their active inventory — no login required on the viewer's end.
-- Off (share_enabled = false) by default; the person turns it on
-- explicitly from Settings. Regenerating the token instantly invalidates
-- any link already handed out.
alter table public.user_settings add column if not exists share_token uuid not null default gen_random_uuid();
alter table public.user_settings add column if not exists share_enabled boolean not null default false;

-- The public entry point. SECURITY DEFINER lets this bypass the items
-- table's normal per-owner RLS — but only to return a short, deliberately
-- safe list of fields (never purchase_price, notes, or internal pricing
-- detail like raw eBay listings). Nothing else in the database is
-- reachable through this function. Returns nothing at all if the token
-- doesn't match an enabled share.
create or replace function public.get_shared_inventory(p_token uuid)
returns table (
  id uuid,
  name text,
  category text,
  set_name text,
  card_number text,
  rarity text,
  condition text,
  grading_company text,
  grade numeric,
  quantity integer,
  asking_price numeric,
  front_image_url text,
  slab_image_url text,
  reference_image_url text
)
language sql
security definer
set search_path = public
as $$
  select
    i.id, i.name, i.category, i.set_name, i.card_number, i.rarity, i.condition,
    i.grading_company, i.grade, i.quantity, i.asking_price,
    i.front_image_url, i.slab_image_url,
    coalesce(i.cert_verification->>'image_front', i.card_reference->>'image_large') as reference_image_url
  from public.items i
  join public.user_settings us on us.user_id = i.user_id
  where us.share_token = p_token
    and us.share_enabled = true
    and i.is_sold = false
  order by i.asking_price desc nulls last;
$$;

grant execute on function public.get_shared_inventory(uuid) to anon, authenticated;

-- 5. Storage bucket for card / slab photos
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read card images" on storage.objects;
create policy "Public read card images"
  on storage.objects for select
  using (bucket_id = 'card-images');

drop policy if exists "Users upload their own card images" on storage.objects;
create policy "Users upload their own card images"
  on storage.objects for insert
  with check (
    bucket_id = 'card-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users manage their own card images" on storage.objects;
create policy "Users manage their own card images"
  on storage.objects for update using (
    bucket_id = 'card-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own card images" on storage.objects;
create policy "Users delete their own card images"
  on storage.objects for delete using (
    bucket_id = 'card-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 6. Phone hand-off sessions — powers "Scan with phone": the Tesla screen shows
-- a QR code, the phone opens it (no login needed on the phone), takes the
-- photo, and an edge function recognizes the card. The Tesla screen watches
-- this row over Realtime and pops the result into the Add Item form.
create table if not exists public.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending','opened','captured','recognizing','ready','error','expired')),
  category text check (category in ('raw','graded')),
  slot text check (slot in ('front','back','slab')), -- null = whole-item hand-off (front+back or slab); set = a single photo box requested its own wireless shutter

  front_image_url text,
  back_image_url text,
  slab_image_url text,
  recognized jsonb,
  error text,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists capture_sessions_user_id_idx on public.capture_sessions (user_id);

-- If you set up capture_sessions before per-slot hand-off existed, this
-- adds the `slot` column safely (safe to run again any time).
alter table public.capture_sessions add column if not exists slot text;
alter table public.capture_sessions drop constraint if exists capture_sessions_slot_check;
alter table public.capture_sessions add constraint capture_sessions_slot_check
  check (slot in ('front','back','slab'));

alter table public.capture_sessions enable row level security;

-- Only the signed-in Tesla/owner session can CREATE a hand-off code.
drop policy if exists "Owners create capture sessions" on public.capture_sessions;
create policy "Owners create capture sessions"
  on public.capture_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- The owner's own screen watches its session over Realtime (which enforces
-- RLS same as any other read) — this is what actually needs SELECT access
-- on the authenticated side, not a blanket public policy.
drop policy if exists "Owners read their own capture sessions" on public.capture_sessions;
create policy "Owners read their own capture sessions"
  on public.capture_sessions for select
  to authenticated
  using (auth.uid() = user_id);

-- SECURITY NOTE — this table previously had two policies here named
-- "Token holder can read/update a capture session", both `using (true)`
-- with no role restriction. That's a real hole: a Postgres RLS `using`
-- clause governs which ROWS satisfy the policy, not what filter the
-- client happened to apply — `using (true)` permits every row to every
-- holder of the anon key, including a request with no filter at all, not
-- just the one row whose id a legitimate caller actually knows. If you
-- still have those two policies in your database, run this file again;
-- the `drop policy if exists` lines above and below remove them.
--
-- The phone side of "Scan with phone" genuinely has no auth.uid() at all
-- (it never signs in), so it can't use the same auth.uid()-based policy
-- the owner's side uses above. Instead it goes through two narrow
-- SECURITY DEFINER functions below — the function's own parameter list
-- IS the allow-list (only status + the three image URLs + recognized +
-- error are reachable; there's no parameter for user_id, category, slot,
-- or the timestamps, so there's no way to touch them even by mistake),
-- and each one independently re-checks that the row exists and hasn't
-- expired, server-side, rather than trusting the frontend to filter
-- correctly.
drop policy if exists "Token holder can read a capture session" on public.capture_sessions;
drop policy if exists "Token holder can update a capture session" on public.capture_sessions;

create or replace function public.get_capture_session(p_token uuid)
returns table (
  id uuid,
  status text,
  category text,
  slot text,
  front_image_url text,
  back_image_url text,
  slab_image_url text,
  recognized jsonb,
  error text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, status, category, slot, front_image_url, back_image_url,
         slab_image_url, recognized, error, expires_at
  from public.capture_sessions
  where id = p_token
    and expires_at > now();
$$;

create or replace function public.update_capture_session(
  p_token uuid,
  p_status text,
  p_front_image_url text default null,
  p_back_image_url text default null,
  p_slab_image_url text default null,
  p_recognized jsonb default null,
  p_error text default null
)
returns table (
  id uuid,
  status text,
  category text,
  slot text,
  front_image_url text,
  back_image_url text,
  slab_image_url text,
  recognized jsonb,
  error text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  update public.capture_sessions
  set
    status = p_status,
    front_image_url = coalesce(p_front_image_url, front_image_url),
    back_image_url = coalesce(p_back_image_url, back_image_url),
    slab_image_url = coalesce(p_slab_image_url, slab_image_url),
    recognized = coalesce(p_recognized, recognized),
    error = coalesce(p_error, error)
  where id = p_token
    and expires_at > now()
  returning id, status, category, slot, front_image_url, back_image_url,
            slab_image_url, recognized, error, expires_at;
$$;

grant execute on function public.get_capture_session(uuid) to anon, authenticated;
grant execute on function public.update_capture_session(uuid, text, text, text, text, jsonb, text) to anon, authenticated;

drop policy if exists "Owners delete their capture sessions" on public.capture_sessions;
create policy "Owners delete their capture sessions"
  on public.capture_sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- Allow the (unauthenticated) phone page to drop photos into the shared
-- bucket under a capture/{session_id}/ prefix.
drop policy if exists "Anyone can upload capture photos" on storage.objects;
create policy "Anyone can upload capture photos"
  on storage.objects for insert
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = 'capture'
  );

-- Finally, in the Supabase dashboard: Database -> Replication -> turn on
-- Realtime for the `capture_sessions` table, so the Tesla screen gets the
-- live "phone connected / photo uploaded / identifying..." updates.

-- Done. Item photos upload to: {user_id}/{item_id}/front.jpg
-- Hand-off photos upload to: capture/{session_id}/front.jpg

