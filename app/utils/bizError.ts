import type { HttpRequestError } from '~/utils/http'

type BizErrorLike = Partial<HttpRequestError> | null | undefined

const detailsOf = (error: BizErrorLike): Record<string, any> => {
  const details = error?.details
  return details && typeof details === 'object' && !Array.isArray(details) ? details : {}
}

/**
 * 自动运单记录的状态 → 文案后缀：
 * - unknown（建单结果不明）→ unresolved：先到 FedEx Ship Manager 核对，再在单证卡片取消或确认作废
 * - pending（建单中）→ in-progress：等它结束
 * - cancelling（取消中 / 取消结果不明）→ cancelling：等取消结束，或在单证卡片重试取消 / 核对后确认作废
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
 * - 16069：单证过期（details.outdated = true）→ code-16069-outdated；缺失（details.missing_documents）→ code-16069
 * - 16063：单价小数位超出币种允许（details.max_decimal_places）→ code-16063-decimal-places
 * - 16076：签发的单证数据与随运单提交的不同（details.reason = DOCUMENT_DATA_CHANGED）→ code-16076-document-changed；
 *   否则按 details.carrier_shipment.status 区分（见 carrierRecordVariant）→ code-16076-unresolved / -in-progress / -cancelling
 * - 16078：本 DN 已取消的自动运单号（details.status = cancelled）→ code-16078-cancelled；
 *   自动运单结果不明 / 建单中 / 取消中（details.status = unknown / pending / cancelling）→ code-16078-unresolved / -in-progress / -cancelling；
 *   没带运单号（新建 / 删除配送任务被拒）→ code-16078-no-tracking
 * - 16079：按 details.unresolved.status 区分：建单中 → -in-progress；取消中 / 取消结果不明 → -cancelling；建单结果不明 → 基础文案
 * - 16095：FedEx 已建运单但 WMS 保存失败，已自动取消（details.compensation.cancelled = true）→ code-16095-cancelled
 */
export const bizErrorVariant = (error: BizErrorLike): string => {
  if (!error) return ''
  const details = detailsOf(error)
  if (error.code === 16069 && details.outdated === true) return 'outdated'
  if (error.code === 16063 && details.max_decimal_places !== undefined && details.max_decimal_places !== null) return 'decimal-places'
  if (error.code === 16076) {
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
