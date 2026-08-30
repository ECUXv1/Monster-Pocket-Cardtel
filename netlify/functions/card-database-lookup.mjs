// Given a card name (and optionally set name / card number), this looks up
// the canonical card record from the Pokémon TCG database — a free public
// API of every official card ever printed. That gives us three things the
// eBay lookup and Claude's vision can't: a clean reference/scan image of
// the card, the printed stats (HP, types, attacks, rarity, artist, set),
// and TCGPlayer market price data as a second price signal alongside eBay.
//
// No API key is required for personal, low-volume use. If you want higher
// rate limits and more reliable results, get a free key at
// https://dev.pokemontcg.io and set POKEMONTCG_API_KEY as a Netlify
// environment variable — this function picks it up automatically if present.

function escapeLucene(str) {
  // Escape characters Lucene treats as syntax so a card name with them
  // (e.g. an apostrophe, colon, or parenthesis) doesn't break the query.
  return str.replace(/([+\-!(){}[\]^"~*?:\\/])/g, '\\$1')
}

async function search(query, pageSize = 5) {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${pageSize}`
  const headers = {}
  if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Pokemon TCG API responded ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export const handler = async (event) => {
  const name = event.queryStringParameters?.name
  const setName = event.queryStringParameters?.set
  const number = event.queryStringParameters?.number

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name is required' }) }
  }

  const safeName = escapeLucene(name)
  const safeSet = setName ? escapeLucene(setName) : null
  // The first word is usually the actual Pokémon/card name — the rest is
  // often a descriptive subtitle (e.g. "Pikachu with Grey Felt Hat") that
  // doesn't always match the database's stored name field verbatim.
  const firstWord = safeName.split(/\s+/)[0]

  // Escalating tiers: start exact and specific, end broad and forgiving.
  // Vision-read set names in particular are often verbose or slightly off
  // ("2023 Pokemon SVP EN Pokemon X Van Gogh" vs. however the database
  // actually labels that set), so quoted-exact-everything alone was
  // failing far more often than it should.
  const tiers = [
    number && safeSet ? `name:"${safeName}" set.name:"${safeSet}" number:${number}` : null,
    safeSet ? `name:"${safeName}" set.name:"${safeSet}"` : null,
    `name:"${safeName}"`, // exact name, any set
    `name:*${firstWord}*`, // wildcard on the primary word — catches subtitle mismatches
  ].filter(Boolean)

  let results = []
  let lastError = null
  // Each tier gets its own try/catch — a single failed/rate-limited
  // attempt (a real risk with pokemontcg.io's free, unauthenticated tier)
  // used to abort the ENTIRE lookup here, silently losing any chance the
  // next, broader tier would have succeeded. Now a failure just moves on.
  for (const query of tiers) {
    try {
      results = await search(query)
      if (results.length > 0) break
    } catch (err) {
      lastError = err
      results = []
    }
  }

  if (results.length === 0) {
    if (lastError) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          found: false,
          searched_for: name,
          note: `Couldn't reach the Pokémon TCG database right now (${lastError.message}) — try refreshing again shortly.`,
        }),
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        found: false,
        searched_for: name,
        note: "No match in the Pokémon TCG database — this can happen for very new, promotional, or limited-release cards that aren't indexed there yet.",
      }),
    }
  }

  try {
    const card = results[0]

    const reference = {
      found: true,
      id: card.id,
      name: card.name,
      supertype: card.supertype,
      subtypes: card.subtypes,
      hp: card.hp,
      types: card.types,
      rarity: card.rarity,
      artist: card.artist,
      flavor_text: card.flavorText,
      attacks: (card.attacks || []).map((a) => ({ name: a.name, cost: a.cost, damage: a.damage, text: a.text })),
      set: card.set
        ? {
            name: card.set.name,
            series: card.set.series,
            release_date: card.set.releaseDate,
            symbol_url: card.set.images?.symbol,
            logo_url: card.set.images?.logo,
          }
        : null,
      number: card.number,
      image_small: card.images?.small,
      image_large: card.images?.large,
      market: card.tcgplayer?.prices
        ? {
            source: 'tcgplayer',
            updated_at: card.tcgplayer.updatedAt,
            url: card.tcgplayer.url,
            prices: card.tcgplayer.prices,
          }
        : null,
    }

    return { statusCode: 200, body: JSON.stringify(reference) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
