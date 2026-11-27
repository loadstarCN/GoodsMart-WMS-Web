export interface PendingSourceRow {
  lot_id: number | null
  receipt_source_id: number
  sorted_stock: number
  sorted_damage_stock?: number
}

export interface PutawaySelection {
  goods_id: number
  warehouse_id: number
  sorted_stock: number
  sorted_damage_stock?: number
  lot_id?: number | null
  receipt_source_id?: number
}

/** Inventory rows represent all sources of a product. Source-view rows represent only the checked receipt/lot. */
export async function bulkPutawayRecords(
  rows: PutawaySelection[],
  locationId: number,
  loadSources: (row: PutawaySelection) => Promise<PendingSourceRow[] | null>,
) {
  const groups = await Promise.all(rows.map(async row => {
    const sources = row.receipt_source_id == null
      ? await loadSources(row)
      : [{ ...row, lot_id: row.lot_id ?? null, receipt_source_id: row.receipt_source_id }]
    if (!sources?.length || sources.some(source => !Number.isInteger(source.sorted_stock) || source.sorted_stock <= 0)) return null
    const total = sources.reduce((sum, source) => sum + source.sorted_stock, 0)
    const damaged = sources.reduce((sum, source) => sum + (source.sorted_damage_stock ?? 0), 0)
    if (total !== row.sorted_stock || damaged !== (row.sorted_damage_stock ?? 0)) return null

    return sources.map(source => ({
      goods_id: row.goods_id,
      location_id: locationId,
      lot_id: source.lot_id,
      receipt_source_id: source.receipt_source_id,
      quantity: source.sorted_stock,
    }))
  }))
  if (groups.some(group => group === null)) return null
  return groups.flatMap(group => group ?? [])
}
