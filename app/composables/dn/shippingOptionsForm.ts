/**
 * DN 新建 / 编辑页的运单服务选项（后端 doc/shipping-flow.md §6.4 / §6.6）：
 * - 选项的声明看所选承运商：GET /carrier/<id> 的 service_options（[{key, kind, label, values?, default?, help?, max_length?}]，
 *   没有声明时为 []，页面上不显示）
 * - 创建 / 修改 DN 时随 body 的 shipping_options {key: value} 提交（后端 parse_for_create：已声明键的取值按类型校验，
 *   不合法 400 16139，field = shipping_options.<key>；没声明的键照收）
 * - 空着的项不提交（= 不指定，导出 / 建单时用选项的 default）
 * 表单里的值一律是字符串（select 的 value、YYYY-MM-DD、金额的文字）。
 */
import { httpRequest } from '~/utils/http'
import { normalizeServiceOptions, type ServiceOption } from '~/composables/shipping/carrierFile'

/** 承运商声明的服务选项；没有承运商 / 读取失败为 [] */
export const loadCarrierServiceOptions = async (carrierId: number | string | null | undefined): Promise<ServiceOption[]> => {
  if (carrierId === null || carrierId === undefined || carrierId === '') return []
  const data = await httpRequest<any>(`/api/warehouse/carrier/${carrierId}`, { method: 'GET' })
  return normalizeServiceOptions(data?.service_options)
}

const toFormValue = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** 已存的选项值 → 表单（只取声明了的键；previous 里同名的键优先，换承运商时保留已填的） */
export const optionsToForm = (
  schema: ServiceOption[],
  values: Record<string, any> | null | undefined,
  previous: Record<string, string> = {},
): Record<string, string> => {
  const form: Record<string, string> = {}
  for (const o of schema) {
    form[o.key] = o.key in previous ? previous[o.key] ?? '' : toFormValue(values?.[o.key])
  }
  return form
}

/** 一个选项的表单值 → 提交的值；空为 undefined（不提交）；金额不对为 null */
const optionValue = (option: ServiceOption, raw: string | undefined): string | number | null | undefined => {
  const value = String(raw ?? '').trim()
  if (!value) return undefined
  if (option.kind === 'money') {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  return value
}

export interface OptionsPayload {
  /** {key: value}；没有填的项时为 null */
  options: Record<string, any> | null
  /** 本地校验不过的键（金额不是 0 以上的数字） */
  invalid: string[]
}

/** 新建 DN：表单 → shipping_options（只含填了的项） */
export const optionsPayload = (schema: ServiceOption[], form: Record<string, string>): OptionsPayload => {
  const options: Record<string, any> = {}
  const invalid: string[] = []
  for (const o of schema) {
    const value = optionValue(o, form[o.key])
    if (value === null) invalid.push(o.key)
    else if (value !== undefined) options[o.key] = value
  }
  return { options: Object.keys(options).length ? options : null, invalid }
}

export interface OptionsChange extends OptionsPayload {
  /** 有没有改（没改时不提交 shipping_options，后端保留原值） */
  changed: boolean
}

/**
 * 编辑 DN：只把改了的项写进原有的选项（原有的、当前承运商没声明的键照留，来源系统传的可能是别家承运商的）。
 * 没改时 changed = false（不提交，避免碰到别处已锁定的选项）。
 */
export const optionsChange = (
  schema: ServiceOption[],
  form: Record<string, string>,
  original: Record<string, any> | null | undefined,
): OptionsChange => {
  const options: Record<string, any> = { ...(original || {}) }
  const invalid: string[] = []
  let changed = false
  for (const o of schema) {
    if (String(form[o.key] ?? '').trim() === toFormValue(original?.[o.key]).trim()) continue
    changed = true
    const value = optionValue(o, form[o.key])
    if (value === null) invalid.push(o.key)
    else if (value === undefined) delete options[o.key]
    else options[o.key] = value
  }
  return { options: Object.keys(options).length ? options : null, invalid, changed }
}

/** 后端 16139 的 field（shipping_options.<key> / options.<key>）→ 选项的 key；不是选项的错误为 null */
export const optionKeyOfError = (field: string | null | undefined): string | null => {
  const match = /^(?:shipping_options|options)\.(.+)$/.exec(String(field || ''))
  return match ? match[1]! : null
}
