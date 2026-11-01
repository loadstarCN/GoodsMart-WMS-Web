export function thresholdPreviewRow(row: any, options: { mode: string; low: unknown; high: unknown; keepExisting: boolean }) {
  const retained = options.keepExisting && (row.current_low >= 0 || row.current_high >= 0)
  const fixed = (value: unknown, current: number) => value == null || value === '' ? current : Number(value)
  return { ...row, id: row.goods.id, retained,
    low: retained ? row.current_low : options.mode === 'fixed' ? fixed(options.low, row.current_low) : row.suggested_low,
    high: retained ? row.current_high : options.mode === 'fixed' ? fixed(options.high, row.current_high) : row.suggested_high }
}

export function thresholdPreviewCsv(headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value)
    // Treat product names/codes as text in spreadsheet applications.
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}
