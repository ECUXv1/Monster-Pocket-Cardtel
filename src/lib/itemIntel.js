import { buildEbayQuery, fetchEbaySoldPrices } from './marketPrice'
import { lookupCardDatabase, lookupCertVerification, lookupPriceGuide } from './captureSession'
import { upsertItem, resolveAskingPrice } from './inventoryStore'

/**
 * Runs the background checks for an item — eBay's recent-sold price, the
 * Pokémon TCG card database (reference image, stats, TCGplayer prices),
 * cert verification for graded cards (PSA/CGC via Parse.bot), and a second
 * price-guide check (PriceCharting + Collectr) — and saves whatever comes
 * back. This is the automatic behavior for every item, whether its details
 * were typed in by hand or filled in by Auto-Identify: none of these
 * lookups actually need a photo, just the details already on the item.
 *
 * Best-effort throughout — a failure in one check doesn't block the
 * others, and none of them ever throw back to the caller (errors are
 * recorded on the saved item instead, so the UI can show them).
 *
 * `options.forceCert` — even with Parse.bot's more generous free tier
 * (200 credits/month) instead of PSA's own 100-requests-per-day token,
 * passively re-checking on every page view or every re-save still isn't
 * worth doing. So by default, the cert check and the price-guide check
 * each only run automatically if they've genuinely never been attempted
 * before (the field is entirely absent) — once there's ANY recorded
 * result, success or failure, it stays put until you explicitly tap
 * refresh. Pass `forceCert: true` for that deliberate, user-initiated retry.
 */
export async function syncItemIntel(item, userId, options = {}) {
  const { forceCert = false } = options
  const patch = { id: item.id }

  try {
    const query = buildEbayQuery(item)
    if (query) {
      const estimate = await fetchEbaySoldPrices(query)
      patch.market_estimate = estimate
      // Only let this drive the actual asking price if that's the source
      // you've chosen for this item — if you've picked PSA's estimate or
      // typed in a custom number, a fresh eBay sync shouldn't silently
      // overwrite that choice.
      const usingMedian = !item.pricing_source || item.pricing_source === 'median'
      if (usingMedian && estimate.sample_size > 0 && Number(estimate.median) > 0) {
        patch.asking_price = Math.round(Number(estimate.median) * 100) / 100
      }
    }
  } catch {
    // Leave market_estimate untouched — the detail page's refresh button covers retrying.
  }

  // Only look up the reference if it's never been attempted — same
  // reasoning as the checks below.
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
  // own site directly — ground truth for that exact card, plus the actual
  // reference photo of that specific slab.
  const certNeverTried = item.cert_verification == null
  if (item.category === 'graded' && item.cert_number && item.grading_company && (certNeverTried || forceCert)) {
    try {
      patch.cert_verification = await lookupCertVerification(item.grading_company, item.cert_number)
      // Backfill a missing grade from the cert data too — grading
      // companies' APIs return a formatted string like "GEM MT 10", so
      // pull out just the number. Never overwrites a grade you already
      // entered, only fills in a genuinely empty one.
      if (patch.cert_verification.found && patch.cert_verification.grade && (item.grade == null || item.grade === '')) {
        const numeric = String(patch.cert_verification.grade).match(/(\d+(\.\d+)?)/)
        if (numeric) patch.grade = Number(numeric[1])
      }
      // If PSA's estimate is the chosen pricing source, apply it the
      // moment it actually arrives — otherwise it'd just sit in
      // cert_verification without ever updating the real asking price.
      if (item.pricing_source === 'psa') {
        patch.asking_price = resolveAskingPrice({ ...item, cert_verification: patch.cert_verification })
      }
    } catch (err) {
      patch.cert_verification = {
        found: false,
        grading_company: item.grading_company,
        note: `Couldn't reach ${item.grading_company}'s site right now (${err.message}).`,
      }
    }
  }

  // A second, independent price signal (PriceCharting + Collectr)
  // alongside eBay/SoldComps — useful for thinly-traded cards where eBay
  // has few or no recent comps. This costs real Parse.bot credits (~4 per
  // item: PriceCharting search + Collectr search + Collectr detail), so
  // unlike everything else here, it's opt-in per item — only runs if
  // `check_price_guide` is explicitly turned on for that item.
  const priceGuideNeverTried = item.price_guide == null
  if (item.check_price_guide && item.name && (priceGuideNeverTried || forceCert)) {
    try {
      patch.price_guide = await lookupPriceGuide({ name: item.name, set_name: item.set_name })
    } catch (err) {
      patch.price_guide = { found: false, note: `Couldn't check PriceCharting/Collectr right now (${err.message}).` }
    }
  }

  if (Object.keys(patch).length <= 1) return null
  return upsertItem(patch, userId)
}
