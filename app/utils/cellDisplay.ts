/**
 * 表格与字段列表的空值规则（设计稿 Tokens「表格空值规则」）：
 * - 数量为 0、不适用、文本为空：留空（库存类多数量列的表里 0 占大多数）
 * - 金额为 0：显示「0」，弱化文字色
 * - 关键列 / 合计行的 0：照常显示（keepZero）
 * - 有含义的空写词：「未设置」「账单未到」「效期未知」（emptyText，弱化色）
 * - 字段列表（详情页右栏）缺值：弱化色「—」，保留这一行（fieldDisplay）
 */

/** 单元格类型：决定 0 和空怎么显示；qty / money 默认右对齐、千分位 */
export type CellType = 'text' | 'qty' | 'money'

export interface CellRule {
  type?: CellType
  /** 关键列 / 合计：0 照常显示 */
  keepZero?: boolean
  /** 有含义的空写词（如「未设置」）；不给时留空 */
  emptyText?: string
  /** 数字的区域格式（默认跟浏览器）；金额的小数位按数值本身 */
  locale?: string
}

export interface CellDisplay {
  text: string
  /** 用弱化文字色显示（金额 0、空写词、字段列表的「—」） */
  muted: boolean
}

const isBlank = (value: unknown) => value === null || value === undefined || value === ''

/** 千分位；数字字符串（后端的 Decimal）保留原来的小数位数 */
const formatNumber = (value: number, raw: unknown, locale?: string) => {
  const decimals = typeof raw === 'string' ? (raw.split('.')[1] || '').length : 0
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 20) })
}

/** 表格单元格怎么显示；value 已经是字符串（自己格式化过）时只套用空值规则 */
export function tableCellDisplay(value: unknown, rule: CellRule = {}): CellDisplay {
  const { type = 'text', keepZero = false, emptyText, locale } = rule
  const empty = (): CellDisplay => (emptyText ? { text: emptyText, muted: true } : { text: '', muted: false })
  if (isBlank(value)) return empty()
  if (type === 'text') return { text: String(value), muted: false }

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return { text: String(value), muted: false }
  if (num === 0) {
    if (keepZero) return { text: '0', muted: false }
    if (type === 'money') return { text: '0', muted: true }
    return empty()
  }
  return { text: formatNumber(num, value, locale), muted: false }
}

/** 字段列表（详情页右栏）的值：缺值显示弱化色「—」，有含义的空用 emptyText */
export function fieldDisplay(value: unknown, emptyText?: string): CellDisplay {
  if (isBlank(value)) return { text: emptyText || '—', muted: true }
  return { text: String(value), muted: false }
}
