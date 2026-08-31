// Looks up a graded card's certification number — PSA and CGC both go
// through Parse.bot's managed wrappers (see lib/parsebot.mjs) rather than
// scraping either site directly or relying on PSA's own official API,
// whose token is generated from login credentials and expires
// unpredictably. Parse.bot handles the anti-bot fight and site-maintenance
// burden on their end, and both wrappers return actual reference images —
// PSA's the photo they took of that specific card, CGC's the Obverse/Reverse
// scans — which is the whole reason this exists.
//
// BGS and SGC aren't wired up yet.

import { callParse } from './lib/parsebot.mjs'

async function lookupPSA(certNumber) {
  const data = await callParse('psa', 'get_cert_details', { cert_number: certNumber })

  if (!data || !data.grade) {
    return { found: false, grading_company: 'PSA', note: 'No PSA record found for that cert number.' }
  }

  const description = data.card_title || [data.year, data.brand, data.subject, data.variety].filter(Boolean).join(' ') || null

  return {
    found: true,
    grading_company: 'PSA',
    cert_number: data.cert_number || certNumber,
    description,
    grade: data.grade || null,
    year: data.year || null,
    brand: data.brand || null,
    subject: data.subject || null,
    card_number: data.card_number || null,
    variety: data.variety || null,
    total_population: data.population || null,
    price_estimate: data.psa_estimate || null,
    image_front: data.front_image_url || (data.images && data.images[0]) || null,
    image_back: data.back_image_url || (data.images && data.images[1]) || null,
    source_url: `https://www.psacard.com/cert/${data.cert_number || certNumber}/psa`,
    source: 'parsebot_psa',
    checked_at: new Date().toISOString(),
  }
}

async function lookupCGC(certNumber) {
  const data = await callParse('cgc', 'lookup_cert', { cert_number: certNumber })

  if (!data || !data.grade) {
    return { found: false, grading_company: 'CGC', note: 'No CGC record found for that cert number.' }
  }

  const images = data.images || []
  const front = images.find((i) => /obverse|front/i.test(i.title || ''))?.url || images[0]?.url || null
  const back = images.find((i) => /reverse|back/i.test(i.title || ''))?.url || (images[1] && images[1].url !== front ? images[1].url : null)

  const description = [data.card_name, data.variant_1, data.variant_2].filter(Boolean).join(' — ') || null

  return {
    found: true,
    grading_company: 'CGC',
    cert_number: data.cert_number || certNumber,
    description,
    grade: data.grade || null,
    year: data.year || null,
    brand: data.game || null,
    subject: data.card_name || null,
    card_number: data.card_number || null,
    variety: [data.variant_1, data.variant_2].filter(Boolean).join(', ') || null,
    image_front: front,
    image_back: back,
    source_url: `https://www.cgccards.com/certlookup/${data.cert_number || certNumber}/`,
    source: 'parsebot_cgc',
    checked_at: new Date().toISOString(),
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
        note: `Cert lookup isn't supported yet for ${gradingCompany || 'this grading company'} — only PSA and CGC are wired up so far.`,
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
