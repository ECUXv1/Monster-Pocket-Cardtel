// Builds a reasonable eBay search string from what we know about the item,
// and calls the ebay-sold-prices Netlify function to get a market estimate.

export function buildEbayQuery(item) {
  const parts = [item.name]
  if (item.set_name) parts.push(item.set_name)
  if (item.card_number) parts.push(item.card_number)

  if (item.category === 'graded') {
    if (item.grading_company) parts.push(item.grading_company)
    if (item.grade) parts.push(String(item.grade))
  }

  return parts.filter(Boolean).join(' ').trim()
}

export async function fetchEbaySoldPrices(query) {
  const res = await fetch(`/.netlify/functions/ebay-sold-prices?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'eBay lookup failed')
  return data
}

const STALE_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export function isEstimateStale(estimate) {
  if (!estimate?.checked_at) return true
  return Date.now() - new Date(estimate.checked_at).getTime() > STALE_MS
}
