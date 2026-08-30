// Estimates a card's market value from eBay's recently-sold listings.
//
// Two ways this can get its data, in priority order:
//
// 1. SoldComps API (https://sold-comps.com), when SOLDCOMPS_API_KEY is set —
//    a third-party service built specifically for this: real eBay sold
//    listings via a clean JSON API, no eBay developer account or approval
//    process needed. Free tier is 100 requests/month with no credit card,
//    which comfortably covers personal use (one check per item you add).
//    They handle eBay's anti-bot measures on their end and patch same-day
//    when eBay's page changes, so this is the reliable path.
//
// 2. Reading eBay's public "sold, completed listings" search page directly
//    (the fallback used automatically if no SOLDCOMPS_API_KEY is set).
//    Free, but eBay actively fights exactly this kind of automated request —
//    expect occasional 403s. eBay's own official sold-data API (Marketplace
//    Insights) isn't a realistic alternative here: it requires
//    partner-level approval that individual/hobby developers are
//    consistently denied.
//
// To switch to the reliable path: sign up at sold-comps.com (free, instant
// API key), then set SOLDCOMPS_API_KEY as a Netlify environment variable.

import * as cheerio from 'cheerio'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
]

function browserHeaders(userAgent) {
  return {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    referer: 'https://www.ebay.com/',
  }
}

function summarize(prices, listings, query, source) {
  const sorted = [...prices].sort((a, b) => a - b)
  const sum = sorted.reduce((s, p) => s + p, 0)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return {
    query,
    sample_size: sorted.length,
    average: Math.round((sum / sorted.length) * 100) / 100,
    median: Math.round(median * 100) / 100,
    low: sorted[0],
    high: sorted[sorted.length - 1],
    listings,
    checked_at: new Date().toISOString(),
    source,
  }
}

async function fetchViaSoldComps(query, apiKey) {
  const url = `https://api.sold-comps.com/v1/scrape?keyword=${encodeURIComponent(query)}&count=40&sortOrder=endedRecently`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const data = await res.json()

  if (!res.ok) {
    if (res.status === 401) throw new Error('SOLDCOMPS_API_KEY is set but was rejected — double check the key.')
    if (res.status === 429) {
      const msg =
        data?.code === 'quota_exceeded'
          ? "SoldComps' monthly free quota is used up — it resets on your billing date, or upgrade at sold-comps.com."
          : 'SoldComps rate limit hit — try again in a moment.'
      throw new Error(msg)
    }
    throw new Error(data?.error || `SoldComps responded ${res.status}`)
  }

  const prices = []
  const listings = []
  for (const item of data.items || []) {
    const price = Number(item.soldPrice)
    if (!Number.isFinite(price) || price <= 0) continue
    prices.push(price)
    if (listings.length < 6) listings.push({ title: item.title, price, url: item.url })
  }

  if (prices.length === 0) {
    return { query, sample_size: 0, checked_at: new Date().toISOString() }
  }
  return summarize(prices, listings, query, 'soldcomps')
}

async function fetchViaScrape(query) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=60`

  let html = null
  let lastStatus = null
  for (const ua of USER_AGENTS) {
    const res = await fetch(url, { headers: browserHeaders(ua) })
    if (res.ok) {
      html = await res.text()
      break
    }
    lastStatus = res.status
    if (res.status !== 403 && res.status !== 429) break
  }

  if (!html) {
    const blocked = lastStatus === 403 || lastStatus === 429
    return {
      query,
      sample_size: 0,
      checked_at: new Date().toISOString(),
      error: blocked
        ? "eBay is currently blocking this price check. For a more reliable check, connect a free SoldComps API key (see README) — or try the refresh button again in a bit."
        : `eBay responded ${lastStatus || 'with an error'} — try again shortly.`,
    }
  }

  const $ = cheerio.load(html)
  const prices = []
  const listings = []

  $('li.s-item, div.s-item').each((_, el) => {
    const title = $(el).find('.s-item__title').first().text().trim()
    const priceText = $(el).find('.s-item__price').first().text().trim()
    const href = $(el).find('a.s-item__link').first().attr('href')
    if (!title || title.toLowerCase() === 'shop on ebay') return
    if (!priceText) return

    const match = priceText.match(/^\$?([\d,]+\.\d{2})$/)
    if (!match) return
    const price = parseFloat(match[1].replace(/,/g, ''))
    if (!Number.isFinite(price) || price <= 0) return

    prices.push(price)
    if (listings.length < 6) listings.push({ title, price, url: href })
  })

  if (prices.length === 0) {
    return { query, sample_size: 0, checked_at: new Date().toISOString() }
  }
  return summarize(prices, listings, query, 'ebay_sold_listings')
}

export const handler = async (event) => {
  const query = event.queryStringParameters?.q
  if (!query || !query.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) }
  }

  try {
    const soldCompsKey = process.env.SOLDCOMPS_API_KEY
    const estimate = soldCompsKey ? await fetchViaSoldComps(query, soldCompsKey) : await fetchViaScrape(query)
    return { statusCode: 200, body: JSON.stringify(estimate) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
