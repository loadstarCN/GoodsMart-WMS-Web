/** Unknown carton assignments remain unknown; allocation totals never imply a carton. */
export function packagePrintSummary(packages: any[]) {
  const complete = packages.length > 0 && packages.every(box => Array.isArray(box.contents))
  const sumKnown = (value: (box: any) => number | null) => {
    const values = packages.map(value)
    return values.length && values.every(n => n !== null && Number.isFinite(n))
      ? (values as number[]).reduce((sum, n) => sum + n, 0) : null
  }
  return {
    count: packages.length,
    quantity: complete ? packages.reduce((sum, box) => sum + box.contents.reduce((n: number, row: any) => n + Number(row.quantity), 0), 0) : null,
    grossWeight: sumKnown(box => box.gross_weight_kg == null ? null : Number(box.gross_weight_kg)),
    volume: sumKnown(box => [box.length_mm, box.width_mm, box.height_mm].every(n => n != null && Number(n) > 0)
      ? Number(box.length_mm) * Number(box.width_mm) * Number(box.height_mm) / 1e9 : null),
  }
}
