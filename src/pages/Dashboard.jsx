import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, TrendingUp, Layers, Award, ChevronRight, ImageOff } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuth } from '../lib/AuthContext'
import { listItems } from '../lib/inventoryStore'
import { money, pct, itemValue, itemCost, itemProfit } from '../lib/format'
import StatCard from '../components/StatCard'
import CinematicHero from '../components/CinematicHero'

const RANKS = [
  { min: 0, label: 'Rookie Trader' },
  { min: 10, label: 'Flip Trader' },
  { min: 50, label: 'Horde Collector' },
  { min: 200, label: 'Prism Grader' },
]

function collectorRank(total) {
  return [...RANKS].reverse().find((r) => total >= r.min)?.label || RANKS[0].label
}

export default function Dashboard() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listItems(user?.id).then((d) => {
      setItems(d)
      setLoading(false)
    })
  }, [user?.id])

  const stats = useMemo(() => {
    const active = items.filter((i) => !i.is_sold)
    const cost = active.reduce((s, i) => s + itemCost(i), 0)
    const value = active.reduce((s, i) => s + itemValue(i), 0)
    const profit = value - cost
    const raw = active.filter((i) => i.category === 'raw').length
    const graded = active.filter((i) => i.category === 'graded').length
    const soldCount = items.filter((i) => i.is_sold).length
    const soldProfit = items.filter((i) => i.is_sold).reduce((s, i) => s + itemProfit(i), 0)
    return { cost, value, profit, raw, graded, soldCount, soldProfit, total: active.length }
  }, [items])

  const pieData = [
    { name: 'Raw cards', value: stats.raw, color: 'var(--color-purple)' },
    { name: 'Graded slabs', value: stats.graded, color: 'var(--color-gold)' },
  ].filter((d) => d.value > 0)

  const topItems = useMemo(
    () =>
      [...items]
        .filter((i) => !i.is_sold)
        .sort((a, b) => itemValue(b) - itemValue(a))
        .slice(0, 5),
    [items]
  )

  const profitPct = stats.cost > 0 ? (stats.profit / stats.cost) * 100 : 0
  const rank = collectorRank(stats.total)

  return (
    <div className="pb-24 md:pb-8">
      <CinematicHero eyebrow={rank} title="THE HQ DASHBOARD" compact />

      <div className="p-4 lg:p-8 -mt-6 space-y-6 relative">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="mpc-badge">
              <span className="text-gold">★</span> {rank} <span className="text-gold">★</span>
            </span>
          </div>
          <Link
            to="/add"
            className="hidden md:flex items-center gap-2 rounded-xl bg-gold text-ink font-bold px-4 py-2.5 text-sm active:scale-95 shadow-[0_0_24px_-6px_rgba(255,214,10,0.5)]"
          >
            + Add item
          </Link>
        </header>

        {loading ? (
          <p className="text-cream/40 text-sm">Loading your collection…</p>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <StatCard label="Cost basis" value={money(stats.cost)} sub={`${stats.total} active items`} tone="cream" icon={Wallet} />
              <StatCard label="Est. sell value" value={money(stats.value)} sub="At current asking price" tone="gold" icon={Layers} />
              <StatCard
                label="Unrealized profit"
                value={money(stats.profit)}
                sub={pct(profitPct)}
                tone={stats.profit >= 0 ? 'purple' : 'orange'}
                icon={TrendingUp}
              />
              <StatCard label="Sold to date" value={stats.soldCount} sub={`${money(stats.soldProfit)} realized`} tone="orange" icon={Award} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 slab-frame rounded-2xl border border-line bg-surface p-4 lg:p-5">
                <h2 className="font-display text-xs text-cream/70 mb-3">COLLECTION MIX</h2>
                {pieData.length > 0 ? (
                  <div className="h-44 flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                          {pieData.map((d, i) => (
                            <Cell key={i} fill={d.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#1b1723', border: '1px solid #322b3d', borderRadius: 8, fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-cream/40 text-sm">No items yet.</p>
                )}
                <div className="flex justify-center gap-4 mt-2 text-xs">
                  <Legend color="var(--color-purple)" label={`Raw (${stats.raw})`} />
                  <Legend color="var(--color-gold)" label={`Graded (${stats.graded})`} />
                </div>
              </div>

              <div className="lg:col-span-2 slab-frame rounded-2xl border border-line bg-surface p-4 lg:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xs text-cream/70">TOP VALUE ITEMS</h2>
                  <Link to="/inventory" className="text-xs text-purple-glow font-semibold flex items-center gap-1">
                    View all <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="space-y-2">
                  {topItems.map((item) => (
                    <Link
                      key={item.id}
                      to={`/item/${item.id}`}
                      className="flex items-center gap-3 rounded-xl bg-surface-2 hover:bg-surface-3 p-2.5 transition-colors"
                    >
                      <Thumb item={item} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-cream truncate">{item.name}</p>
                        <p className="text-xs text-cream/50 truncate">
                          {item.category === 'graded' ? `${item.grading_company} ${item.grade}` : item.condition || 'Raw card'}
                        </p>
                      </div>
                      <p className="font-num text-sm font-bold text-gold shrink-0">{money(item.asking_price)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-cream/60">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function Thumb({ item }) {
  const src = item.front_image_url || item.slab_image_url
  if (!src) {
    return (
      <div className="h-11 w-11 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
        <ImageOff size={16} className="text-cream/30" />
      </div>
    )
  }
  return <img src={src} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
      <p className="font-display text-lg text-cream mb-2">Your vault is empty</p>
      <p className="text-cream/50 text-sm mb-5 max-w-sm mx-auto">
        Add your first raw card or graded slab to start tracking cost, value, and profit.
      </p>
      <Link to="/add" className="inline-flex items-center gap-2 rounded-xl bg-gold text-ink font-bold px-5 py-3 text-sm">
        + Add your first item
      </Link>
    </div>
  )
}
