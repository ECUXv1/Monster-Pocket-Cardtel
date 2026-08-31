import { money, parsePsaEstimate } from '../lib/format'

/**
 * item: needs category, market_estimate, cert_verification, pricing_source,
 * custom_asking_price — reads current values to show each option's number.
 * onChange(source): called when a source pill is tapped.
 * onCustomChange(value): called as the custom price input changes.
 */
export default function PricingSourceSelector({ item, onChange, onCustomChange }) {
  const median = item.market_estimate?.sample_size > 0 ? Number(item.market_estimate.median) : null
  const psaEstimate = item.category === 'graded' ? parsePsaEstimate(item.cert_verification?.price_estimate) : null
  const source = item.pricing_source || 'median'

  const options = [
    { key: 'median', label: 'Market median', value: median, note: median ? `${item.market_estimate.sample_size} recent sales` : 'No eBay data yet' },
    ...(item.category === 'graded'
      ? [{ key: 'psa', label: 'PSA estimate', value: psaEstimate, note: psaEstimate ? "PSA's own value estimate" : 'Not available for this cert' }]
      : []),
    { key: 'custom', label: 'Custom', value: Number(item.custom_asking_price) || null, note: 'Type in your own price' },
  ]

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${item.category === 'graded' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((opt) => {
          const active = source === opt.key
          const disabled = opt.key !== 'custom' && !opt.value
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              className={`rounded-xl border p-2.5 text-left transition disabled:opacity-40 ${
                active ? 'border-purple bg-purple/10' : 'border-line bg-surface hover:border-purple/40'
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-cream/50">{opt.label}</p>
              <p className="font-num text-sm font-bold text-cream mt-0.5">{opt.value ? money(opt.value) : '—'}</p>
              <p className="text-[9px] text-cream/35 mt-0.5 leading-tight">{opt.note}</p>
            </button>
          )
        })}
      </div>

      {source === 'custom' && (
        <label className="block">
          <span className="text-xs font-semibold text-cream/60">Your price</span>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/40 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={item.custom_asking_price ?? ''}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="0.00"
              className="w-full h-11 rounded-xl bg-surface border border-line pl-7 pr-3 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-purple"
            />
          </div>
        </label>
      )}
    </div>
  )
}
