import { useEffect, useMemo, useState } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(month, year) {
  if (!month) return 31
  return new Date(year || new Date().getFullYear(), month, 0).getDate()
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function parseValue(value) {
  const [yStr, mStr, dStr] = (value || '').split('-')
  return {
    y: parseInt(yStr, 10) || '',
    m: parseInt(mStr, 10) || '',
    d: parseInt(dStr, 10) || '',
  }
}

function toIso({ y, m, d }) {
  return y && m && d ? `${y}-${pad(m)}-${pad(d)}` : ''
}

/**
 * value: 'YYYY-MM-DD' string or '' / undefined.
 * onChange: called with a full 'YYYY-MM-DD' string once all three parts are
 * picked, or '' if any part is missing. Three plain <select> dropdowns —
 * reliable to tap on any touchscreen, unlike native <input type="date">
 * calendar widgets, which render inconsistently (or not at all) on car and
 * kiosk browsers.
 *
 * Keeps its own draft state (month/day/year picked so far) instead of
 * deriving purely from `value`. A date isn't "complete" — and so `value`
 * stays '' — until all three are picked, so deriving straight from `value`
 * would make the dropdowns visibly snap back to blank the instant you
 * picked just one of the three.
 */
export default function DateSelect({ value, onChange, yearsBack = 20, futureYears = 1 }) {
  const [draft, setDraft] = useState(() => parseValue(value))

  // Only re-sync from the parent when it hands us a genuinely different
  // date than what we already have selected — e.g. an existing item
  // loading in on the edit page. Never resync just because our own
  // incomplete selection caused onChange('') to fire.
  useEffect(() => {
    if ((value || '') !== toIso(draft)) {
      setDraft(parseValue(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const arr = []
    for (let yr = currentYear + futureYears; yr >= currentYear - yearsBack; yr--) arr.push(yr)
    return arr
  }, [currentYear, futureYears, yearsBack])

  const dayCount = daysInMonth(draft.m, draft.y)
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount])

  function update(part, rawVal) {
    const val = rawVal ? Number(rawVal) : ''
    const next = { ...draft, [part]: val }

    // Clamp the day if switching to a month/year that's shorter (e.g. Feb 30 -> Feb 28).
    if (next.y && next.m && next.d) {
      const maxDay = daysInMonth(next.m, next.y)
      if (next.d > maxDay) next.d = maxDay
    }

    setDraft(next)
    onChange(toIso(next))
  }

  const selectCls =
    'h-11 rounded-xl bg-surface border border-line px-2 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-purple appearance-none'

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={draft.m} onChange={(e) => update('m', e.target.value)} className={selectCls}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select value={draft.d} onChange={(e) => update('d', e.target.value)} className={selectCls}>
        <option value="">Day</option>
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>
      <select value={draft.y} onChange={(e) => update('y', e.target.value)} className={selectCls}>
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
