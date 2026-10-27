/** Calendar ranges in the selected warehouse's timezone, including DST/month boundaries. */
export function ledgerDateRange(range: string, timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const year = part('year'), month = part('month') - 1, day = part('day')
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
  const end = iso(year, month, day)
  if (range === 'today') return { start_time: end, end_time: end }
  if (range === 'week') return { start_time: iso(year, month, day - 6), end_time: end }
  if (range === 'month') return { start_time: iso(year, month, 1), end_time: end }
  if (range === 'previous') return { start_time: iso(year, month - 1, 1), end_time: iso(year, month, 0) }
  return null
}
