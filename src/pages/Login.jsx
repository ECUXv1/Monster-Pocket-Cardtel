import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import CinematicHero from '../components/CinematicHero'

export default function Login() {
  const { signInWithPassword, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(email, password)
        if (error) throw error
      } else {
        const { error } = await signUp(email, password)
        if (error) throw error
        setMsg('Check your email to confirm your account, then sign in.')
        setMode('signin')
      }
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
            {msg && <p className="text-purple-glow text-xs">{msg}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-xl bg-gold text-ink font-bold text-sm active:scale-95 disabled:opacity-60 shadow-[0_0_24px_-4px_rgba(255,214,10,0.5)]"
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-center text-xs text-cream/50 mt-4"
          >
            {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
