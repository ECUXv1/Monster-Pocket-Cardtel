// Looks up a graded card's certification number directly on the grading
// company's own site — the actual source of truth for that exact card,
// not a generic database entry.
//
// PSA: uses PSA's real Public API (api.psacard.com/publicapi) when a
//   PSA_API_TOKEN is configured — a proper bearer-token REST API with
//   structured JSON, no bot-blocking risk, and (via GetImagesByCertNumber)
//   an actual photo of the specific card that was graded, not a generic
//   stock image. Get a free token by registering at psacard.com/publicapi.
//   Without a token, falls back to reading the public cert page directly,
//   which works but is more fragile (PSA's bot detection can block it).
// CGC: no equivalent public API was found, so this stays best-effort —
//   CGC's cert page runs bot detection that blocks even plain requests,
//   and part of the page renders via client-side JavaScript that a server
//   fetch never sees.
// BGS and SGC aren't implemented yet.

import * as cheerio from 'cheerio'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
]

function browserHeaders(userAgent, referer) {
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
    referer,
  }
}

// Same retry approach as the eBay function: try a couple of realistic
// browser fingerprints before giving up, since a 403/429 usually means the
// site's bot detection flagged this specific request, not that it's
// permanently unreachable.
async function fetchWithRetry(url, referer) {
  let lastStatus = null
  for (const ua of USER_AGENTS) {
    const res = await fetch(url, { headers: browserHeaders(ua, referer) })
    if (res.ok) return { html: await res.text() }
    lastStatus = res.status
    if (res.status !== 403 && res.status !== 429) break
  }
  return { html: null, status: lastStatus }
}

function cleanText($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim()
}

// PSA's docs don't publish a schema for GetImagesByCertNumber (it's typed
// just as "object" in their own OpenAPI spec), so this walks whatever
// comes back looking for anything that's plainly an image URL, rather
// than assuming an exact field layout.
function extractImageUrls(data) {
  const found = []
  function walk(node, keyHint = '') {
    if (!node) return
    if (typeof node === 'string' && /^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(node)) {
      found.push({ url: node, keyHint })
    } else if (Array.isArray(node)) {
      node.forEach((n) => walk(n, keyHint))
    } else if (typeof node === 'object') {
      for (const [key, val] of Object.entries(node)) {
        walk(val, key.toLowerCase())
      }
    }
  }
  walk(data)
  const front = found.find((f) => /front/.test(f.keyHint))?.url || found[0]?.url || null
  const back = found.find((f) => /back/.test(f.keyHint))?.url || (found[1] && found[1].url !== front ? found[1].url : null)
  return { front, back }
}

async function lookupPSAViaAPI(certNumber, token) {
  const headers = { authorization: `bearer ${token}`, accept: 'application/json' }

  const certRes = await fetch(
    `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(certNumber)}`,
    { headers }
  )
  if (certRes.status === 401 || certRes.status === 403) {
    throw new Error('PSA_API_TOKEN was rejected — get a fresh one at psacard.com/publicapi.')
  }
  if (!certRes.ok) throw new Error(`PSA API responded ${certRes.status}`)

  const data = await certRes.json()
  const cert = data?.PSACert
  if (!cert || data?.IsValidRequest === false) {
    return {
      found: false,
      grading_company: 'PSA',
      note: data?.ServerMessage || 'No PSA record found for that cert number.',
    }
  }

  // Bonus: the actual photo PSA took of this specific card, not a generic
  // stock image. Best-effort — a failure here shouldn't lose the rest of
  // the cert data.
  let images = { front: null, back: null }
  try {
    const imgRes = await fetch(
      `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${encodeURIComponent(certNumber)}`,
      { headers }
    )
    if (imgRes.ok) images = extractImageUrls(await imgRes.json())
  } catch {
    // Images are a bonus, not essential — keep going without them.
  }

  const description = [cert.Year, cert.Brand, cert.Subject, cert.Variety].filter(Boolean).join(' ') || null

  return {
    found: true,
    grading_company: 'PSA',
    cert_number: cert.CertNumber || certNumber,
    description,
    grade: cert.CardGrade || null,
    grade_description: cert.GradeDescription || null,
    year: cert.Year || null,
    brand: cert.Brand || null,
    subject: cert.Subject || null,
    card_number: cert.CardNumber || null,
    variety: cert.Variety || null,
    label_type: cert.LabelType || null,
    total_population: cert.TotalPopulation ?? null,
    population_higher: cert.PopulationHigher ?? null,
    image_front: images.front,
    image_back: images.back,
    source_url: `https://www.psacard.com/cert/${cert.CertNumber || certNumber}/psa`,
    source: 'psa_api',
    checked_at: new Date().toISOString(),
  }
}

async function lookupPSAViaScrape(certNumber) {
  const url = `https://www.psacard.com/cert/${encodeURIComponent(certNumber)}/psa`
  const { html, status } = await fetchWithRetry(url, 'https://www.psacard.com/cert')
  if (!html) {
    const blocked = status === 403 || status === 429
    return {
      found: false,
      grading_company: 'PSA',
      note: blocked
        ? "PSA's site is currently blocking this lookup. For a reliable fix, register for a free PSA_API_TOKEN at psacard.com/publicapi (see README) — or try the refresh button again in a bit."
        : `PSA responded ${status || 'with an error'} — try again shortly.`,
    }
  }
  const $ = cheerio.load(html)

  const heading = cleanText($, '#main h1, main h1').replace(/^#?\d+\s*/, '') || null
  const grade = cleanText($, 'p:contains("Item Grade")').replace(/Item Grade/i, '').trim() || null

  // The "Item Information" table is label/value pairs; walk it generically
  // rather than hard-coding row order, since PSA's markup shifts by item type.
  const fields = {}
  $('dt, .item-info dt, [class*="ItemInformation"] dt').each((_, el) => {
    const label = cleanText($, el).toLowerCase()
    const value = cleanText($, $(el).next('dd'))
    if (label && value) fields[label] = value
  })

  // Fallback: some PSA layouts use simple label/value text pairs instead of dt/dd.
  if (Object.keys(fields).length === 0) {
    const labels = ['year', 'brand/title', 'subject', 'card number', 'category', 'variety/pedigree', 'label type']
    for (const label of labels) {
      const block = $(`*:contains("${label}")`).last()
      const value = cleanText($, block.next())
      if (value) fields[label] = value
    }
  }

  if (!heading && !grade) {
    return { found: false, grading_company: 'PSA', note: 'No PSA record found for that cert number.' }
  }

  // PSA shows recent eBay sold prices for the same card + grade population
  // right on the cert page — a market signal specific to this exact card,
  // not just a keyword search. Only available via the scraped page, not
  // the official API.
  const soldComps = []
  const bodyText = $('body').text()
  const priceMatches = [...bodyText.matchAll(/\$([\d,]+\.\d{2})\s*\n?\s*(\d{2}\/\d{2}\/\d{2})/g)]
  for (const m of priceMatches.slice(0, 6)) {
    const price = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(price) && price > 0) soldComps.push({ price, date: m[2] })
  }

  return {
    found: true,
    grading_company: 'PSA',
    cert_number: certNumber,
    description: heading,
    grade,
    year: fields['year'] || null,
    brand: fields['brand/title'] || null,
    subject: fields['subject'] || null,
    card_number: fields['card number'] || null,
    variety: fields['variety/pedigree'] || null,
    label_type: fields['label type'] || null,
    sold_comps: soldComps,
    source_url: url,
    source: 'psa_scrape',
    checked_at: new Date().toISOString(),
  }
}

async function lookupPSA(certNumber) {
  const token = process.env.PSA_API_TOKEN
  if (token) {
    try {
      return await lookupPSAViaAPI(certNumber, token)
    } catch (err) {
      // If the real API call itself fails unexpectedly (not just "no
      // record found" — that returns normally above), fall back to
      // scraping rather than giving up entirely.
      try {
        return await lookupPSAViaScrape(certNumber)
      } catch {
        return { found: false, grading_company: 'PSA', note: err.message }
      }
    }
  }
  return lookupPSAViaScrape(certNumber)
}

async function lookupCGC(certNumber) {
  const url = `https://www.cgccards.com/certlookup/${encodeURIComponent(certNumber)}/`
  const { html, status } = await fetchWithRetry(url, 'https://www.cgccards.com/certlookup/')
  if (!html) {
    return {
      found: false,
      grading_company: 'CGC',
      note: `CGC lookup is currently unavailable (their site returned ${status || 'an error'}, likely blocking automated checks) — try again later, or check cgccards.com/certlookup directly.`,
    }
  }

  const $ = cheerio.load(html)
  const bodyText = $('body').text()

  // CGC's cert page loads some fields (like population counts) via
  // client-side JavaScript after the page loads, so those never appear in
  // the raw HTML this function sees — only whatever is server-rendered.
  const gradeMatch = bodyText.match(/Grade\s*·?\s*([\d.]+)/)
  const cardNumberMatch = bodyText.match(/Card Number\s*·?\s*([^\s·]+)/)

  if (!gradeMatch) {
    return {
      found: false,
      grading_company: 'CGC',
      note: 'No CGC record found, or the page format has changed since this was last checked.',
    }
  }

  return {
    found: true,
    grading_company: 'CGC',
    cert_number: certNumber,
    grade: gradeMatch[1],
    card_number: cardNumberMatch ? cardNumberMatch[1] : null,
    source_url: url,
    checked_at: new Date().toISOString(),
    note: 'CGC data is best-effort and may be incomplete — see the source link for the full record.',
  }
}

export const handler = async (event) => {
  const gradingCompany = (event.queryStringParameters?.company || '').toUpperCase()
  const certNumber = event.queryStringParameters?.cert

  if (!certNumber) {
    return { statusCode: 400, body: JSON.stringify({ error: 'cert is required' }) }
  }

  try {
    let result
    if (gradingCompany === 'PSA') {
      result = await lookupPSA(certNumber)
    } else if (gradingCompany === 'CGC') {
      result = await lookupCGC(certNumber)
    } else {
      result = {
        found: false,
        grading_company: gradingCompany || null,
        note: `Cert lookup isn't supported yet for ${gradingCompany || 'this grading company'} — only PSA and CGC (best-effort) are wired up so far.`,
      }
    }
    return { statusCode: 200, body: JSON.stringify(result) }
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ found: false, grading_company: gradingCompany, note: err.message }),
    }
  }
}
