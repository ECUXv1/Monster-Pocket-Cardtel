// Given a card name (and optionally set name / card number), this looks up
// the canonical card record from the Pokémon TCG database — a free public
// API of every official card ever printed. That gives us three things the
// eBay lookup and Claude's vision can't: a clean reference/scan image of
// the card, the printed stats (HP, types, attacks, rarity, artist, set),
// and TCGPlayer market price data as a second price signal alongside eBay.
//
// The tricky part isn't finding *a* card with the right name — it's finding
// the *specific print*. Most Pokémon have been printed dozens of times
// across different sets (a "Gengar" search alone returns 50+ real cards).
// So this doesn't just take the first search hit: it gathers several
// candidates and scores each one against everything we know — card number
// is the strongest signal (it's effectively unique for a given name), set
// name is next, then how closely the name itself matches — and returns
// whichever candidate actually fits best.
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

async function search(query, pageSize) {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${pageSize}`
  const headers = {}
  if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Pokemon TCG API responded ${res.status}`)
  const data = await res.json()
  return data.data || []
}

function normalizeNumber(n) {
  // Card numbers sometimes have leading zeros ("008" vs "8") or a total
  // suffix ("8/102" vs just "8") depending on where they came from.
  return String(n ?? '')
    .split('/')[0]
    .replace(/^0+(?=\d)/, '')
    .trim()
    .toLowerCase()
}

function tokenOverlapScore(a, b) {
  const aTokens = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const bTokens = b.toLowerCase().split(/\s+/).filter(Boolean)
  if (aTokens.size === 0 || bTokens.length === 0) return 0
  const overlap = bTokens.filter((t) => aTokens.has(t)).length
  return overlap / Math.max(aTokens.size, bTokens.length)
}

// Higher is better. Card number match dominates — it's the closest thing
// to a unique key for "which exact print of this Pokémon" — set name is a
// strong secondary signal, and name similarity is really just a sanity
// check at this point since the query already filtered on name.
function scoreCandidate(card, { name, setName, number }) {
  let score = 0

  if (number) {
    const wanted = normalizeNumber(number)
    const got = normalizeNumber(card.number)
    if (wanted && got && wanted === got) score += 100
  }

  if (setName && card.set?.name) {
    const a = setName.toLowerCase().trim()
    const b = card.set.name.toLowerCase().trim()
    if (a === b) score += 50
    else if (a.includes(b) || b.includes(a)) score += 30
    else score += tokenOverlapScore(a, b) * 25
  }

  if (name && card.name) {
    const a = name.toLowerCase().trim()
    const b = card.name.toLowerCase().trim()
    if (a === b) score += 20
    else if (a.includes(b) || b.includes(a)) score += 12
    else score += tokenOverlapScore(a, b) * 10
  }

  return score
}

function pickBest(candidates, signals) {
  let best = null
  let bestScore = -Infinity
  for (const card of candidates) {
    const score = scoreCandidate(card, signals)
    if (score > bestScore) {
      bestScore = score
      best = card
    }
  }
  return { card: best, score: bestScore }
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
  const signals = { name, setName, number }

  // Escalating, increasingly broad queries — each one pulls a batch of
  // candidates (not just one result) so they can be scored against each
  // other, rather than trusting whichever query happened to return
  // something non-empty first.
  const tiers = [
    number && safeSet ? { q: `name:"${safeName}" set.name:"${safeSet}" number:${number}`, pageSize: 5 } : null,
    number ? { q: `name:"${safeName}" number:${number}`, pageSize: 10 } : null,
    safeSet ? { q: `name:"${safeName}" set.name:"${safeSet}"`, pageSize: 15 } : null,
    { q: `name:"${safeName}"`, pageSize: 25 }, // exact name, any set — the common case for well-known Pokémon
    { q: `name:*${firstWord}*`, pageSize: 25 }, // last resort — subtitle/typo tolerant
  ].filter(Boolean)

  let best = null
  let bestScore = -Infinity
  let lastError = null

  for (const tier of tiers) {
    try {
      const candidates = await search(tier.q, tier.pageSize)
      if (candidates.length === 0) continue
      const result = pickBest(candidates, signals)
      if (result.score > bestScore) {
        best = result.card
        bestScore = result.score
      }
      // A confirmed card-number match is about as certain as this gets —
      // no need to keep casting a wider net once we have one.
      if (bestScore >= 100) break
    } catch (err) {
      lastError = err
    }
  }

  if (!best) {
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
    const card = best

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
      // Below ~40, the match is really just "same name, unconfirmed print"
      // — worth flagging so the UI (and you) can treat it as a guess.
      match_confidence: bestScore >= 100 ? 'high' : bestScore >= 40 ? 'medium' : 'low',
    }

    return { statusCode: 200, body: JSON.stringify(reference) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
