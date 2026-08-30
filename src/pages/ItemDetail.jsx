import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, ImageOff, Award, Tag, RefreshCw, TrendingUp, ExternalLink } from 'lucide-react'
import { getItem, deleteItem, upsertItem } from '../lib/inventoryStore'
import { useAuth } from '../lib/AuthContext'
import { money, itemProfit } from '../lib/format'
import { buildEbayQuery, fetchEbaySoldPrices, isEstimateStale } from '../lib/marketPrice'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkingPrice, setCheckingPrice] = useState(false)
  const [priceError, setPriceError] = useState('')

  useEffect(() => {
    getItem(id).then((d) => {
      setItem(d)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!item || item.is_sold) return
    if (!isEstimateStale(item.market_estimate)) return
    runPriceCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  async function runPriceCheck() {
    if (!item) return
    setCheckingPrice(true)
    setPriceError('')
    try {
      const query = buildEbayQuery(item)
      const estimate = await fetchEbaySoldPrices(query)
      const patch = { id: item.id, market_estimate: estimate }
      if (estimate.sample_size > 0 && Number(estimate.average) > 0) {
        patch.asking_price = Math.round(Number(estimate.average) * 100) / 100
      }
      const updated = await upsertItem(patch, user?.id)
      setItem((prev) => ({
        ...prev,
        market_estimate: updated.market_estimate ?? estimate,
        asking_price: updated.asking_price ?? prev.asking_price,
      }))
    } catch (err) {
      setPriceError(err.message || 'Could not check eBay prices.')
    } finally {
      setCheckingPrice(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item permanently?')) return
    await deleteItem(id)
    navigate('/inventory')
  }

  if (loading) return <div className="p-6 text-cream/40 text-sm">Loading…</div>
  if (!item) return <div className="p-6 text-cream/40 text-sm">Item not found.</div>

  const profit = itemProfit(item)
  const images = [item.front_image_url, item.back_image_url, item.slab_image_url].filter(Boolean)

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
        <div className="grid grid-cols-2 gap-3">
          {images.length > 0 ? (
            images.map((src, i) => (
              <div key={i} className={`slab-frame rounded-2xl overflow-hidden bg-surface-2 aspect-[3/4] ${images.length === 1 ? 'col-span-2' : ''}`}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))
          ) : (
            <div className="col-span-2 rounded-2xl bg-surface-2 aspect-video flex items-center justify-center">
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
              <Badge icon={Award} label={`${item.grading_company} ${item.grade}`} highlight />
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

          {item.card_reference?.found && <CardReference reference={item.card_reference} />}
          {item.condition_report?.condition && <ConditionReport report={item.condition_report} />}

          <MarketEstimate
            item={item}
            checking={checkingPrice}
            error={priceError}
            onRefresh={runPriceCheck}
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
        <p className="text-xs text-cream/40">No recent sold listings found for this search — try editing the name/set for a closer match.</p>
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
          <p className="text-xs font-display text-gold uppercase tracking-wide">Card database</p>
          <p className="text-sm font-semibold text-cream">{reference.name}</p>
          <p className="text-xs text-cream/50">
            {[reference.set?.name, reference.number, reference.rarity].filter(Boolean).join(' · ')}
          </p>
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
