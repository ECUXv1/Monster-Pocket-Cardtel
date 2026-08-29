import { useRef, useState } from 'react'
import { X, Upload, QrCode, RefreshCw } from 'lucide-react'
import { isMobileDevice } from '../lib/device'
import { scanFeatureAvailable } from '../lib/captureSession'
import CameraCapture from './CameraCapture'
import ScanWithPhone from './ScanWithPhone'

/**
 * On a phone: behaves exactly like CameraCapture (live front/back camera or
 * native camera app).
 * On a laptop or a car's built-in touchscreen (no useful outward-facing
 * camera): offers a QR code that temporarily borrows a phone's camera for
 * just this one photo, plus a plain file upload fallback.
 *
 * onCapture(file) — fires when a photo comes from *this* device's own camera.
 * onRemoteCapture(url, recognized) — fires when a photo arrives wirelessly
 *   from a phone; the image is already uploaded, so we get a URL, not a File.
 */
export default function SmartCameraCapture({ label, slot, category, existingUrl, onCapture, onRemoteCapture, onClear }) {
  const mobile = isMobileDevice()
  const [scanning, setScanning] = useState(false)
  const fileInputRef = useRef(null)

  if (mobile) {
    return <CameraCapture label={label} existingUrl={existingUrl} onCapture={onCapture} onClear={onClear} />
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
    e.target.value = ''
  }

  function handleScanResult(row) {
    setScanning(false)
    const url = row[`${slot}_image_url`]
    if (url) onRemoteCapture(url, row.recognized || null)
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cream/60 flex items-center justify-between">
        <span>{label}</span>
        {existingUrl && (
          <button type="button" onClick={onClear} className="text-cream/50 hover:text-orange flex items-center gap-1">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {existingUrl ? (
        <div className="aspect-square bg-black">
          <img src={existingUrl} alt={label} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-square flex flex-col items-center justify-center gap-3 p-4 text-center">
          <QrCode size={32} className="text-cream/30" />
          <p className="text-[11px] text-cream/40 max-w-[180px]">
            No usable camera here — borrow your phone's for a second.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-[220px]">
            {scanFeatureAvailable ? (
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="h-11 rounded-xl bg-purple text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <QrCode size={16} /> Scan with phone
              </button>
            ) : (
              <p className="text-[10px] text-cream/30">Connect Supabase to enable phone scan.</p>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 rounded-xl bg-surface-3 text-cream font-semibold text-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <Upload size={16} /> Upload from computer
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}

      {existingUrl && (
        <div className="p-2 flex gap-2">
          {scanFeatureAvailable && (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex-1 h-9 rounded-lg bg-surface-3 text-xs font-semibold text-cream flex items-center justify-center gap-1"
            >
              <RefreshCw size={14} /> Rescan with phone
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-9 rounded-lg bg-surface-3 text-xs font-semibold text-cream flex items-center justify-center gap-1"
          >
            <Upload size={14} /> Replace
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}

      {scanning && (
        <ScanWithPhone category={category} slot={slot} onResult={handleScanResult} onClose={() => setScanning(false)} />
      )}
    </div>
  )
}
