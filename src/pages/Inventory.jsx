import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, SlidersHorizontal, ImageOff, PlusCircle } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { listItems } from '../lib/inventoryStore'
import { money, itemProfit, itemImage } from '../lib/format'
import { useCustomerView } from '../lib/CustomerViewContext'
import CinematicHero from '../components/CinematicHero'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'raw', label: 'Raw cards' },
  { key: 'graded', label: 'Graded slabs' },
  { key: 'sold', label: 'Sold' },
]

const SORTS = [
  { key: 'recent', label: 'Recently added' },
  { key: 'value_desc', label: 'Value: high to low' },
  { key: 'value_asc', label: 'Value: low to high' },
  { key: 'profit_desc', label: 'Profit: high to low' },
]

export default function Inventory() {
  const { user } = useAuth()
  const [customerView] = useCustomerView()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [q, setQ] = useState('')

  useEffect(() => {
    listItems(user?.id).then((d) => {
      setItems(d)
      setLoading(false)
    })
  }, [user?.id])

  const filtered = useMemo(() => {
    let list = [...items]
    if (filter === 'raw') list = list.filter((i) => i.category === 'raw' && !i.is_sold)
    else if (filter === 'graded') list = list.filter((i) => i.category === 'graded' && !i.is_sold)
    else if (filter === 'sold') list = list.filter((i) => i.is_sold)
    else list = list.filter((i) => !i.is_sold)

    if (q.trim()) {
      const needle = q.toLowerCase()
      list = list.filter((i) =>
        [i.name, i.set_name, i.card_number, i.grading_company].filter(Boolean).join(' ').toLowerCase().includes(needle)
      )
    }

    if (sort === 'value_desc') list.sort((a, b) => (b.asking_price || 0) - (a.asking_price || 0))
    else if (sort === 'value_asc') list.sort((a, b) => (a.asking_price || 0) - (b.asking_price || 0))
    else if (sort === 'profit_desc') list.sort((a, b) => itemProfit(b) - itemProfit(a))
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return list
  }, [items, filter, sort, q])

  return (
    <div className="pb-24 md:pb-8">
      <CinematicHero eyebrow="THE VAULT" title="INVENTORY" compact />

      <div className="p-4 lg:p-8 -mt-6 space-y-5">
        <header className="flex items-center justify-end">
          <Link
            to="/add"
            className="hidden md:flex items-center gap-2 rounded-xl bg-gold text-ink font-bold px-4 py-2.5 text-sm active:scale-95 shadow-[0_0_24px_-6px_rgba(255,214,10,0.5)]"
          >
            <PlusCircle size={16} /> Add item
          </Link>
        </header>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, set, card #..."
              className="w-full h-12 rounded-xl bg-surface border border-line pl-10 pr-3 text-sm text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-purple"
            />
          </div>
          <div className="relative">
            <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/40 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-12 rounded-xl bg-surface border border-line pl-9 pr-3 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-purple appearance-none"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                filter === f.key ? 'bg-purple text-white shadow-[0_0_16px_-4px_rgba(123,47,247,0.8)]' : 'bg-surface-2 text-cream/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-cream/40 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-cream/40 text-sm py-10 text-center">No items match. Try a different filter or add a new item.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
            {filtered.map((item) => (
              <Card key={item.id} item={item} customerView={customerView} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ item, customerView }) {
  const src = itemImage(item)
  const profit = itemProfit(item)
  return (
    <Link
      to={`/item/${item.id}`}
      className="group relative slab-frame rounded-2xl overflow-hidden bg-surface-2 aspect-[3/4] shadow-[0_4px_20px_-8px_rgba(0,0,0,0.6)] hover:shadow-[0_0_36px_-6px_rgba(123,47,247,0.65)] transition-shadow"
    >
      {src ? (
        <img
          src={src}
          alt={item.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff size={28} className="text-cream/15" />
        </div>
      )}

      {/* Gradient scrim so name/price sit directly on the artwork, museum-placard style */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

      {item.category === 'graded' && (
        <span className="absolute top-2 left-2 bg-gold text-ink text-[10px] font-display px-2 py-0.5 rounded shadow-[0_0_10px_-2px_rgba(255,214,10,0.8)]">
          {item.grading_company} {item.grade}
        </span>
      )}
      {item.is_sold && (
        <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <span className="text-cream font-display text-sm tracking-wide rotate-[-8deg] border-2 border-cream px-3 py-1 rounded">
            SOLD
          </span>
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-sm font-semibold text-cream truncate leading-tight">{item.name}</p>
        <p className="text-[11px] text-cream/50 truncate">{item.set_name || 'Unsorted set'}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="font-num text-base font-bold text-gold">{money(item.is_sold ? item.sold_price : item.asking_price)}</span>
          {!item.is_sold && !customerView && (
            <span className={`text-[11px] font-bold ${profit >= 0 ? 'text-purple-glow' : 'text-orange'}`}>
              {profit >= 0 ? '+' : ''}
              {money(profit)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
