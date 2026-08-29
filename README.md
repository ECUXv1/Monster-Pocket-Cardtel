# Monster Pocket CARD-tel HQ

An installable PWA for tracking your Pokémon card collection — raw cards and graded slabs — with cost basis, auto-markup pricing, and a camera-first add flow built for phones, tablets, and touchscreens like a Tesla center display.

## What's included

- **Dashboard** — cost basis, estimated sell value, unrealized profit, sold-to-date, collection mix chart, top-value items.
- **Inventory** — searchable/filterable grid (raw / graded / sold), sortable by value or profit.
- **Add / Edit item** — category toggle (raw card vs graded slab), a photo box that automatically figures out whether it's on a phone or not (see below), grading company + grade + cert #, price paid, a markup slider that live-computes the asking price, sold tracking, notes.
- **Auto market-price check** — as soon as an item is added, the app searches eBay's recently-sold listings for it and shows a low/average/high on the item page, no API key required (see below).
- **Item detail** — full photos, cost/value/profit breakdown, cert number, notes, live eBay sold-price comparison.
- **Settings** — default markup %, CSV export, Supabase connection status, sign out.
- **PWA** — installable to your home screen / car browser, offline app-shell caching via a service worker, manifest + icons generated from your logo.
- **Demo mode** — if Supabase isn't configured yet, the app still runs fully using on-device local storage, so you can try it immediately.

## 1. Run it locally

```bash
npm install
npm run dev
```

Open the printed local URL. It works immediately in **demo mode** (data stored only in your browser) so you can click around before connecting Supabase.

## 2. Connect Supabase (cloud sync, multi-device, photo storage)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it. This creates:
   - `items` table (cards + slabs, with `asking_price` auto-computed from price paid + markup %)
   - `user_settings` table (your default markup %)
   - Row-Level-Security policies so only you can see your data
   - A public `card-images` storage bucket with per-user upload policies
3. In **Project Settings → API**, copy your **Project URL** and **anon public key**.
4. Copy `.env.example` to `.env` and fill them in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```
5. Restart `npm run dev`. You'll land on a sign-in screen — create an account (email confirmation is on by default in Supabase; you can disable it in **Authentication → Providers → Email** for a faster personal setup).

## 3. Deploy to Netlify

1. Push this project to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Build settings are already defined in `netlify.toml` (`npm run build`, publish `dist`).
3. In **Site settings → Environment variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Once live, open the Netlify URL on your phone and use "Add to Home Screen" (iOS Safari share menu, or Chrome's install icon) to install it as an app. On a Tesla, open the URL in the car browser — the layout switches to a side-rail touch layout automatically on wide screens.

## Auto-checking eBay's recently sold prices

Whenever an item is added — whether you typed the details in by hand or used phone scan — the app automatically searches eBay's **sold, completed listings** for that card (name + set + card number, plus grading company/grade for slabs) and shows you the low / average / high from recent sales, right on the item's detail page. It also checks again automatically if an estimate is more than 7 days old, or any time you tap the refresh icon.

This needs **no API key and no Anthropic account** — it works out of the box once deployed, independent of the phone-scan recognition feature below. A few honest caveats:

- eBay doesn't offer free, official "sold listings" data to individual developers (that's gated behind their Marketplace Insights API, which requires a separate partner application). So `netlify/functions/ebay-sold-prices.mjs` instead reads the same public "sold items" search results page you'd see browsing eBay yourself, and summarizes the prices.
- That makes it inherently a little fragile — if eBay changes their search page's markup, the parser may need a small update (it's isolated to that one file).
- It's meant for personal, one-lookup-per-item use, not bulk/automated scraping — heavy automated use can run against eBay's Terms of Service.
- If you later get approved for eBay's Marketplace Insights API, you can swap the fetch in that function for the official endpoint without touching anything else in the app.

## Phone hand-off card recognition (optional, needs Claude API key)

Separately, the QR "Scan with phone" flow described below can *also* auto-fill the card's name/set/grade by reading the photo with Claude's vision — but that part is entirely optional. If you don't set an `ANTHROPIC_API_KEY`, phone hand-off still gets the photo from your phone onto the Tesla screen, you just type in the name/set/grade yourself same as always, and the eBay price check above runs exactly the same either way.

## Scan with phone (QR hand-off from the Tesla screen)

This is the flow for a car screen (or any laptop) with no camera worth pointing at a card: each photo box automatically shows a **"Scan with phone"** QR code there instead of trying to use a built-in webcam (see "Using the camera" above for the full behavior). Scan it, take the photo on your actual phone, hit **Send to Tesla screen**, and the photo — plus the card's name/set/number/grade if Claude can read them off it — pops straight into that box on the car screen, live.

**How it works under the hood:**
1. The Tesla screen creates a short-lived `capture_sessions` row in Supabase and encodes a link to `/capture/{session-id}` as a QR code.
2. Your phone (no login needed) opens that link, which is this same app's mobile capture page.
3. You take the photo there; it uploads to the shared `card-images` bucket and a Netlify function (`recognize-card`) asks Claude to read the card name/set/number (or the grading company/grade/cert number off a slab label).
4. The result is written back to that same `capture_sessions` row.
5. The Tesla screen is subscribed to that row over **Supabase Realtime** and updates the form the moment it changes.

**To turn this on, in addition to the base Supabase setup above:**
1. In the Supabase dashboard, go to **Database → Replication** and enable Realtime for the `capture_sessions` table (the updated `supabase/schema.sql` already creates the table and its policies — rerun it if you set up your database before this feature was added).
2. Set an `ANTHROPIC_API_KEY` environment variable in **Netlify → Site settings → Environment variables** (get a key from [console.anthropic.com](https://console.anthropic.com)) — **optional**. This only powers the auto-fill-from-photo step; skip it and you'll just type in the card details yourself after the photo arrives. The eBay price check runs regardless.
3. Deploy — Netlify picks up the function in `netlify/functions/` automatically.

A note on security: the phone never signs in, so the QR code's link itself acts as a one-time capability — anyone who has that exact link (a random, unguessable ID, live for 15 minutes) can write a photo to that one session row and nothing else. That's the same trust model as any "share this link" pairing flow. If you want stricter guarantees later, swap the direct-from-phone Supabase writes for a Netlify function that validates the session server-side.

## Using the camera

**Each of the three photo boxes (front / back / slab) automatically detects what kind of device it's running on** and behaves differently — no setting to configure:

- **On a phone**, tapping the box opens a live in-app camera view (front/back camera toggle) or your phone's native camera/gallery picker. It's your own camera, so it just uses it directly.
- **On a laptop or a car's built-in touchscreen** (a Tesla center display, for example), there usually isn't a camera worth pointing at a card. So instead, that box shows a **"Scan with phone"** button: tap it, a QR code appears right there in that photo box, and scanning it with your phone opens a one-photo capture page — just for that one box. Take the photo on your phone, hit send, and it streams straight into that exact spot on the screen you're using, like a temporary wireless shutter release. A plain "Upload from computer" button is also there as a fallback if you'd rather pick an existing image file.
- Front and slab photos also try to auto-fill the card's name/set/grade when they arrive this way (if `ANTHROPIC_API_KEY` is set — see below); back photos skip that step since there's nothing new to read there.

Device detection is a simple check (does this look like a phone's browser?) — it isn't perfect, but it fails toward showing the QR option, which always works even where a live camera might not.

## Pricing logic

Asking price = `price you paid × (1 + markup% / 100)`, rounded to the cent. Set a personal default markup in **Settings** (applied to every new item), and fine-tune per item with the slider on the add/edit form. Dashboard profit figures use the asking price for active items and your recorded sold price for sold items.

## Ideas to grow it later

- Barcode/QR cert-number lookup against PSA/CGC public APIs to auto-fill grade + population data.
- Push notifications when a card in your collection spikes in market price (would need a market-price data source — none is wired up here, since prices are self-reported).
- Multi-user "showcase" links to share a read-only view of your collection.
- Bulk import from a CSV of past purchases.

## Tech stack

React + Vite, Tailwind CSS v4, React Router, Recharts, `@supabase/supabase-js`, Lucide icons. No backend server beyond Supabase (Postgres + Auth + Storage) — deploys as a static site on Netlify.
