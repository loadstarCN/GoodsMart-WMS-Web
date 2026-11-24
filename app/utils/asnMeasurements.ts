import type { DocumentItem } from './documentItems'

function lineTotal(recorded: number | null | undefined, quantity: number | null | undefined, unit: number | null | undefined) {
  // Older ASN lines default both measurements to zero when nothing was entered.
  if (recorded != null && recorded > 0) return recorded
  if (quantity === 0) return 0
  return quantity != null && quantity > 0 && unit != null && unit > 0 ? quantity * unit : null
}

export function asnMeasurements<Line extends DocumentItem>(details: Line[], status: string) {
  const rows = []
  let totalWeight: number | null = null
  let totalVolume: number | null = null
  for (const line of details) {
    const quantity = status === 'completed' ? line.actual_quantity : line.quantity
    const { weight, length, width, height } = line.goods ?? {}
    const unitVolume = length > 0 && width > 0 && height > 0 ? length * width * height / 1_000_000_000 : null
    const lineWeight = lineTotal(line.weight, quantity, weight)
    const lineVolume = lineTotal(line.volume, quantity, unitVolume)
    if (lineWeight != null) totalWeight = (totalWeight ?? 0) + lineWeight
    if (lineVolume != null) totalVolume = (totalVolume ?? 0) + lineVolume
    rows.push({ ...line, lineWeight, lineVolume })
  }
  return { rows, totalWeight, totalVolume }
}
