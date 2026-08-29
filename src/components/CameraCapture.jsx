import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, X, Upload } from 'lucide-react'

/**
 * Captures a photo either via live camera stream (works on Tesla / tablet /
 * desktop touchscreens with a webcam) or via the device's native camera app
 * (mobile phones, using <input capture>). Returns a File to onCapture.
 */
export default function CameraCapture({ label, onCapture, existingUrl, onClear }) {
  const [mode, setMode] = useState('idle') // idle | live | preview
  const [facing, setFacing] = useState('environment')
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => () => stopStream(), [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function startLive() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      setMode('live')
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch (e) {
      setError('Camera unavailable — use "Upload photo" instead.')
    }
  }

  function switchFacing() {
    stopStream()
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
    setTimeout(startLive, 50)
  }

  function snap() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const size = Math.min(video.videoWidth, video.videoHeight)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    canvas.toBlob(
      (blob) => {
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
        stopStream()
        setMode('idle')
      },
      'image/jpeg',
      0.92
    )
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cream/60 flex items-center justify-between">
        <span>{label}</span>
        {existingUrl && (
          <button
            type="button"
            onClick={onClear}
            className="text-cream/50 hover:text-orange flex items-center gap-1"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {mode === 'live' ? (
        <div className="relative bg-black aspect-square">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={() => {
                stopStream()
                setMode('idle')
              }}
              className="h-11 w-11 rounded-full bg-black/60 text-cream flex items-center justify-center active:scale-95"
            >
              <X size={20} />
            </button>
            <button
              type="button"
              onClick={snap}
              className="h-16 w-16 rounded-full bg-gold border-4 border-cream shadow-lg active:scale-95"
              aria-label="Take photo"
            />
            <button
              type="button"
              onClick={switchFacing}
              className="h-11 w-11 rounded-full bg-black/60 text-cream flex items-center justify-center active:scale-95"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      ) : existingUrl ? (
        <div className="aspect-square bg-black">
          <img src={existingUrl} alt={label} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-square flex flex-col items-center justify-center gap-3 p-4 text-center">
          <Camera size={32} className="text-cream/30" />
          {error && <p className="text-orange text-xs">{error}</p>}
          <div className="flex flex-col gap-2 w-full max-w-[220px]">
            <button
              type="button"
              onClick={startLive}
              className="h-11 rounded-xl bg-purple text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <Camera size={16} /> Use camera
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 rounded-xl bg-surface-3 text-cream font-semibold text-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <Upload size={16} /> Upload photo
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}

      {existingUrl && mode !== 'live' && (
        <div className="p-2 flex gap-2">
          <button
            type="button"
            onClick={startLive}
            className="flex-1 h-9 rounded-lg bg-surface-3 text-xs font-semibold text-cream flex items-center justify-center gap-1"
          >
            <Camera size={14} /> Retake
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-9 rounded-lg bg-surface-3 text-xs font-semibold text-cream flex items-center justify-center gap-1"
          >
            <Upload size={14} /> Replace
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}
    </div>
  )
}
