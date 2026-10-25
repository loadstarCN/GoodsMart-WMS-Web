/**
 * 待上架库存（inventory.sorted_stock）的良品 / 破损拆分与上架数量校验。
 *
 * 后端约定（warehouse/inventory/services.py take_sorted_for_putaway）：
 * - sorted_damage_stock 是 sorted_stock 里的破损品（0 ≤ 破损 ≤ 待上架）；良品 = sorted_stock − sorted_damage_stock
 * - 上到破损库位（damaged）：先扣破损部分，其余扣良品，合计不超过 sorted_stock
 * - 上到标准 / 退货库位（standard / return）：只能用良品部分，超出 → 400 15016（details: good_pending / damaged_pending）
 * - 待上架合计不够 → 400 15007
 * 旧后端没有 sorted_damage_stock 时按 0（全部算良品）。
 */

export interface PendingPutaway {
  /** 待上架合计（sorted_stock） */
  total: number
  /** 良品（sorted_stock − sorted_damage_stock） */
  good: number
  /** 破损（sorted_damage_stock，只能上到破损库位） */
  damaged: number
}

const toCount = (value: unknown): number => {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 库存记录 → 待上架的良品 / 破损；没有记录时 null */
export const pendingPutaway = (inventory: Record<string, any> | null | undefined): PendingPutaway | null => {
  if (!inventory) return null
  const total = toCount(inventory.sorted_stock)
  const damaged = Math.min(toCount(inventory.sorted_damage_stock), total)
  return { total, good: total - damaged, damaged }
}

/** 是破损库位 */
export const isDamagedLocation = (locationType: unknown): boolean => locationType === 'damaged'

/** 上到该类型的库位最多能上多少（破损库位 = 待上架合计；标准 / 退货库位 = 良品部分） */
export const putawayLimit = (pending: PendingPutaway, locationType: unknown): number =>
  isDamagedLocation(locationType) ? pending.total : pending.good

/**
 * 上架数量超出时，返回与后端同样的业务错误（交给 useBizError 出三语文案）；没超出 / 不知道库存时 null。
 * - 超出待上架合计 → 15007
 * - 标准 / 退货库位超出良品部分（有破损待上架）→ 15016
 */
export const putawayQuantityError = (
  pending: PendingPutaway | null,
  locationType: unknown,
  quantity: number,
): { code: number; message: string; status: number; field: string; details: Record<string, any> } | null => {
  if (!pending || !Number.isFinite(quantity) || quantity <= 0) return null
  const details = { good_pending: pending.good, damaged_pending: pending.damaged, quantity }
  if (quantity > pending.total) {
    return { code: 15007, status: 400, field: 'quantity', message: 'Not enough sort stock.', details }
  }
  if (!isDamagedLocation(locationType) && quantity > pending.good) {
    return { code: 15016, status: 400, field: 'quantity', message: 'Damaged items can only be put away to a damaged location.', details }
  }
  return null
}

/**
 * 仓库的破损库位（按仓库缓存；上架弹窗提示「新建破损库位」、「只看破损库位」用）。
 * 读不到（没有库位查看权限等）时 null，界面不提示。
 */
const damagedLocationCache = new Map<string, Promise<any[] | null>>()

export const fetchDamagedLocations = (warehouseId: number | string | null | undefined, refresh = false): Promise<any[] | null> => {
  if (warehouseId === null || warehouseId === undefined || warehouseId === '') return Promise.resolve(null)
  const key = String(warehouseId)
  if (!refresh && damagedLocationCache.has(key)) return damagedLocationCache.get(key)!
  const request = (async () => {
    let result: any[] | null = null
    await httpRequest<PaginationData>('/api/warehouse/location/', {
      method: 'GET',
      params: { all: true, location_type: 'damaged', warehouse_id: warehouseId },
      headers: warehouseHeaders(warehouseId),
      onSuccess: (data) => {
        result = Array.isArray(data?.items) ? data.items : []
      },
    })
    if (result === null) damagedLocationCache.delete(key)
    return result
  })()
  damagedLocationCache.set(key, request)
  return request
}
