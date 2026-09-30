/**
 * 商品编辑表单：只提交用户改过的字段
 *
 * 后端 PUT /warehouse/goods/<id> 对没带的字段保持原值；origin_country 带了就按值写（'' / null = 清空）。
 * 整条回写会把别处（称重站实测的重量尺寸、PDA / 单证卡片补录的原产国）在打开编辑页之后的更新
 * 用画面上的旧值盖掉，所以对比打开时的原值，只带变了的字段：
 * - 原产国没动就不带；用户明确清空才传 ''
 * - 重量 / 尺寸没动就不带；清空传 null
 */

/** 编辑页可提交的字段（company_id 后端不允许改；extra_data 页面上没有编辑入口） */
export const GOODS_EDIT_FIELDS = [
  'name',
  'code',
  'category',
  'brand',
  'manufacturer',
  'tags',
  'description',
  'price',
  'discount_price',
  'currency',
  'unit',
  'weight',
  'length',
  'width',
  'height',
  'origin_country',
  'image_url',
  'thumbnail_url',
  'production_date',
  'expiration_date',
] as const

export type GoodsEditField = (typeof GOODS_EDIT_FIELDS)[number]

const NUMBER_FIELDS: ReadonlySet<string> = new Set(['price', 'discount_price', 'weight', 'length', 'width', 'height'])
const DATE_FIELDS: ReadonlySet<string> = new Set(['production_date', 'expiration_date'])

const isBlank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** 富文本编辑器的空内容（Quill 清空后是 <p><br></p>） */
const isEmptyHtml = (v: unknown): boolean =>
  isBlank(v) || (typeof v === 'string' && v.replace(/<p>(<br\s*\/?>)?<\/p>/gi, '').trim() === '')

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 日期统一成 YYYY-MM-DD（Date 按本地日期，避免 toISOString 的 UTC 跨日） */
const toDateString = (v: unknown): string | null => {
  if (isBlank(v)) return null
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  }
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s
}

/** 数值字段：空 = null；能转数字就转数字（'1.50' 与 1.5 视为相同），否则原样（交给后端校验） */
const toNumberValue = (v: unknown): number | string | null => {
  if (isBlank(v)) return null
  const n = Number(typeof v === 'string' ? v.trim() : v)
  return Number.isFinite(n) ? n : String(v).trim()
}

/** 标签：数组 / 逗号串 → 逗号串，空 = null（与 convert_tags_to_string 一致） */
const toTagsValue = (v: unknown): string | null => {
  if (Array.isArray(v)) return v.length > 0 ? v.map((x) => String(x)).join(',') : null
  return isBlank(v) ? null : String(v)
}

/** 提交用的值（数值 / 日期 / 标签 / 原产国规范化，其余原样） */
export const goodsFieldPayloadValue = (field: GoodsEditField, value: unknown): unknown => {
  if (NUMBER_FIELDS.has(field)) return toNumberValue(value)
  if (DATE_FIELDS.has(field)) return toDateString(value)
  if (field === 'tags') return toTagsValue(value)
  // 原产国：后端约定 '' = 清空
  if (field === 'origin_country') return isBlank(value) ? '' : String(value).trim().toUpperCase()
  if (field === 'description') return isEmptyHtml(value) ? '' : value
  return value === undefined ? null : value
}

/** 比较用的值：空值（null / '' / 空富文本）一律视为相同 */
const comparableValue = (field: GoodsEditField, value: unknown): string => {
  if (field === 'description') return isEmptyHtml(value) ? '' : String(value)
  const v = goodsFieldPayloadValue(field, value)
  return v === null || v === undefined ? '' : String(v)
}

/** 表单里打开时的原值快照（深拷贝，之后表单怎么改都不影响它） */
export const snapshotGoodsForm = (form: Record<string, any>): Record<string, any> => {
  const snap: Record<string, any> = {}
  for (const field of GOODS_EDIT_FIELDS) {
    const v = form?.[field]
    snap[field] = Array.isArray(v) ? [...v] : v instanceof Date ? new Date(v.getTime()) : v
  }
  return snap
}

/** 与原值相比变了的字段（按提交格式）；没有变化返回空对象 */
export const buildGoodsUpdatePayload = (
  original: Record<string, any>,
  current: Record<string, any>,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}
  for (const field of GOODS_EDIT_FIELDS) {
    if (comparableValue(field, original?.[field]) !== comparableValue(field, current?.[field])) {
      payload[field] = goodsFieldPayloadValue(field, current?.[field])
    }
  }
  return payload
}
