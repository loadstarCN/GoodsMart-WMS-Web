export default defineNuxtPlugin(nuxtApp => {
  type CurrencyDisplayMode = 'symbol' | 'narrowSymbol' | 'code' | 'name'

  interface CurrencyOptions {
    currencyType?: string
    displayMode?: CurrencyDisplayMode
    fallbackText?: string // 新增降级占位符配置
  }

  const currencyLocaleMap: Record<string, string> = {
    CNY: 'zh-CN', USD: 'en-US', EUR: 'de-DE', JPY: 'ja-JP', KRW:'ko-KR',
    GBP: 'en-GB', AUD: 'en-AU', CAD: 'en-CA', CHF: 'de-CH', NZD: 'en-NZ',
  }

  const fractionDigits: Record<string, number> = {
    JPY: 0,  // 日元无小数
    CLF: 4   // 智利比索4位小数
  }

  nuxtApp.provide('currency', (
    value: number | null | undefined,
    options: CurrencyOptions = { currencyType: 'CNY', displayMode: 'code', fallbackText: '--' }
  ): string => {
    const { currencyType = 'CNY', displayMode = 'code', fallbackText = '--' } = options
    
    // 空值处理
    if (value === null || value === undefined) {
      return fallbackText
    }

    // 数字有效性验证
    const numericValue = typeof value === 'string' 
      ? parseFloat(value) 
      : Number(value)
      
    if (isNaN(numericValue)) {
      return fallbackText
    }

    const locale = currencyLocaleMap[currencyType] || 'zh-CN'
    const digits = fractionDigits[currencyType] ?? 2

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyType,
        currencyDisplay: displayMode,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(numericValue)
    } catch (e) {
      console.error('Currency format error:', e)
      // 降级处理：返回原始数字 + 货币代码
      return `${numericValue.toLocaleString()} ${currencyType}`
    }
  })
})