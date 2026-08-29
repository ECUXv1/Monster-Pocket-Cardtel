import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Crown, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  getCaptureSession,
  updateCaptureSession,
  uploadCaptureImage,
  recognizeCard,
} from '../lib/captureSession'
import CameraCapture from '../components/CameraCapture'

export default function CapturePhone() {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [images, setImages] = useState({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    getCaptureSession(token)
      .then((row) => {
        if (new Date(row.expires_at) < new Date()) {
          setLoadError('This code has expired. Generate a new one on the Tesla screen.')
          return
        }
        setSession(row)
        updateCaptureSession(token, { status: 'opened' }).catch(() => {})
      })
      .catch(() => setLoadError('Code not found or already used. Generate a new one on the Tesla screen.'))
  }, [token])

  const isGraded = session?.category === 'graded'
  const singleSlot = session?.slot || null // 'front' | 'back' | 'slab' | null (whole-item mode)

  function setSlot(slot, file) {
    setImages((p) => ({ ...p, [slot]: file }))
  }

  const ready = singleSlot ? Boolean(images[singleSlot]) : isGraded ? Boolean(images.slab) : Boolean(images.front)

  async function handleSend() {
    setSending(true)
    setSendError('')
    try {
      const urlEntries = {}
      for (const [slot, file] of Object.entries(images)) {
        urlEntries[`${slot}_image_url`] = await uploadCaptureImage(token, file, slot)
      }
      await updateCaptureSession(token, { ...urlEntries, status: 'captured' })

      // Only run recognition off the primary identifying shot(s) — front of
      // a raw card, or a slab's label — not a plain back-of-card photo.
      const shouldRecognize = singleSlot ? singleSlot !== 'back' : true
      let recognized = null
      if (shouldRecognize) {
        await updateCaptureSession(token, { status: 'recognizing' })
        try {
          recognized = await recognizeCard(Object.values(urlEntries), session.category)
        } catch {
          // Recognition failing shouldn't block sending photos over — the
          // Tesla screen can still prefill photos and the person fills in
          // the rest by hand.
        }
      }

      await updateCaptureSession(token, {
        status: 'ready',
        recognized: recognized || null,
      })
      setDone(true)
    } catch (err) {
      setSendError(err.message)
      updateCaptureSession(token, { status: 'error', error: err.message }).catch(() => {})
    } finally {
      setSending(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <AlertTriangle className="text-orange mx-auto mb-3" size={32} />
        <p className="text-cream/70 text-sm text-center">{loadError}</p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <CheckCircle2 className="text-purple-glow mx-auto mb-3" size={40} />
        <p className="text-cream font-display text-sm text-center mb-1">Sent to your Tesla screen</p>
        <p className="text-cream/50 text-xs text-center">You can close this tab now.</p>
      </Shell>
    )
  }

  if (!session) {
    return (
      <Shell>
        <p className="text-cream/40 text-sm text-center">Loading…</p>
      </Shell>
    )
  }

  const SLOT_TITLE = { front: 'Front photo', back: 'Back photo', slab: 'Slab (full label)' }

  return (
    <Shell>
      <p className="text-cream/50 text-xs text-center mb-5">
        {singleSlot
          ? `Take a clear, well-lit ${SLOT_TITLE[singleSlot].toLowerCase()}. It'll drop into that spot on your Tesla screen automatically.`
          : `Take a clear, well-lit photo of your ${isGraded ? 'graded slab' : 'card'}. It'll appear on your Tesla screen automatically.`}
      </p>

      <div className="space-y-3">
        {singleSlot ? (
          <CameraCapture
            label={SLOT_TITLE[singleSlot]}
            existingUrl={images[singleSlot] ? URL.createObjectURL(images[singleSlot]) : ''}
            onCapture={(f) => setSlot(singleSlot, f)}
            onClear={() => setSlot(singleSlot, null)}
          />
        ) : isGraded ? (
          <CameraCapture
            label="Slab (full label)"
            existingUrl={images.slab ? URL.createObjectURL(images.slab) : ''}
            onCapture={(f) => setSlot('slab', f)}
            onClear={() => setSlot('slab', null)}
          />
        ) : (
          <>
            <CameraCapture
              label="Front photo"
              existingUrl={images.front ? URL.createObjectURL(images.front) : ''}
              onCapture={(f) => setSlot('front', f)}
              onClear={() => setSlot('front', null)}
            />
            <CameraCapture
              label="Back photo (optional)"
              existingUrl={images.back ? URL.createObjectURL(images.back) : ''}
              onCapture={(f) => setSlot('back', f)}
              onClear={() => setSlot('back', null)}
            />
          </>
        )}
      </div>

      {sendError && <p className="text-orange text-xs text-center mt-3">{sendError}</p>}

      <button
        onClick={handleSend}
        disabled={!ready || sending}
        className="w-full h-12 mt-5 rounded-xl bg-gold text-ink font-bold text-sm disabled:opacity-40 active:scale-95"
      >
        {sending ? 'Sending…' : 'Send to Tesla screen'}
      </button>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Crown className="text-gold mb-2" size={28} />
          <p className="font-display text-xs text-cream text-center leading-tight">
            MPC <span className="text-gold">HQ</span> · Phone capture
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
