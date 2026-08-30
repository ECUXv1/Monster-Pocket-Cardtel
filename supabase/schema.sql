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

-- The session id itself (embedded in the QR code's URL) is the capability —
-- like any share link, whoever has it can read/update *that one row* to
-- drop in photos from a phone that never logs in. Nothing else is exposed.
drop policy if exists "Token holder can read a capture session" on public.capture_sessions;
create policy "Token holder can read a capture session"
  on public.capture_sessions for select
  using (true);

drop policy if exists "Token holder can update a capture session" on public.capture_sessions;
create policy "Token holder can update a capture session"
  on public.capture_sessions for update
  using (true);

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
