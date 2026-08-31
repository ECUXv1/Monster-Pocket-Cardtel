import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * images: [{ url, label }]
 * index: which one is currently shown
 */
export default function ImageLightbox({ images, index, onClose, onNavigate }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && images.length > 1) onNavigate((index + 1) % images.length)
      if (e.key === 'ArrowLeft' && images.length > 1) onNavigate((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onNavigate])

  if (!images[index]) return null
  const current = images[index]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-surface-2/80 flex items-center justify-center text-cream/70 hover:text-cream"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index - 1 + images.length) % images.length)
          }}
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-surface-2/80 flex items-center justify-center text-cream/70 hover:text-cream"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <img
        src={current.url}
        alt={current.label || 'Full size'}
        className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-[0_0_60px_-10px_rgba(123,47,247,0.5)]"
        onClick={(e) => e.stopPropagation()}
      />

      {current.label && <p className="mt-3 text-sm text-cream/60">{current.label}</p>}

      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNavigate((index + 1) % images.length)
          }}
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-surface-2/80 flex items-center justify-center text-cream/70 hover:text-cream"
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  )
}
