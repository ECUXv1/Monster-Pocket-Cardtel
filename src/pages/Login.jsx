import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import CinematicHero from '../components/CinematicHero'

export default function Login() {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await signInWithPassword(email, password)
      if (error) throw error
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <CinematicHero eyebrow="RIP · TRADE · GRADE · REPEAT" title="MONSTER POCKET CARD-tel HQ" />

      <div className="flex-1 flex items-start justify-center px-6 -mt-4">
        <div className="w-full max-w-sm">
          <form onSubmit={submit} className="space-y-3 slab-frame rounded-2xl border border-line bg-surface/90 backdrop-blur p-5">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 rounded-xl bg-surface-2 border border-line px-4 text-sm text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-purple"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-xl bg-surface-2 border border-line px-4 text-sm text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-purple"
            />
            {error && <p className="text-orange text-xs">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-xl bg-gold text-ink font-bold text-sm active:scale-95 disabled:opacity-60 shadow-[0_0_24px_-4px_rgba(255,214,10,0.5)]"
            >
              {busy ? 'Please wait…' : 'Sign in'}
            </button>
          </form>

          <p className="w-full text-center font-display text-[10px] tracking-[0.2em] text-gold/50 mt-5">
            MONSTER POCKET CARD-tel · ADMIN USE ONLY
          </p>
        </div>
      </div>
    </div>
  )
}
