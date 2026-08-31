import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, ImageOff, Award, Tag, RefreshCw, TrendingUp, ExternalLink, Expand } from 'lucide-react'
import { getItem, deleteItem, upsertItem } from '../lib/inventoryStore'
import { useAuth } from '../lib/AuthContext'
import { money, itemProfit } from '../lib/format'
import { isEstimateStale } from '../lib/marketPrice'
import { syncItemIntel } from '../lib/itemIntel'
import CardMatchPicker from '../components/CardMatchPicker'
import ImageLightbox from '../components/ImageLightbox'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkingPrice, setCheckingPrice] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [showCardPicker, setShowCardPicker] = useState(false)
  const [lightbox, setLightbox] = useState(null) // index into `images`, or null when closed

  useEffect(() => {
    getItem(id).then((d) => {
      setItem(d)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!item || item.is_sold) return
    const needsPrice = isEstimateStale(item.market_estimate)
    const needsReference = item.card_reference == null && item.name
    // Only auto-trigger these if they've genuinely never been attempted —
    // even with Parse.bot's more generous free tier than PSA's own token,
    // passively retrying on every page view after a failed/not-found
    // attempt isn't worth it. Once there's any recorded result (even a
    // failure), it stays put until you tap refresh on purpose.
    const needsCert =
      item.category === 'graded' && item.cert_number && item.grading_company && item.cert_verification == null
    const needsPriceGuide = item.check_price_guide && item.price_guide == null && item.name
    if (!needsPrice && !needsReference && !needsCert && !needsPriceGuide) return
    runPriceCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  async function runPriceCheck(options = {}) {
    if (!item) return
    setCheckingPrice(true)
    setPriceError('')
    try {
      const updated = await syncItemIntel(item, user?.id, options)
      if (updated) {
        setItem((prev) => ({
          ...prev,
          market_estimate: updated.market_estimate ?? prev.market_estimate,
          asking_price: updated.asking_price ?? prev.asking_price,
          card_reference: updated.card_reference ?? prev.card_reference,
          cert_verification: updated.cert_verification ?? prev.cert_verification,
          grade: updated.grade ?? prev.grade,
          price_guide: updated.price_guide ?? prev.price_guide,
        }))
      }
    } catch (err) {
      setPriceError(err.message || 'Could not check prices.')
    } finally {
      setCheckingPrice(false)
    }
  }

  async function handleEnablePriceGuide() {
    setCheckingPrice(true)
    try {
      const patchedItem = { ...item, check_price_guide: true }
      const updated = await syncItemIntel(patchedItem, user?.id)
      setItem((prev) => ({
        ...prev,
        check_price_guide: true,
        price_guide: updated?.price_guide ?? prev.price_guide,
      }))
      if (!updated) {
        // syncItemIntel returns null if nothing needed updating — still
        // need to persist the flag itself in that edge case.
        await upsertItem({ id: item.id, check_price_guide: true }, user?.id)
      }
    } catch (err) {
      setPriceError(err.message || 'Could not check the price guide.')
    } finally {
      setCheckingPrice(false)
    }
  }

  async function handleSelectCardMatch(picked) {
    const updated = await upsertItem(
      { id: item.id, card_reference: { ...picked, found: true, candidates: item.card_reference.candidates } },
      user?.id
    )
    setItem((prev) => ({ ...prev, card_reference: updated.card_reference ?? prev.card_reference }))
    setShowCardPicker(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this item permanently?')) return
    await deleteItem(id)
    navigate('/inventory')
  }

  if (loading) return <div className="p-6 text-cream/40 text-sm">Loading…</div>
  if (!item) return <div className="p-6 text-cream/40 text-sm">Item not found.</div>

  const profit = itemProfit(item)
  // Every image worth showing for this item: your own photos first, then
  // any reference photos the grading company itself has on file — PSA's
  // actual scan of this cert, or CGC's Obverse/Reverse images.
  const images = [
    item.front_image_url && { url: item.front_image_url, label: 'Your photo — front' },
    item.slab_image_url && { url: item.slab_image_url, label: 'Your photo — slab label' },
    item.back_image_url && { url: item.back_image_url, label: 'Your photo — back' },
    item.cert_verification?.image_front && {
      url: item.cert_verification.image_front,
      label: `${item.cert_verification.grading_company} reference photo — front`,
    },
    item.cert_verification?.image_back && {
      url: item.cert_verification.image_back,
      label: `${item.cert_verification.grading_company} reference photo — back`,
    },
  ].filter(Boolean)
  const hero = images[0]

  return (
    <div className="p-4 lg:p-8 pb-24 md:pb-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-5">
        <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-2">
          <Link to={`/edit/${id}`} className="h-10 px-4 rounded-full bg-surface-2 text-cream text-sm font-semibold flex items-center gap-2">
            <Pencil size={14} /> Edit
          </Link>
          <button onClick={handleDelete} className="h-10 w-10 rounded-full bg-surface-2 text-orange flex items-center justify-center">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          {hero ? (
            <>
              <button
                type="button"
                onClick={() => setLightbox(0)}
                className="group relative w-full slab-frame rounded-2xl overflow-hidden bg-surface-2 aspect-[3/4] shadow-[0_0_50px_-16px_rgba(123,47,247,0.55)]"
              >
                <img src={hero.url} alt={item.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-cream bg-black/60 px-3 py-1.5 rounded-full">
                    <Expand size={13} /> View full size
                  </span>
                </div>
              </button>

              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, i) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => setLightbox(i)}
                      className="slab-frame rounded-lg overflow-hidden bg-surface-2 aspect-square hover:ring-2 hover:ring-purple/50 transition"
                    >
                      <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-surface-2 aspect-video flex items-center justify-center">
              <ImageOff size={28} className="text-cream/20" />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            {item.is_sold && (
              <span className="inline-block bg-orange/20 text-orange text-[11px] font-bold px-2.5 py-1 rounded-full mb-2">SOLD</span>
            )}
            <h1 className="font-display text-xl lg:text-2xl text-cream leading-tight">{item.name}</h1>
            <p className="text-cream/50 text-sm mt-1">
              {[item.set_name, item.card_number, item.rarity].filter(Boolean).join(' · ') || 'No set details added'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge icon={Tag} label={item.category === 'graded' ? 'Graded slab' : 'Raw card'} />
            {item.category === 'graded' ? (
              <Badge icon={Award} label={item.grade != null ? `${item.grading_company} ${item.grade}` : `${item.grading_company} — ungraded`} highlight />
            ) : (
              <Badge label={item.condition || 'Condition unset'} />
            )}
            {item.quantity > 1 && <Badge label={`Qty ${item.quantity}`} />}
          </div>

          <div className="slab-frame rounded-2xl border border-line bg-surface p-4 grid grid-cols-2 gap-4">
            <Stat label="Paid" value={money(item.purchase_price)} />
            <Stat
              label={item.is_sold ? 'Sold for' : item.market_estimate?.sample_size > 0 ? 'Asking (market)' : 'Asking price'}
              value={money(item.is_sold ? item.sold_price : item.asking_price)}
              gold
            />
            <Stat label="Markup" value={`${item.markup_percent}%`} />
            <Stat label={item.is_sold ? 'Realized profit' : 'Unrealized profit'} value={money(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
          </div>

          {item.category === 'graded' && item.cert_number && (
            <p className="text-xs text-cream/40">Cert # {item.cert_number}</p>
          )}

          {item.cert_verification?.found && <CertVerification cert={item.cert_verification} />}
          {item.cert_verification?.found === false && (
            <p className="text-[11px] text-cream/35">
              {item.cert_verification.note} Won't retry automatically — tap the refresh icon below to try again.
            </p>
          )}

          {item.card_reference?.found && <CardReference reference={item.card_reference} />}
          {item.card_reference?.candidates?.length > 1 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowCardPicker((v) => !v)}
                className="text-[11px] text-purple-glow underline underline-offset-2"
              >
                {showCardPicker ? 'Hide other matches' : `Not the right card? See ${item.card_reference.candidates.length} matches`}
              </button>
              {showCardPicker && (
                <CardMatchPicker
                  candidates={item.card_reference.candidates}
                  selectedId={item.card_reference.id}
                  onSelect={handleSelectCardMatch}
                />
              )}
            </div>
          )}
          {item.card_reference?.found === false && (
            <p className="text-[11px] text-cream/35">
              {item.card_reference.note || 'No match in the Pokémon card database for this card.'}
            </p>
          )}
          {item.condition_report?.condition && <ConditionReport report={item.condition_report} />}
          {item.price_guide?.found && <PriceGuide guide={item.price_guide} />}
          {!item.check_price_guide && (
            <button
              type="button"
              onClick={handleEnablePriceGuide}
              disabled={checkingPrice}
              className="text-[11px] text-purple-glow underline underline-offset-2 disabled:opacity-50"
            >
              Check premium price guide (PriceCharting + Collectr) — ~4 Parse.bot credits
            </button>
          )}

          <MarketEstimate
            item={item}
            checking={checkingPrice}
            error={priceError}
            onRefresh={() => runPriceCheck({ forceCert: true })}
          />

          {(item.purchase_date || item.sold_date) && (
            <div className="text-xs text-cream/40 space-y-0.5">
              {item.purchase_date && <p>Purchased {item.purchase_date}</p>}
              {item.sold_date && <p>Sold {item.sold_date}</p>}
            </div>
          )}

          {item.notes && (
            <div>
              <p className="text-xs font-semibold text-cream/50 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-cream/70 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && (
        <ImageLightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} />
      )}
    </div>
  )
}

function Badge({ icon: Icon, label, highlight }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
        highlight ? 'bg-gold text-ink' : 'bg-surface-2 text-cream/70'
      }`}
    >
      {Icon && <Icon size={12} />}
      {label}
    </span>
  )
}

function Stat({ label, value, gold, tone }) {
  const color = gold ? 'text-gold' : tone === 'good' ? 'text-purple-glow' : tone === 'bad' ? 'text-orange' : 'text-cream'
  return (
    <div>
      <p className="text-[11px] font-semibold text-cream/40 uppercase tracking-wide">{label}</p>
      <p className={`font-num text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function MarketEstimate({ item, checking, error, onRefresh }) {
  const est = item.market_estimate

  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-purple-glow" />
          <p className="text-xs font-semibold text-cream uppercase tracking-wide">eBay recently sold</p>
          {est?.source && (
            <span className="mpc-badge !text-[8px] !py-0.5 !px-1.5">
              {est.source === 'soldcomps' ? 'via SoldComps' : 'via eBay scrape'}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={checking}
          className="h-8 w-8 rounded-full bg-surface-2 flex items-center justify-center text-cream/60 disabled:opacity-50"
        >
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
        </button>
      </div>

      {checking && !est && <p className="text-xs text-cream/40">Checking eBay's recently sold listings…</p>}

      {error && !checking && <p className="text-xs text-orange">{error}</p>}

      {est && est.sample_size > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Low" value={money(est.low)} />
            <MiniStat label="Avg / Median" value={money(est.average)} highlight />
            <MiniStat label="High" value={money(est.high)} />
          </div>
          <p className="text-[11px] text-cream/40">
            From {est.sample_size} recent sold listing{est.sample_size === 1 ? '' : 's'} · checked{' '}
            {new Date(est.checked_at).toLocaleDateString()}
          </p>
          {est.average > 0 && (
            <p className="text-xs text-cream/60">
              Asking price is set to this average automatically
              {item.markup_percent != null && (
                <>
                  {' '}
                  — cost + {item.markup_percent}% markup alone would've suggested{' '}
                  <span className="text-cream/70">{money(Math.round((item.purchase_price || 0) * (1 + (item.markup_percent || 0) / 100) * 100) / 100)}</span>
                </>
              )}
              .
            </p>
          )}
          {est.listings?.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {est.listings.slice(0, 3).map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 text-[11px] text-cream/50 hover:text-cream/80"
                >
                  <span className="truncate">{l.title}</span>
                  <span className="flex items-center gap-1 shrink-0 font-num text-cream/70">
                    {money(l.price)} <ExternalLink size={10} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : est && est.sample_size === 0 && !checking ? (
        <p className="text-xs text-cream/40">
          {est.error || 'No recent sold listings found for this search — try editing the name/set for a closer match.'}
        </p>
      ) : !checking && !error ? (
        <p className="text-xs text-cream/40">Not checked yet.</p>
      ) : null}
    </div>
  )
}

function MiniStat({ label, value, highlight }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold text-cream/40 uppercase tracking-wide">{label}</p>
      <p className={`font-num text-sm font-bold ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
    </div>
  )
}

function PriceGuide({ guide }) {
  const pc = guide.pricecharting
  const cr = guide.collectr

  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-4 space-y-3">
      <p className="text-xs font-display text-gold uppercase tracking-wide">Price guide (2nd opinion)</p>

      {pc?.prices && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-cream/40">PriceCharting</p>
          <div className="flex flex-wrap gap-3 mt-1">
            {pc.prices.ungraded != null && (
              <div className="text-center">
                <p className="text-[9px] text-cream/40">Ungraded</p>
                <p className="font-num text-xs font-bold text-cream">{money(pc.prices.ungraded)}</p>
              </div>
            )}
            {pc.prices.grade_9 != null && (
              <div className="text-center">
                <p className="text-[9px] text-cream/40">Grade 9</p>
                <p className="font-num text-xs font-bold text-cream">{money(pc.prices.grade_9)}</p>
              </div>
            )}
            {pc.prices.psa_10 != null && (
              <div className="text-center">
                <p className="text-[9px] text-cream/40">PSA 10</p>
                <p className="font-num text-xs font-bold text-purple-glow">{money(pc.prices.psa_10)}</p>
              </div>
            )}
            {pc.url && (
              <a href={pc.url} target="_blank" rel="noreferrer" className="ml-auto self-center text-[10px] text-cream/40 hover:text-cream/70 flex items-center gap-1">
                View <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      )}

      {cr && (cr.market_price || cr.graded_sub_types) && (
        <div className={pc?.prices ? 'pt-2 border-t border-line' : ''}>
          <p className="text-[10px] uppercase tracking-wide text-cream/40">Collectr</p>
          <div className="flex flex-wrap gap-3 mt-1">
            {cr.market_price && (
              <div className="text-center">
                <p className="text-[9px] text-cream/40">Market</p>
                <p className="font-num text-xs font-bold text-cream">{money(Number(cr.market_price))}</p>
              </div>
            )}
            {(cr.graded_sub_types || []).slice(0, 3).map((g, i) => {
              const price = Number(g.price ?? g.market_price ?? g.current_price)
              if (!Number.isFinite(price)) return null
              return (
                <div key={i} className="text-center">
                  <p className="text-[9px] text-cream/40">{g.grading_company} {g.grade_label}</p>
                  <p className="font-num text-xs font-bold text-purple-glow">{money(price)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CertVerification({ cert }) {
  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-display text-gold uppercase tracking-wide">
          Verified on {cert.grading_company}.com
          {(cert.source === 'parsebot_psa' || cert.source === 'parsebot_cgc') && (
            <span className="text-cream/30 normal-case font-body"> · via Parse.bot</span>
          )}
        </p>
        {cert.source_url && (
          <a
            href={cert.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-cream/40 hover:text-cream/70 flex items-center gap-1"
          >
            View cert <ExternalLink size={10} />
          </a>
        )}
      </div>

      {(cert.image_front || cert.image_back) && (
        <div className="flex gap-2">
          {cert.image_front && (
            <img src={cert.image_front} alt="PSA-photographed front" className="w-20 rounded-lg object-cover border border-line" />
          )}
          {cert.image_back && (
            <img src={cert.image_back} alt="PSA-photographed back" className="w-20 rounded-lg object-cover border border-line" />
          )}
        </div>
      )}

      {cert.description && <p className="text-sm font-semibold text-cream">{cert.description}</p>}
      {cert.grade_description && <p className="text-[11px] text-cream/50">{cert.grade_description}</p>}

      <div className="flex flex-wrap gap-1.5">
        {cert.grade && <span className="mpc-badge !text-[9px] !py-1">Grade {cert.grade}</span>}
        {cert.year && <span className="mpc-badge !text-[9px] !py-1">{cert.year}</span>}
        {cert.variety && <span className="mpc-badge !text-[9px] !py-1">{cert.variety}</span>}
        {cert.label_type && <span className="mpc-badge !text-[9px] !py-1">{cert.label_type}</span>}
        {cert.total_population != null && (
          <span className="mpc-badge !text-[9px] !py-1">Pop {cert.total_population}</span>
        )}
        {cert.population_higher != null && (
          <span className="mpc-badge !text-[9px] !py-1">{cert.population_higher} higher</span>
        )}
      </div>

      {cert.sold_comps?.length > 0 && (
        <div className="pt-1 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-cream/40">Recent sales, same cert population</p>
          <div className="flex flex-wrap gap-3">
            {cert.sold_comps.slice(0, 4).map((s, i) => (
              <div key={i} className="text-center">
                <p className="font-num text-xs font-bold text-purple-glow">{money(s.price)}</p>
                <p className="text-[9px] text-cream/40">{s.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {cert.note && <p className="text-[10px] text-cream/35 pt-1 border-t border-line">{cert.note}</p>}
    </div>
  )
}

function CardReference({ reference }) {
  const tcgPrices = reference.market?.prices
  const priceEntries = tcgPrices ? Object.entries(tcgPrices).filter(([, p]) => p?.market) : []

  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-4 flex gap-4">
      {reference.image_large && (
        <img
          src={reference.image_large}
          alt={reference.name}
          className="w-24 rounded-xl object-cover shrink-0 border border-line"
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-display text-gold uppercase tracking-wide">Card database</p>
            {reference.match_confidence === 'low' && (
              <span className="mpc-badge !text-[8px] !py-0.5 !px-1.5 !border-orange/40 !text-orange">unconfirmed match</span>
            )}
          </div>
          <p className="text-sm font-semibold text-cream">{reference.name}</p>
          <p className="text-xs text-cream/50">
            {[reference.set?.name, reference.number, reference.rarity].filter(Boolean).join(' · ')}
          </p>
          {reference.match_confidence === 'low' && (
            <p className="text-[10px] text-orange/70 mt-0.5">
              This is the closest name match found — the exact set/print couldn't be confirmed by card number.
            </p>
          )}
        </div>

        {(reference.hp || reference.types?.length > 0) && (
          <div className="flex flex-wrap gap-1.5 text-[10px] text-cream/60">
            {reference.hp && <span>HP {reference.hp}</span>}
            {reference.types?.length > 0 && <span>· {reference.types.join('/')}</span>}
            {reference.artist && <span>· Illus. {reference.artist}</span>}
          </div>
        )}

        {priceEntries.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1">
            {priceEntries.slice(0, 3).map(([variant, p]) => (
              <div key={variant} className="text-center">
                <p className="text-[9px] uppercase tracking-wide text-cream/40 capitalize">{variant}</p>
                <p className="font-num text-xs font-bold text-purple-glow">{money(p.market)}</p>
              </div>
            ))}
            {reference.market?.url && (
              <a
                href={reference.market.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto self-center text-[10px] text-cream/40 hover:text-cream/70 flex items-center gap-1"
              >
                TCGplayer <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConditionReport({ report }) {
  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-display text-gold">AI estimate: {report.condition}</span>
        {report.confidence && (
          <span className="text-[10px] text-cream/40 uppercase tracking-wide">{report.confidence} confidence</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-cream/60">
        {report.corners && (
          <p>
            <span className="text-cream/40">Corners:</span> {report.corners}
          </p>
        )}
        {report.edges && (
          <p>
            <span className="text-cream/40">Edges:</span> {report.edges}
          </p>
        )}
        {report.surface && (
          <p>
            <span className="text-cream/40">Surface:</span> {report.surface}
          </p>
        )}
        {report.centering && (
          <p>
            <span className="text-cream/40">Centering:</span> {report.centering}
          </p>
        )}
      </div>
      {report.notes && <p className="text-[10px] text-cream/40 italic">{report.notes}</p>}
      <p className="text-[10px] text-cream/30 pt-1 border-t border-line">
        Photo-based AI estimate, not a professional grade — treat as a rough sort, not a substitute for PSA/BGS/CGC.
      </p>
    </div>
  )
}
