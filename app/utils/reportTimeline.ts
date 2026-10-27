export function reportTimeline(start: string, end: string, today: string, rows: {planned?: string|null; actual_date?: string|null}[]) {
  const day = (value: string|null|undefined) => value ? Date.parse(value + 'T00:00:00Z') / 86400000 : NaN
  const values = [day(start), day(end), day(today), ...rows.flatMap(row => [day(row.planned), day(row.actual_date)])].filter(Number.isFinite)
  if (!values.length) return null
  const min = Math.min(...values) - 1, max = Math.max(...values) + 1
  const step = Math.max(1, Math.ceil((max - min) / 6))
  const days = [min]
  for (let value = min + step; value < max; value += step) {
    if (max - value >= step / 2) days.push(value)
  }
  days.push(max)
  return {min, max, ticks: days.map(value => ({date: new Date(value * 86400000).toISOString().slice(0, 10), percent: (value - min) / (max - min) * 100}))}
}
