export function outboundDays(start: string, end: string, rows: any[]) {
  const first = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z')
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return []
  const byDate = new Map(rows.map(row => [row.date, row]))
  const count = Math.min(366, Math.round((last - first) / 86400000) + 1)
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(first + index * 86400000), date = day.toISOString().slice(0, 10)
    return { date, weekend: [0, 6].includes(day.getUTCDay()), documents: 0, actual: 0, units: [], ...byDate.get(date) }
  })
}
