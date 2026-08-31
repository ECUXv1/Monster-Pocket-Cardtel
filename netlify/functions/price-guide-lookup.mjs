// A second, independent price signal alongside eBay/SoldComps — pulls
// current prices by grade from PriceCharting and Collectr, both via
// Parse.bot's managed wrappers (see lib/parsebot.mjs). Useful as a
// cross-check: eBay/SoldComps reflects actual recent sales, these reflect
// each site's own maintained price guide, which can be steadier for
// thinly-traded cards where eBay has few or no recent comps.

import { callParse } from './lib/parsebot.mjs'

function pickBestByName(items, name, getName) {
  if (!items || items.length === 0) return null
  const target = name.toLowerCase().trim()
  let best = items[0]
  let bestScore = -1
  for (const item of items) {
    const itemName = (getName(item) || '').toLowerCase().trim()
    let score = 0
    if (itemName === target) score = 100
    else if (itemName.includes(target) || target.includes(itemName)) score = 50
    else {
      const targetWords = new Set(target.split(/\s+/))
      const overlap = itemName.split(/\s+/).filter((w) => targetWords.has(w)).length
      score = overlap * 10
    }
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

async function lookupPriceCharting(name, setName) {
  const query = [name, setName].filter(Boolean).join(' ')
  const data = await callParse('pricecharting', 'search_pokemon_cards', { query })
  const cards = data?.cards || []
  const best = pickBestByName(cards, name, (c) => c.name)
  if (!best) return null

  return {
    name: best.name,
    set: best.set,
    prices: best.prices || null, // { ungraded, grade_9, psa_10 }
    url: best.url,
  }
}

async function lookupCollectr(name) {
  const searchData = await callParse('collectr', 'search_products', { query: name, limit: 8 })
  const items = (searchData?.items || []).filter((i) => i.is_card)
  const best = pickBestByName(items, name, (i) => i.product_name)
  if (!best) return null

  let details = null
  try {
    details = await callParse('collectr', 'get_product_details', { product_id: best.product_id })
  } catch {
    // Fall back to just the search-result summary if the detail call fails.
  }

  return {
    name: best.product_name,
    set: best.catalog_group,
    rarity: best.rarity,
    image_url: best.image_url,
    market_price: details?.market_price ?? null,
    graded_sub_types: details?.graded_sub_types ?? null,
    price_history: (details?.price_history ?? []).slice(0, 10),
  }
}

export const handler = async (event) => {
  const name = event.queryStringParameters?.name
  const setName = event.queryStringParameters?.set

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name is required' }) }
  }

  const result = { found: false, checked_at: new Date().toISOString() }
  const notes = []

  try {
    result.pricecharting = await lookupPriceCharting(name, setName)
    if (result.pricecharting) result.found = true
  } catch (err) {
    notes.push(`PriceCharting: ${err.message}`)
  }

  try {
    result.collectr = await lookupCollectr(name)
    if (result.collectr) result.found = true
  } catch (err) {
    notes.push(`Collectr: ${err.message}`)
  }

  if (notes.length > 0) result.note = notes.join(' ')
  if (!result.found && notes.length === 0) {
    result.note = 'No match found in PriceCharting or Collectr for this card.'
  }

  return { statusCode: 200, body: JSON.stringify(result) }
}
