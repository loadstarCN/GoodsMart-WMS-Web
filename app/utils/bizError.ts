import type { HttpRequestError } from '~/utils/http'

type BizErrorLike = Partial<HttpRequestError> | null | undefined

const detailsOf = (error: BizErrorLike): Record<string, any> => {
  const details = error?.details
  return details && typeof details === 'object' && !Array.isArray(details) ? details : {}
}

/**
 * 同一业务码按 details 细分的文案（key 后缀）；没有对应文案时回落到基础 key。
 * - 16069：单证过期（details.outdated = true）→ code-16069-outdated；缺失（details.missing_documents）→ code-16069
 * - 16078：没带运单号（新建 / 删除配送任务被拒）→ code-16078-no-tracking
 */
export const bizErrorVariant = (error: BizErrorLike): string => {
  if (!error) return ''
  const details = detailsOf(error)
  if (error.code === 16069 && details.outdated === true) return 'outdated'
  if (error.code === 16078 && !details.tracking_number) return 'no-tracking'
  return ''
}

/**
 * 业务错误文案：优先按后端业务码（error.code）取三语文案，取不到时用后端原文。
 * 文案放在 i18n 的 biz-errors.code-<业务码>（细分文案 biz-errors.code-<业务码>-<后缀>，见 bizErrorVariant）；
 * 文案里可用 {字段名} 引用 error.details 的同名字段（如 {tracking_number}）。
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
      return t(bizKey(error), detailsOf(error))
    }
    return error.message || t('action-results.failed')
  }

  return { bizErrorMessage, hasBizMessage }
}
