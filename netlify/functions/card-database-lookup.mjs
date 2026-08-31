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
// So this doesn't just take the first search hit: it gathers candidates
// across several queries, scores every one of them against everything we
// know — card number is the strongest signal (it's effectively unique for
// a given name), set name is next, then how closely the name itself
// matches — and returns not just the single best match but the top 4,
// ranked, so a wrong automatic pick can be corrected by hand instead of
// silently trusted.
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function search(query, pageSize) {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${pageSize}`
  const headers = {}
  if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY

  // pokemontcg.io is a free, community-run service — occasional 502/503s
  // are transient blips, not a real outage, and usually clear up within a
  // second or two. Worth one quick retry before treating it as a real
  // failure and giving up on this tier of the search.
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) {
      const data = await res.json()
      return data.data || []
    }
    lastErr = new Error(`Pokemon TCG API responded ${res.status}`)
    if (res.status !== 502 && res.status !== 503 && res.status !== 504) break
    if (attempt === 0) await sleep(400)
  }
  throw lastErr
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

function buildReference(card) {
  return {
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

  // The card number sometimes arrives as "102/108" (numerator/total) —
  // only the numerator is a valid, searchable field value here, and an
  // unescaped "/" in a Lucene query is a syntax character, not a literal
  // slash. Strip it down before it ever goes into a query string.
  const queryNumber = number ? String(number).split('/')[0].replace(/^0+(?=\d)/, '').trim() : null

  // For picking a wildcard search term, skip short/generic tokens like
  // "M" (Mega), "EX", "GX", "V", "VMAX" — using one of those as `*term*`
  // matches a huge, essentially random slice of the whole database.
  // Prefer the longest non-generic word instead — the part that actually
  // identifies which Pokémon this is.
  const GENERIC_TOKENS = new Set([
    'm', 'mega', 'ex', 'gx', 'v', 'vmax', 'vstar', 'vunion', 'lv.x', 'delta',
    'shining', 'radiant', 'tag', 'team', 'prime', 'legend', 'break', 'star', 'the',
  ])
  const nameWords = safeName.split(/\s+/).filter(Boolean)
  const distinctiveWord =
    nameWords
      .filter((w) => w.length > 2 && !GENERIC_TOKENS.has(w.toLowerCase().replace(/[^a-z0-9]/gi, '')))
      .sort((a, b) => b.length - a.length)[0] || nameWords[0] || safeName

  const signals = { name, setName, number }

  // Escalating, increasingly broad queries. Every candidate seen across
  // every tier gets scored and kept — not just whichever tier happened to
  // return something first — so the final ranking reflects the best
  // matches out of everything searched, not just the first hit.
  const tiers = [
    queryNumber && safeSet ? { q: `name:"${safeName}" set.name:"${safeSet}" number:${queryNumber}`, pageSize: 5 } : null,
    queryNumber ? { q: `name:"${safeName}" number:${queryNumber}`, pageSize: 10 } : null,
    safeSet ? { q: `name:"${safeName}" set.name:"${safeSet}"`, pageSize: 15 } : null,
    { q: `name:"${safeName}"`, pageSize: 25 }, // exact name, any set — the common case for well-known Pokémon
    { q: `name:*${distinctiveWord}*`, pageSize: 25 }, // last resort — subtitle/typo tolerant, anchored on the distinctive word
  ].filter(Boolean)

  const scored = new Map() // card.id -> { card, score } — highest score per unique card across all tiers
  let lastError = null

  for (const tier of tiers) {
    try {
      const candidates = await search(tier.q, tier.pageSize)
      for (const card of candidates) {
        const score = scoreCandidate(card, signals)
        const existing = scored.get(card.id)
        if (!existing || score > existing.score) scored.set(card.id, { card, score })
      }
    } catch (err) {
      lastError = err
    }
    // A confirmed card-number match is about as certain as this gets — no
    // need to keep casting a wider net once we have one.
    if ([...scored.values()].some((s) => s.score >= 100)) break
  }

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score)

  if (ranked.length === 0) {
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
    const top4 = ranked.slice(0, 4)
    const bestScore = top4[0].score

    const candidates = top4.map(({ card, score }) => ({
      ...buildReference(card),
      match_score: Math.round(score),
    }))

    const reference = {
      found: true,
      ...candidates[0],
      // Below ~40, the match is really just "same name, unconfirmed print"
      // — worth flagging so the UI (and you) can treat it as a guess.
      match_confidence: bestScore >= 100 ? 'high' : bestScore >= 40 ? 'medium' : 'low',
      // The other plausible matches, ranked — lets the UI offer "not the
      // right card? here are 3 more" instead of silently trusting the top pick.
      candidates,
    }

    return { statusCode: 200, body: JSON.stringify(reference) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
