/** Use EAN-13 only when its check digit is valid; preserve all other codes verbatim. */
export function goodsBarcodeFormat(code: string): 'EAN13' | 'CODE128' | 'QR' {
  if (/^\d{13}$/.test(code)) {
    const sum = [...code.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
    if ((10 - sum % 10) % 10 === Number(code[12])) return 'EAN13'
  }
  return /^[\x20-\x7E]+$/.test(code) ? 'CODE128' : 'QR'
}
