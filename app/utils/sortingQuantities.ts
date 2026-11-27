export const sortingQuantityFields = [
  { key: 'sorted_quantity', label: 'inventory.pending.good' },
  { key: 'damage_quantity', label: 'inventory.pending.damaged' },
  { key: 'rejected_quantity', label: 'receiving-exceptions.rejected' },
] as const

export type SortingQuantityKey = (typeof sortingQuantityFields)[number]['key']
export type SortingQuantities<T = number> = Record<SortingQuantityKey, T>

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
