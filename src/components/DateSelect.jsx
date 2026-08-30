import { useMemo } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(month, year) {
  if (!month) return 31
  return new Date(year || new Date().getFullYear(), month, 0).getDate()
}

/**
 * value: 'YYYY-MM-DD' string or '' / undefined.
 * onChange: called with a full 'YYYY-MM-DD' string once all three parts are
 * picked, or '' if any part is cleared. Three plain <select> dropdowns —
 * reliable to tap on any touchscreen, unlike native <input type="date">
 * calendar widgets, which render inconsistently (or not at all) on car and
 * kiosk browsers.
 */
export default function DateSelect({ value, onChange, yearsBack = 20, futureYears = 1 }) {
  const [yStr, mStr, dStr] = (value || '').split('-')
  const y = parseInt(yStr, 10) || ''
  const m = parseInt(mStr, 10) || ''
  const d = parseInt(dStr, 10) || ''

  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const arr = []
    for (let yr = currentYear + futureYears; yr >= currentYear - yearsBack; yr--) arr.push(yr)
    return arr
  }, [currentYear, futureYears, yearsBack])

  const dayCount = daysInMonth(m, y)
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount])

  function update(part, rawVal) {
    const val = rawVal ? Number(rawVal) : ''
    const next = { y, m, d, [part]: val }

    // Clamp the day if switching to a month/year that's shorter (e.g. Feb 30 -> Feb 28).
    if (next.y && next.m && next.d) {
      const maxDay = daysInMonth(next.m, next.y)
      if (next.d > maxDay) next.d = maxDay
    }

    if (next.y && next.m && next.d) {
      onChange(`${next.y}-${String(next.m).padStart(2, '0')}-${String(next.d).padStart(2, '0')}`)
    } else {
      onChange('')
    }
  }

  const selectCls =
    'h-11 rounded-xl bg-surface border border-line px-2 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-purple appearance-none'

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={m} onChange={(e) => update('m', e.target.value)} className={selectCls}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select value={d} onChange={(e) => update('d', e.target.value)} className={selectCls}>
        <option value="">Day</option>
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>
      <select value={y} onChange={(e) => update('y', e.target.value)} className={selectCls}>
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </select>
    </div>
  )
}
