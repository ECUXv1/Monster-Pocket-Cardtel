import { useEffect, useState } from 'react'
import { Download, LogOut, Wifi, WifiOff, Copy, RefreshCw, Check } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { listItems, getShareSettings, setShareEnabled, regenerateShareToken } from '../lib/inventoryStore'
import { useCustomerView } from '../lib/useCustomerView'
import CinematicHero from '../components/CinematicHero'

export default function Settings() {
  const { user, signOut, supabaseReady } = useAuth()
  const [customerView, setCustomerView] = useCustomerView()
  const [share, setShare] = useState({ share_token: null, share_enabled: false }) // real values fill in once loaded
  const [shareBusy, setShareBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (supabaseReady && user) getShareSettings(user.id).then(setShare)
  }, [supabaseReady, user])

  async function handleToggleShare() {
    setShareBusy(true)
    try {
      const updated = await setShareEnabled(user.id, !share?.share_enabled)
      setShare(updated)
    } finally {
      setShareBusy(false)
    }
  }

  async function handleRegenerate() {
    if (!confirm('Generate a new link? The old share link will stop working immediately.')) return
    setShareBusy(true)
    try {
      const updated = await regenerateShareToken(user.id)
      setShare(updated)
    } finally {
      setShareBusy(false)
    }
  }

  const shareUrl = share ? `${window.location.origin}/share/${share.share_token}` : ''

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleExport() {
    const items = await listItems(user?.id)
    const headers = [
      'name', 'category', 'set_name', 'card_number', 'grading_company', 'grade',
      'condition', 'quantity', 'purchase_price', 'asking_price',
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
      <CinematicHero eyebrow="MONSTER POCKET CARD-tel" title="SETTINGS" compact />

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
        <h2 className="font-display text-[11px] text-cream/50 tracking-wide">SHARE YOUR VAULT</h2>
        <p className="text-xs text-cream/40">
          A public link showing your active inventory, asking prices, and totals — built for handing to a customer.
          Never shows what you paid, your profit, or notes. Off by default; only items you haven't marked sold appear.
        </p>
        {!supabaseReady ? (
          <div className="slab-frame rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-cream/40">Requires a connected Supabase backend — see the README.</p>
          </div>
        ) : (
          <div className="slab-frame rounded-2xl border border-line bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-cream">
                {share?.share_enabled ? 'On — anyone with the link can view' : 'Off — link is inactive'}
              </p>
              <button
                onClick={handleToggleShare}
                disabled={shareBusy}
                className={`h-8 w-14 rounded-full flex items-center px-1 transition-colors disabled:opacity-50 ${share?.share_enabled ? 'bg-purple justify-end' : 'bg-surface-2 justify-start'}`}
              >
                <span className="h-6 w-6 rounded-full bg-white block" />
              </button>
            </div>

            {share?.share_enabled && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 h-10 rounded-lg bg-surface-2 border border-line px-3 text-xs text-cream/70 truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="h-10 px-3 rounded-lg bg-purple text-white flex items-center gap-1.5 text-xs font-semibold shrink-0"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={shareBusy}
                  className="w-full h-10 rounded-lg bg-surface-2 text-cream/60 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw size={13} /> Generate new link (invalidates the old one)
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-[11px] text-cream/50 tracking-wide">CUSTOMER VIEW</h2>
        <p className="text-xs text-cream/40">
          Hides what you paid and your profit margin on every item's detail page — handy when you're handing the
          screen to someone else. Card details, grade, and asking price still show normally. This applies to this
          device only, and stays on until you switch it back.
        </p>
        <div className="slab-frame rounded-2xl border border-line bg-surface p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-cream">{customerView ? 'On — cost is hidden' : 'Off — you see everything'}</p>
          </div>
          <button
            onClick={() => setCustomerView(!customerView)}
            className={`h-8 w-14 rounded-full flex items-center px-1 transition-colors ${customerView ? 'bg-purple justify-end' : 'bg-surface-2 justify-start'}`}
          >
            <span className="h-6 w-6 rounded-full bg-white block" />
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
