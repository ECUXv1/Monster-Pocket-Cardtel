import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, TrendingUp, Layers, Award, ChevronRight, ImageOff } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts'
import { useAuth } from '../lib/AuthContext'
import { listItems } from '../lib/inventoryStore'
import { money, pct, itemValue, itemCost, itemProfit, itemImage } from '../lib/format'
import { useCustomerView } from '../lib/CustomerViewContext'
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
  const [customerView] = useCustomerView()
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
        .slice(0, 8),
    [items]
  )

  const chartData = useMemo(
    () =>
      topItems.map((i) => ({
        id: i.id,
        name: i.name?.length > 18 ? i.name.slice(0, 17) + '…' : i.name || 'Untitled',
        value: itemValue(i),
        color: i.category === 'graded' ? 'var(--color-gold)' : 'var(--color-purple)',
      })),
    [topItems]
  )

  const profitPct = stats.cost > 0 ? (stats.profit / stats.cost) * 100 : 0
  const rank = collectorRank(stats.total)

  return (
    <div className="pb-24 md:pb-8">
      <CinematicHero eyebrow={rank} title="MONSTER POCKET CARD-tel HQ DASHBOARD" compact />

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
            {topItems.length > 0 && (
              <section className="space-y-2">
                <h2 className="font-display text-xs text-cream/70">VAULT SPOTLIGHT</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 snap-x snap-mandatory">
                  {topItems.map((item) => (
                    <SpotlightTile key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${customerView ? '' : 'lg:grid-cols-4'}`}>
              {!customerView && (
                <StatCard label="Cost basis" value={money(stats.cost)} sub={`${stats.total} active items`} tone="cream" icon={Wallet} />
              )}
              <StatCard label="Est. sell value" value={money(stats.value)} sub="At current asking price" tone="gold" icon={Layers} />
              {!customerView && (
                <StatCard
                  label="Unrealized profit"
                  value={money(stats.profit)}
                  sub={pct(profitPct)}
                  tone={stats.profit >= 0 ? 'purple' : 'orange'}
                  icon={TrendingUp}
                />
              )}
              <StatCard
                label="Sold to date"
                value={stats.soldCount}
                sub={customerView ? 'items sold' : `${money(stats.soldProfit)} realized`}
                tone="orange"
                icon={Award}
              />
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
                  <h2 className="font-display text-xs text-cream/70">COLLECTION VALUE — TOP HOLDINGS</h2>
                  <Link to="/inventory" className="text-xs text-purple-glow font-semibold flex items-center gap-1">
                    View all <ChevronRight size={14} />
                  </Link>
                </div>
                <div style={{ height: Math.max(160, chartData.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 16, top: 2, bottom: 2 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: 'var(--color-cream)', fontSize: 11, opacity: 0.75 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        contentStyle={{ background: '#1b1723', border: '1px solid #322b3d', borderRadius: 8, fontSize: 12 }}
                        formatter={(v) => money(v)}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                        {chartData.map((d) => (
                          <Cell key={d.id} fill={d.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SpotlightTile({ item }) {
  const src = itemImage(item)
  return (
    <Link
      to={`/item/${item.id}`}
      className="group relative shrink-0 w-36 lg:w-44 aspect-[3/4] rounded-2xl overflow-hidden slab-frame snap-start shadow-[0_6px_28px_-10px_rgba(0,0,0,0.7)] hover:shadow-[0_0_40px_-8px_rgba(123,47,247,0.7)] transition-shadow"
    >
      {src ? (
        <img
          src={src}
          alt={item.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
        />
      ) : (
        <div className="w-full h-full bg-surface-2 flex items-center justify-center">
          <ImageOff size={22} className="text-cream/15" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-transparent" />
      {item.category === 'graded' && (
        <span className="absolute top-2 left-2 bg-gold text-ink text-[9px] font-display px-1.5 py-0.5 rounded">
          {item.grading_company} {item.grade}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="text-xs font-semibold text-cream truncate leading-tight">{item.name}</p>
        <p className="font-num text-sm font-bold text-gold">{money(item.asking_price)}</p>
      </div>
    </Link>
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
