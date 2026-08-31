// Parse.bot (parse.bot) hosts managed, self-healing REST wrappers over
// sites that don't have their own public API — PSA, CGC, PriceCharting,
// and Collectr all go through this same helper with one API key. They
// handle the anti-bot fight themselves (proxies, retries, monitoring), so
// this is meaningfully more reliable than scraping any of those sites
// directly, and doesn't have PSA's own official-API token-expiry problem.
//
// Get a free key at https://parse.bot (200 credits/month free, no card
// required) and set it as PARSE_API_KEY in Netlify.

const SCRAPERS = {
  psa: '311daf8c-242f-4c68-af70-b50617fd1d13',
  cgc: '79a64119-68da-456c-a5da-449146b5eda6',
  pricecharting: 'bbbbdc36-6d99-4a7a-8115-cf766b2497e3',
  collectr: 'f9af367c-0a37-4e37-b6fe-637f181eaf96',
}

export class ParseNotConfiguredError extends Error {
  constructor() {
    super('PARSE_API_KEY is not configured on the server.')
    this.name = 'ParseNotConfiguredError'
  }
}

/**
 * source: 'psa' | 'cgc' | 'pricecharting' | 'collectr'
 * endpoint: the named endpoint on that wrapper, e.g. 'get_cert_details'
 * params: plain object of query-string params
 */
export async function callParse(source, endpoint, params = {}) {
  const apiKey = process.env.PARSE_API_KEY
  if (!apiKey) throw new ParseNotConfiguredError()

  const scraperId = SCRAPERS[source]
  if (!scraperId) throw new Error(`Unknown Parse.bot source: ${source}`)

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  const url = `https://api.parse.bot/scraper/${scraperId}/${endpoint}?${query.toString()}`

  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } })
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('PARSE_API_KEY was rejected — check it at parse.bot.')
    }
    if (res.status === 429) {
      throw new Error("Parse.bot's monthly credit limit or rate limit was hit — check usage at parse.bot, or upgrade the plan.")
    }
    throw new Error(data?.error || `Parse.bot (${source}/${endpoint}) responded ${res.status}`)
  }

  if (data?.status && data.status !== 'success') {
    throw new Error(data?.error || `Parse.bot (${source}/${endpoint}) reported an error`)
  }

  return data?.data ?? data
}
