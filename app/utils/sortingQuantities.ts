export const sortingQuantityFields = [
  { key: 'sorted_quantity', label: 'inventory.pending.good' },
  { key: 'damage_quantity', label: 'inventory.pending.damaged' },
  { key: 'rejected_quantity', label: 'receiving-exceptions.rejected' },
] as const

export type SortingQuantityKey = (typeof sortingQuantityFields)[number]['key']
export type SortingQuantities<T = number> = Record<SortingQuantityKey, T>

export type SortingLotQuantity = {
  goods_id: number
  lot_id: number | null
  lot_no: string | null
  quantities: SortingQuantities
}

export type SortingCorrection = Omit<SortingLotQuantity, 'quantities'> & {
  id: number
  request_group?: string | null
  before: SortingQuantities
  after: SortingQuantities
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by: number
  requester: string
  requested_at: string
  reviewer: string | null
  reviewed_at: string | null
  review_note: string | null
}

export type SortingCorrectionSnapshot = {
  bulk_supported?: boolean
  rows: SortingLotQuantity[]
  corrections: SortingCorrection[]
}

export const emptySortingQuantities: SortingQuantities = {
  sorted_quantity: 0,
  damage_quantity: 0,
  rejected_quantity: 0,
}

export function validSortingQuantities(value: SortingQuantities<number | null>): value is SortingQuantities {
  return sortingQuantityFields.every(({ key }) => Number.isSafeInteger(value[key]) && value[key]! >= 0)
}

export function sameSortingQuantities(left: SortingQuantities<number | null>, right: SortingQuantities) {
  return sortingQuantityFields.every(({ key }) => left[key] === right[key])
}
