import { buildEbayQuery, fetchEbaySoldPrices } from './marketPrice'
import { lookupCardDatabase, lookupCertVerification } from './captureSession'
import { upsertItem } from './inventoryStore'

/**
 * Runs both background checks for an item — eBay's recent-sold price and
 * the Pokémon TCG card database (reference image, stats, TCGplayer prices)
 * — and saves whatever comes back. This is the automatic behavior for
 * every item, whether its details were typed in by hand or filled in by
 * Auto-Identify: the card database lookup only ever needed a name to
 * search by, not a photo, so there was never a good reason to gate it
 * behind the vision step.
 *
 * Best-effort throughout — a failure in one check doesn't block the other,
 * and neither ever throws back to the caller (errors are recorded on the
 * saved item instead, so the UI can show them).
 *
 * `options.forceCert` — PSA's public API has a hard 100-requests-PER-DAY
 * quota, shared across everything using that token. Passively re-checking
 * on every page view or every re-save (even after a failed/not-found
 * attempt) burns through that fast without you ever asking for it. So by
 * default, a cert lookup only runs automatically if it has genuinely never
 * been attempted before (`cert_verification` is entirely absent) — once
 * there's ANY recorded result, success or failure, it stays put until you
 * explicitly tap refresh. Pass `forceCert: true` for that deliberate,
 * user-initiated retry.
 */
export async function syncItemIntel(item, userId, options = {}) {
  const { forceCert = false } = options
  const patch = { id: item.id }

  try {
    const query = buildEbayQuery(item)
    if (query) {
      const estimate = await fetchEbaySoldPrices(query)
      patch.market_estimate = estimate
      if (estimate.sample_size > 0 && Number(estimate.average) > 0) {
        patch.asking_price = Math.round(Number(estimate.average) * 100) / 100
      }
    }
  } catch {
    // Leave market_estimate untouched — the detail page's refresh button covers retrying.
  }

  // Only look up the reference if it's never been attempted — same
  // reasoning as the cert check below, though pokemontcg.io's limits are
  // much more forgiving than PSA's.
  if (item.card_reference == null && item.name) {
    try {
      patch.card_reference = await lookupCardDatabase({
        name: item.name,
        set_name: item.set_name,
        card_number: item.card_number,
      })
    } catch (err) {
      // Record the failure instead of leaving it silent — the detail page
      // should say *something* rather than just staying blank forever.
      patch.card_reference = { found: false, note: `Couldn't check the card database right now (${err.message}).` }
    }
  }

  // For graded cards with a cert number, also check the grading company's
  // own site directly — ground truth for that exact card, plus (for PSA)
  // real sold prices tied to the same population.
  const certNeverTried = item.cert_verification == null
  if (item.category === 'graded' && item.cert_number && item.grading_company && (certNeverTried || forceCert)) {
    try {
      patch.cert_verification = await lookupCertVerification(item.grading_company, item.cert_number)
    } catch (err) {
      patch.cert_verification = {
        found: false,
        grading_company: item.grading_company,
        note: `Couldn't reach ${item.grading_company}'s site right now (${err.message}).`,
      }
    }
  }

  if (Object.keys(patch).length <= 1) return null
  return upsertItem(patch, userId)
}
