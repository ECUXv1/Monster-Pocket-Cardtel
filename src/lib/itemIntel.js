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
 */
export async function syncItemIntel(item, userId) {
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

  // Only look up the reference if we don't already have a confirmed match —
  // no point re-querying on every save/view once it's found.
  if (!item.card_reference?.found && item.name) {
    try {
      patch.card_reference = await lookupCardDatabase({
        name: item.name,
        set_name: item.set_name,
        card_number: item.card_number,
      })
    } catch {
      // Same — best effort, retryable later.
    }
  }

  // For graded cards with a cert number, also check the grading company's
  // own site directly — ground truth for that exact card, plus (for PSA)
  // real sold prices tied to the same population.
  if (item.category === 'graded' && item.cert_number && item.grading_company && !item.cert_verification?.found) {
    try {
      patch.cert_verification = await lookupCertVerification(item.grading_company, item.cert_number)
    } catch {
      // Best effort — retryable later via the refresh button.
    }
  }

  if (Object.keys(patch).length <= 1) return null
  return upsertItem(patch, userId)
}
