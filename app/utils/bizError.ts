import type { HttpRequestError } from '~/utils/http'

type BizErrorLike = Partial<HttpRequestError> | null | undefined

const detailsOf = (error: BizErrorLike): Record<string, any> => {
  const details = error?.details
  return details && typeof details === 'object' && !Array.isArray(details) ? details : {}
}

/**
 * 自动运单记录的状态 → 文案后缀：
 * - unknown（建单结果不明）→ unresolved：先到承运商后台核对，再在发货流程的「运单」一步取消或确认作废
 * - pending（建单中）→ in-progress：等它结束
 * - cancelling（取消中 / 取消结果不明）→ cancelling：等取消结束，或在发货流程的「运单」一步重试取消 / 核对后确认作废
 * - active（有效）→ ''：用基础文案（先取消运单）
 */
const carrierRecordVariant = (status: unknown): string => {
  if (status === 'unknown') return 'unresolved'
  if (status === 'pending') return 'in-progress'
  if (status === 'cancelling') return 'cancelling'
  return ''
}

/** 文案插值参数：details 的字段，加上业务错误顶层的 field（如 16115）；null / undefined 显示成「—」 */
const messageParams = (error: BizErrorLike): Record<string, any> => {
  const params: Record<string, any> = { field: error?.field ?? '', ...detailsOf(error) }
  for (const key of Object.keys(params)) {
    if (params[key] === null || params[key] === undefined) params[key] = '—'
  }
  return params
}

/**
 * 同一业务码按 details 细分的文案（key 后缀）；没有对应文案时回落到基础 key。
 * - 16063：单价小数位超出币种允许（details.max_decimal_places）→ code-16063-decimal-places
 * - 16076：签发的单证数据与随运单提交的不同（details.reason = DOCUMENT_DATA_CHANGED）→ code-16076-document-changed；
 *   否则按 details.carrier_shipment.status 区分（见 carrierRecordVariant）→ code-16076-unresolved / -in-progress / -cancelling
 * - 16078：本 DN 已取消的自动运单号（details.status = cancelled）→ code-16078-cancelled；
 *   自动运单结果不明 / 建单中 / 取消中（details.status = unknown / pending / cancelling）→ code-16078-unresolved / -in-progress / -cancelling；
 *   没带运单号（新建 / 删除配送任务被拒）→ code-16078-no-tracking
 * - 16079：按 details.unresolved.status 区分：建单中 → -in-progress；取消中 / 取消结果不明 → -cancelling；建单结果不明 → 基础文案
 * - 16095：承运商已建运单但保存失败，已自动取消（details.compensation.cancelled = true）→ code-16095-cancelled
 * - 16135：承运商的对接方式不能选（field 为 waybill_method / pickup_method / tracking_method）→ code-16135-method；
 *   文件方式的设置（field 为 file_preset / file_template / file_account.<key>）→ code-16135-file；
 *   其它（定期集荷、查询页、自动签收天数……）用基础文案
 * - 16137：承运商文件有行不能导出（逐行问题在 details.rows，界面另列表格）→ 基础文案
 * - 16138：文件方式用不了。409 + field carrier_id（运单方式不是文件 / 没有可用的模板 / 模板不能导入）→ code-16138-carrier；
 *   409 + field file_account.<key>（必填账号项没填）→ code-16138-account；400 + field file（导入文件没有 / 为空 / 太大 / 读不了）
 *   → 基础文案；其它 400（carrier_id / dn_ids / warehouse_id / dry_run 不合法）→ code-16138-request
 * - 16139：运单服务选项不合法（field = options.<key>）→ 基础文案（选项编辑器把它标在该项下面）
 * - 16076：details.reason = SHIPPING_OPTIONS_LOCKED（建运单 / 导出后改服务选项）→ code-16076-options-locked；
 *   SHIP_TO_LOCKED（建运单 / 导出后改收件地址）→ code-16076-ship-to-locked
 * - 16075：作废导出时没有已导出的文件运单（details 带 waybill 键）→ code-16075-discard
 */
export const bizErrorVariant = (error: BizErrorLike): string => {
  if (!error) return ''
  const details = detailsOf(error)
  if (error.code === 16063 && details.max_decimal_places !== undefined && details.max_decimal_places !== null) return 'decimal-places'
  if (error.code === 16076) {
    if (details.reason === 'SHIPPING_OPTIONS_LOCKED') return 'options-locked'
    if (details.reason === 'SHIP_TO_LOCKED') return 'ship-to-locked'
    if (details.reason === 'DOCUMENT_DATA_CHANGED') return 'document-changed'
    const shipment = details.carrier_shipment
    return carrierRecordVariant(shipment && typeof shipment === 'object' ? shipment.status : details.status)
  }
  if (error.code === 16079) {
    const unresolved = details.unresolved
    const variant = carrierRecordVariant(unresolved && typeof unresolved === 'object' ? unresolved.status : null)
    return variant === 'unresolved' ? '' : variant
  }
  if (error.code === 16095) {
    const compensation = details.compensation
    return compensation && typeof compensation === 'object' && compensation.cancelled === true ? 'cancelled' : ''
  }
  if (error.code === 16135 && /_method$/.test(String(error.field || ''))) return 'method'
  if (error.code === 16135 && /^file_/.test(String(error.field || ''))) return 'file'
  if (error.code === 16138) {
    const field = String(error.field || '')
    if (field.startsWith('file_account')) return 'account'
    if (error.status === 409) return 'carrier'
    if (field && field !== 'file') return 'request'
    return ''
  }
  if (error.code === 16075 && Object.prototype.hasOwnProperty.call(details, 'waybill')) return 'discard'
  if (error.code === 16078 && details.status === 'cancelled') return 'cancelled'
  if (error.code === 16078) {
    const variant = carrierRecordVariant(details.status)
    if (variant) return variant
  }
  if (error.code === 16078 && !details.tracking_number) return 'no-tracking'
  return ''
}

/**
 * 业务错误文案：优先按后端业务码（error.code）取三语文案，取不到时用后端原文。
 * 文案放在 i18n 的 biz-errors.code-<业务码>（细分文案 biz-errors.code-<业务码>-<后缀>，见 bizErrorVariant）；
 * 文案里可用 {字段名} 引用 error.details 的同名字段（如 {tracking_number}），以及业务错误顶层的 {field}。
 */
export const useBizError = () => {
  const { t, te } = useI18n()

  const bizKey = (error: BizErrorLike): string => {
    if (!error || error.code === undefined || error.code === null) return ''
    const base = `biz-errors.code-${error.code}`
    const variant = bizErrorVariant(error)
    return variant && te(`${base}-${variant}`) ? `${base}-${variant}` : base
  }

  /** 该业务码是否有专门的三语文案 */
  const hasBizMessage = (error: BizErrorLike): boolean => {
    const key = bizKey(error)
    return !!key && te(key)
  }

  const bizErrorMessage = (error: BizErrorLike): string => {
    if (!error) return t('action-results.failed')
    if (hasBizMessage(error)) {
      return t(bizKey(error), messageParams(error))
    }
    return error.message || t('action-results.failed')
  }

  return { bizErrorMessage, hasBizMessage }
}
