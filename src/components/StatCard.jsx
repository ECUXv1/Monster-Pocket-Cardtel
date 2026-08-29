export default function StatCard({ label, value, sub, tone = 'purple', icon: Icon }) {
  const tones = {
    purple: 'from-purple/25 to-transparent text-purple-glow',
    gold: 'from-gold/20 to-transparent text-gold',
    orange: 'from-orange/20 to-transparent text-orange',
    cream: 'from-cream/10 to-transparent text-cream',
  }
  return (
    <div className={`relative overflow-hidden slab-frame rounded-2xl border border-line bg-surface p-4 lg:p-5 bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cream/50">{label}</p>
        {Icon && <Icon size={18} className="opacity-60" />}
      </div>
      <p className="font-num text-2xl lg:text-3xl font-bold mt-2 text-cream">{value}</p>
      {sub && <p className="text-xs mt-1 text-cream/50">{sub}</p>}
    </div>
  )
}
