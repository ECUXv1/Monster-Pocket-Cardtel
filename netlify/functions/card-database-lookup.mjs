// Given a card name (and optionally set name / card number), this looks up
// the canonical card record from the Pokémon TCG database — a free public
// API of every official card ever printed. That gives us three things the
// eBay lookup and Claude's vision can't: a clean reference/scan image of
// the card, the printed stats (HP, types, attacks, rarity, artist, set),
// and TCGPlayer market price data as a second price signal alongside eBay.
//
// No API key is required for personal, low-volume use. If you want higher
// rate limits, get a free key at https://dev.pokemontcg.io and set
// POKEMONTCG_API_KEY as a Netlify environment variable — this function
// picks it up automatically if present.

export const handler = async (event) => {
  const name = event.queryStringParameters?.name
  const setName = event.queryStringParameters?.set
  const number = event.queryStringParameters?.number

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name is required' }) }
  }

  // Build a Lucene-style query, most specific first.
  const clauses = [`name:"${name}"`]
  if (setName) clauses.push(`set.name:"${setName}"`)
  if (number) clauses.push(`number:${number}`)

  async function search(query, pageSize = 5) {
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${pageSize}`
    const headers = {}
    if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Pokemon TCG API responded ${res.status}`)
    const data = await res.json()
    return data.data || []
  }

  try {
    // Try the most specific query first, then relax it if nothing matches.
    let results = await search(clauses.join(' '))
    if (results.length === 0 && setName) results = await search(`name:"${name}" set.name:"${setName}"`)
    if (results.length === 0) results = await search(`name:"${name}"`)

    if (results.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ found: false }) }
    }

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
