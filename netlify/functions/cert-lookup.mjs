// Looks up a graded card's certification number directly on the grading
// company's own site — the actual source of truth for that exact card,
// not a generic database entry. For PSA this reliably returns the full
// card description, grade, and (as a bonus) PSA's own recent eBay sold
// prices for that exact cert/population. For CGC, it's best-effort: CGC's
// site runs bot detection that blocks even a plain request, and its cert
// page relies on client-side rendering for some fields, so this may not
// always succeed — it fails gracefully rather than breaking anything when
// it can't get through.
//
// PSA: https://www.psacard.com/cert/{certNumber}/psa — server-rendered,
//   reliable, confirmed working.
// CGC: https://www.cgccards.com/certlookup/{certNumber}/ — attempted with
//   full browser headers; treat as unreliable.
// BGS and SGC aren't implemented yet.

import * as cheerio from 'cheerio'

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'upgrade-insecure-requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
}

function cleanText($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim()
}

async function lookupPSA(certNumber) {
  const url = `https://www.psacard.com/cert/${encodeURIComponent(certNumber)}/psa`
  const res = await fetch(url, { headers: { ...BROWSER_HEADERS, referer: 'https://www.psacard.com/cert' } })
  if (!res.ok) throw new Error(`PSA responded ${res.status}`)
  const html = await res.text()
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
  // not just a keyword search.
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
    checked_at: new Date().toISOString(),
  }
}

async function lookupCGC(certNumber) {
  const url = `https://www.cgccards.com/certlookup/${encodeURIComponent(certNumber)}/`
  let res
  try {
    res = await fetch(url, { headers: { ...BROWSER_HEADERS, referer: 'https://www.cgccards.com/certlookup/' } })
  } catch {
    return { found: false, grading_company: 'CGC', note: "Couldn't reach CGC's site for this lookup." }
  }
  if (!res.ok) {
    return {
      found: false,
      grading_company: 'CGC',
      note: 'CGC lookup is currently unavailable (their site is blocking automated checks) — try again later, or check cgccards.com/certlookup directly.',
    }
  }

  const html = await res.text()
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
