import { useEffect, useState } from 'react'
import { Download, LogOut, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getSettings, saveSettings, listItems } from '../lib/inventoryStore'
import CinematicHero from '../components/CinematicHero'

export default function Settings() {
  const { user, signOut, supabaseReady } = useAuth()
  const [markup, setMarkup] = useState(30)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings(user?.id).then((s) => setMarkup(s.default_markup_percent ?? 30))
  }, [user?.id])

  async function handleSave() {
    await saveSettings(user?.id, { default_markup_percent: Number(markup) })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleExport() {
    const items = await listItems(user?.id)
    const headers = [
      'name', 'category', 'set_name', 'card_number', 'grading_company', 'grade',
      'condition', 'quantity', 'purchase_price', 'markup_percent', 'asking_price',
      'is_sold', 'sold_price', 'purchase_date', 'sold_date',
    ]
    const rows = items.map((i) => headers.map((h) => JSON.stringify(i[h] ?? '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mpc-hq-inventory.csv'
    a.click()
  }

  return (
    <div className="pb-24 md:pb-8">
      <CinematicHero eyebrow="THE HQ" title="SETTINGS" compact />

      <div className="p-4 lg:p-8 -mt-6 max-w-xl mx-auto space-y-6">
      <div className="slab-frame rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
        {supabaseReady ? <Wifi size={18} className="text-purple-glow" /> : <WifiOff size={18} className="text-orange" />}
        <div>
          <p className="text-sm font-semibold text-cream">{supabaseReady ? 'Connected to Supabase' : 'Demo mode (local device only)'}</p>
          <p className="text-xs text-cream/50">
            {supabaseReady
              ? 'Your collection syncs to the cloud and across devices.'
              : 'Add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to sync and back up your data.'}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-[11px] text-cream/50 tracking-wide">DEFAULT MARKUP</h2>
        <p className="text-xs text-cream/40">Applied automatically to price paid when you add a new item. You can override it per item.</p>
        <div className="slab-frame rounded-2xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-num text-2xl font-bold text-gold">{markup}%</span>
          </div>
          <input type="range" min={0} max={200} step={5} value={markup} onChange={(e) => setMarkup(e.target.value)} className="w-full accent-gold" />
          <button onClick={handleSave} className="w-full h-11 rounded-xl bg-purple text-white font-bold text-sm active:scale-95">
            {saved ? 'Saved ✓' : 'Save default'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-[11px] text-cream/50 tracking-wide">DATA</h2>
        <button
          onClick={handleExport}
          className="w-full h-12 rounded-xl bg-surface-2 text-cream font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Download size={16} /> Export inventory as CSV
        </button>
      </section>

      {supabaseReady && user && (
        <section className="space-y-3">
          <h2 className="font-display text-[11px] text-cream/50 tracking-wide">ACCOUNT</h2>
          <p className="text-xs text-cream/50">Signed in as {user.email}</p>
          <button onClick={signOut} className="w-full h-12 rounded-xl bg-surface-2 text-orange font-semibold text-sm flex items-center justify-center gap-2">
            <LogOut size={16} /> Sign out
          </button>
        </section>
      )}

      <p className="text-center font-display text-[9px] tracking-[0.2em] text-gold/50 pt-4">RIP · TRADE · GRADE · REPEAT</p>
      </div>
    </div>
  )
}
