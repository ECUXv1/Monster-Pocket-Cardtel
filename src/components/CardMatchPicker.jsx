import { money } from '../lib/format'

/**
 * Shows up to 4 ranked card-database candidates as tappable thumbnails.
 * Used when the automatic top pick might be wrong — lets the person
 * confirm or correct it by eye instead of trusting the algorithm blindly.
 */
export default function CardMatchPicker({ candidates, selectedId, onSelect }) {
  if (!candidates || candidates.length < 2) return null

  return (
    <div className="grid grid-cols-2 gap-2">
      {candidates.map((c) => {
        const isSelected = c.id === selectedId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className={`rounded-xl border p-2 flex gap-2 text-left transition ${
              isSelected ? 'border-purple bg-purple/10' : 'border-line bg-surface hover:border-purple/40'
            }`}
          >
            {c.image_small && (
              <img src={c.image_small} alt={c.name} className="w-10 rounded object-cover shrink-0 border border-line" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-cream truncate">{c.name}</p>
              <p className="text-[10px] text-cream/50 truncate">{[c.set?.name, c.number].filter(Boolean).join(' · ')}</p>
              {c.market?.prices?.holofoil?.market && (
                <p className="text-[10px] text-purple-glow mt-0.5">{money(c.market.prices.holofoil.market)}</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
