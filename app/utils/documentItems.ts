export interface DocumentItem {
  id?: number
  goods_id: number
  quantity: number
  remark?: string | null
  goods?: Record<string, any>
  max_qty?: number | null
  [key: string]: any
}

export interface ItemPreview {
  lines: number[]
  code: string
  quantity: number | string
  remark: string
  error: string | null
  goods?: { goods_id: number; code: string; name: string; available_stock_for_sale?: number; [key: string]: any } | null
}

/** Preview is read-only; preserving an existing row also preserves its remark and detail ID. */
export function mergeDocumentItems(existing: DocumentItem[], preview: ItemPreview[], mode: 'add' | 'keep',
  reserved: Record<string, number> = {}): DocumentItem[] {
  const result = existing.map((item) => ({ ...item }))
  for (const row of preview) {
    if (row.error || !row.goods) continue
    const goods = row.goods
    const current = result.find((item) => item.goods_id === goods.goods_id)
    if (current && mode === 'keep') continue
    const available = goods.available_stock_for_sale
    const max = typeof available === 'number' ? Math.max(0, available + (reserved[String(goods.goods_id)] || 0)) : null
    if (current) {
      current.quantity = Number(current.quantity) + Number(row.quantity)
      current.remark = [...new Set([current.remark, row.remark].filter(Boolean))].join('；')
      current.max_qty = max
    } else {
      result.push({ goods_id: goods.goods_id, goods: { ...goods, id: goods.goods_id }, quantity: Number(row.quantity),
        remark: row.remark, max_qty: max })
    }
  }
  return result
}

export function invalidItemQuantity(item: DocumentItem): boolean {
  const n = Number(item.quantity)
  return !Number.isSafeInteger(n) || n < 1 || n > 2147483647
}

export function itemExceedsStock(item: DocumentItem): boolean {
  return typeof item.max_qty === 'number' && Number(item.quantity) > item.max_qty
}

/** Existing documents may contain several lines reserving the same goods. */
export function goodsExceedingStock(items: DocumentItem[]): Set<number> {
  const totals = new Map<number, { quantity: number; limit: number }>()
  for (const item of items) {
    const total = totals.get(item.goods_id) || { quantity: 0, limit: Infinity }
    total.quantity += Number(item.quantity)
    if (typeof item.max_qty === 'number') total.limit = Math.min(total.limit, item.max_qty)
    totals.set(item.goods_id, total)
  }
  return new Set([...totals].filter(([, value]) => value.quantity > value.limit).map(([id]) => id))
}
