import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Smartphone, X, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { createCaptureSession, subscribeToCaptureSession, scanFeatureAvailable } from '../lib/captureSession'

const STEPS = {
  pending: { label: 'Waiting for your phone…', hint: 'Scan the code with your phone\u2019s camera' },
  opened: { label: 'Phone connected', hint: 'Take the photo on your phone now' },
  captured: { label: 'Photo received', hint: 'Uploading to your collection…' },
  recognizing: { label: 'Identifying the card…', hint: 'This takes a few seconds' },
  ready: { label: 'Done!', hint: 'Dropping it into the form…' },
  error: { label: 'Something went wrong', hint: 'Try again or add the details manually' },
}

const SLOT_LABEL = { front: 'front photo', back: 'back photo', slab: 'slab photo' }

/**
 * category: 'raw' | 'graded' — used for the wording, and (in whole-item
 *   mode) to tell the phone whether to ask for front+back or a slab.
 * slot: 'front' | 'back' | 'slab' | undefined — when set, this is a single
 *   photo box borrowing the phone's camera for just that one shot.
 * onResult(row) — called with the updated capture_sessions row once ready.
 */
export default function ScanWithPhone({ category, slot, onResult, onClose }) {
  const { user } = useAuth()
  const [qr, setQr] = useState('')
  const [status, setStatus] = useState('pending')
  const [error, setError] = useState('')
  const sessionRef = useRef(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!scanFeatureAvailable) {
        setError('Connect Supabase (see README) to use phone scan.')
        return
      }
      try {
        const session = await createCaptureSession(user?.id, category, slot)
        if (cancelled) return
        sessionRef.current = session
        const url = `${window.location.origin}/capture/${session.id}`
        const dataUrl = await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#08080c', light: '#ffffff' },
        })
        if (cancelled) return
        setQr(dataUrl)

        unsubRef.current = subscribeToCaptureSession(session.id, (row) => {
          setStatus(row.status)
          if (row.status === 'ready') {
            setTimeout(() => onResult(row), 600)
          }
          if (row.status === 'error') setError(row.error || 'Recognition failed.')
        })
      } catch (err) {
        setError(err.message)
      }
    }

    start()
    return () => {
      cancelled = true
      unsubRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = STEPS[status] || STEPS.pending
  const subject = slot ? SLOT_LABEL[slot] : category === 'graded' ? 'slab' : 'card'

  return (
    <div className="fixed inset-0 z-40 bg-ink/95 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center relative">
        <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center">
          <X size={16} />
        </button>

        <Smartphone className="mx-auto text-gold mb-2" size={28} />
        <h2 className="font-display text-base text-cream mb-1">Scan with your phone</h2>
        <p className="text-xs text-cream/50 mb-5">
          Point your phone's camera at this code — it becomes a wireless shutter for this {subject}, and it'll show up here automatically.
        </p>

        {error ? (
          <p className="text-orange text-sm py-10">{error}</p>
        ) : qr ? (
          <div className="bg-white rounded-2xl p-4 inline-block">
            <img src={qr} alt="QR code to scan with your phone" width={220} height={220} />
          </div>
        ) : (
          <div className="h-[252px] flex items-center justify-center">
            <Loader2 className="animate-spin text-cream/30" size={28} />
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-2 text-sm">
          {status === 'ready' ? (
            <CheckCircle2 size={16} className="text-purple-glow" />
          ) : (
            <Loader2 size={16} className="animate-spin text-purple-glow" />
          )}
          <span className="text-cream font-semibold">{step.label}</span>
        </div>
        <p className="text-xs text-cream/40 mt-1">{step.hint}</p>
      </div>
    </div>
  )
}
