// Netlify serverless function used to estimate a card's market value.
//
// eBay doesn't offer sold-listing data through its free public REST API —
// that data is gated behind the Marketplace Insights API, which requires a
// separate partner application and approval. So instead, this reads the
// same "sold, completed listings" search results page anyone sees when
// browsing eBay with the "Sold items" filter checked, and summarizes the
// prices. That means:
//   - It's fetching a public page, not calling a private/authenticated API.
//   - It's inherently fragile: if eBay changes its search page markup,
//     this parser will need updating (look for `s-item__` class names below).
//   - Keep usage to personal, low-frequency lookups (one check per item you
//     add, not bulk scraping) — heavier automated use can run against
//     eBay's Terms of Service and may get the calling IP rate-limited.
// If you later get Marketplace Insights API access, swap the fetch below
// for that official endpoint and this function's callers won't need to change.

import * as cheerio from 'cheerio'

export const handler = async (event) => {
  const query = event.queryStringParameters?.q
  if (!query || !query.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) }
  }

  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_ipg=60`

  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html',
      },
    })
    if (!res.ok) throw new Error(`eBay responded ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const prices = []
    const listings = []

    $('li.s-item, div.s-item').each((_, el) => {
      const title = $(el).find('.s-item__title').first().text().trim()
      const priceText = $(el).find('.s-item__price').first().text().trim()
      const href = $(el).find('a.s-item__link').first().attr('href')
      if (!title || title.toLowerCase() === 'shop on ebay') return
      if (!priceText) return

      // Ignore "$10.00 to $20.00" range listings — just take single-price ones for a cleaner estimate.
      const match = priceText.match(/^\$?([\d,]+\.\d{2})$/)
      if (!match) return
      const price = parseFloat(match[1].replace(/,/g, ''))
      if (!Number.isFinite(price) || price <= 0) return

      prices.push(price)
      if (listings.length < 6) listings.push({ title, price, url: href })
    })

    if (prices.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ query, sample_size: 0, checked_at: new Date().toISOString() }),
      }
    }

    const sorted = [...prices].sort((a, b) => a - b)
    const sum = sorted.reduce((s, p) => s + p, 0)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

    const estimate = {
      query,
      sample_size: sorted.length,
      average: Math.round((sum / sorted.length) * 100) / 100,
      median: Math.round(median * 100) / 100,
      low: sorted[0],
      high: sorted[sorted.length - 1],
      listings,
      checked_at: new Date().toISOString(),
      source: 'ebay_sold_listings',
    }

    return { statusCode: 200, body: JSON.stringify(estimate) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
