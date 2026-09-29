import type { HttpRequestError } from '~/utils/http'

/**
 * 业务错误文案：优先按后端业务码（error.code）取三语文案，取不到时用后端原文。
 * 文案放在 i18n 的 biz-errors.code-<业务码>。
 */
export const useBizError = () => {
  const { t, te } = useI18n()

  const bizKey = (error: Partial<HttpRequestError> | null | undefined): string =>
    error && error.code !== undefined && error.code !== null ? `biz-errors.code-${error.code}` : ''

  /** 该业务码是否有专门的三语文案 */
  const hasBizMessage = (error: Partial<HttpRequestError> | null | undefined): boolean => {
    const key = bizKey(error)
    return !!key && te(key)
  }

  const bizErrorMessage = (error: Partial<HttpRequestError> | null | undefined): string => {
    if (!error) return t('action-results.failed')
    if (hasBizMessage(error)) return t(bizKey(error))
    return error.message || t('action-results.failed')
  }

  return { bizErrorMessage, hasBizMessage }
}
