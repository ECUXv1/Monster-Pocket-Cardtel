import heroBanner from '../assets/hero-banner.jpg'

/**
 * Full-bleed hero treatment: the banner art fades into the page's ink-black
 * background at every edge (top/bottom gradient scrims + a soft vignette),
 * so it reads as part of the atmosphere rather than a boxed photo.
 */
export default function CinematicHero({ eyebrow, title, tagline, compact = false }) {
  return (
    <div className={`relative w-full overflow-hidden ${compact ? 'h-40 md:h-52' : 'h-56 md:h-72 lg:h-80'}`}>
      <img
        src={heroBanner}
        alt="Monster Pocket CARD-tel"
        className="absolute inset-0 w-full h-full object-cover object-center scale-110"
      />
      {/* Scrims: fade the photo into --color-ink on every side */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-transparent to-ink opacity-70" />
      <div className="absolute inset-0 [background:radial-gradient(120%_100%_at_50%_50%,transparent_35%,var(--color-ink)_100%)]" />

      {(eyebrow || title || tagline) && (
        <div className="relative h-full flex flex-col items-center justify-end pb-4 md:pb-6 text-center px-4">
          {eyebrow && (
            <p className="font-display text-[9px] md:text-[10px] tracking-[0.25em] text-gold/90 mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="font-display text-lg md:text-2xl text-cream leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
              {title}
            </h1>
          )}
          {tagline && (
            <p className="text-xs md:text-sm text-cream/60 mt-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{tagline}</p>
          )}
        </div>
      )}
    </div>
  )
}
