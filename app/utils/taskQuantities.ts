/** Validate the entire entry before posting a batch, including rows with negative input. */
export function invalidTaskEntries(kind: 'sorting' | 'picking' | 'packing', rows: any[]): boolean {
  const quantity = (value: unknown) => value == null || value === '' ? 0 : Number(value)
  const valid = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
  return rows.some(row => {
    if (kind === 'sorting') {
      const good = quantity(row.new_sorted_quantity), damaged = quantity(row.new_damage_quantity), rejected = quantity(row.new_rejected_quantity)
      return !valid(good) || !valid(damaged) || !valid(rejected)
        || good + damaged + rejected > Math.max(0, quantity(row.quantity) - quantity(row.old_sorted_quantity) - quantity(row.old_damage_quantity) - quantity(row.old_rejected_quantity))
    }
    const value = quantity(row[kind === 'picking' ? 'new_picked_quantity' : 'new_packed_quantity'])
    const available = kind === 'picking'
      ? quantity(row.quantity) - quantity(row.picked_quantity) - quantity(row.old_picked_quantity)
      : quantity(row.picked_quantity) - quantity(row.old_packed_quantity)
    return !valid(value) || value > Math.max(0, available)
  })
}

/** Any entered nonzero/invalid value must block completion until saved or explicitly reset. */
export function hasTaskEntry(rows: any[], fields: string[]): boolean {
  return rows.some(row => fields.some(field => row[field] != null && row[field] !== '' && Number(row[field]) !== 0))
}
