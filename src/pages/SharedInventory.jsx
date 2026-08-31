import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ImageOff, Layers, Award, Tag } from 'lucide-react'
import { getSharedInventory } from '../lib/inventoryStore'
import { money } from '../lib/format'
import CinematicHero from '../components/CinematicHero'

export default function SharedInventory() {
  const { token } = useParams()
  const [items, setItems] = useState(null) // null = loading, [] = loaded empty
  const [error, setError] = useState('')

  useEffect(() => {
    getSharedInventory(token)
      .then(setItems)
      .catch((err) => setError(err.message || 'Could not load this collection.'))
  }, [token])

  const totalValue = (items || []).reduce((s, i) => s + (Number(i.asking_price) || 0) * (Number(i.quantity) || 1), 0)
  const rawCount = (items || []).filter((i) => i.category === 'raw').length
  const gradedCount = (items || []).filter((i) => i.category === 'graded').length

  return (
    <div className="min-h-screen bg-ink pb-16">
      <CinematicHero eyebrow="RIP · TRADE · GRADE · REPEAT" title="MONSTER POCKET CARD-tel HQ" tagline="Shared collection" />

      <div className="p-4 lg:p-8 max-w-5xl mx-auto -mt-6 space-y-6">
        {error ? (
          <div className="slab-frame rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="text-cream font-display text-sm mb-1">This link isn't active</p>
            <p className="text-cream/40 text-xs">The owner may have turned sharing off, or generated a new link.</p>
          </div>
        ) : items === null ? (
          <p className="text-cream/40 text-sm text-center py-10">Loading collection…</p>
        ) : items.length === 0 ? (
          <div className="slab-frame rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="text-cream font-display text-sm">Nothing listed right now</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat icon={Layers} label="Total value" value={money(totalValue)} tone="gold" />
              <SummaryStat icon={Tag} label="Raw cards" value={rawCount} tone="purple" />
              <SummaryStat icon={Award} label="Graded slabs" value={gradedCount} tone="cream" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
              {items.map((item) => (
                <SharedCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        <p className="text-center font-display text-[9px] tracking-[0.2em] text-gold/40 pt-6">
          RIP · TRADE · GRADE · REPEAT
        </p>
      </div>
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value, tone }) {
  const toneClass = { gold: 'text-gold', purple: 'text-purple-glow', cream: 'text-cream' }[tone] || 'text-cream'
  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-3 lg:p-4 text-center">
      <Icon size={16} className={`mx-auto mb-1.5 ${toneClass}`} />
      <p className={`font-num text-lg lg:text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="text-[10px] lg:text-xs text-cream/40 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function SharedCard({ item }) {
  const src = item.front_image_url || item.slab_image_url || item.reference_image_url
  return (
    <div className="group relative slab-frame rounded-2xl overflow-hidden bg-surface-2 aspect-[3/4] shadow-[0_4px_20px_-8px_rgba(0,0,0,0.6)]">
      {src ? (
        <img src={src} alt={item.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff size={28} className="text-cream/15" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
      {item.category === 'graded' && (
        <span className="absolute top-2 left-2 bg-gold text-ink text-[10px] font-display px-2 py-0.5 rounded shadow-[0_0_10px_-2px_rgba(255,214,10,0.8)]">
          {item.grading_company} {item.grade}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-sm font-semibold text-cream truncate leading-tight">{item.name}</p>
        <p className="text-[11px] text-cream/50 truncate">
          {[item.set_name, item.card_number].filter(Boolean).join(' · ') || item.condition || 'Unsorted'}
        </p>
        <p className="font-num text-base font-bold text-gold mt-1">{money(item.asking_price)}</p>
      </div>
    </div>
  )
}
