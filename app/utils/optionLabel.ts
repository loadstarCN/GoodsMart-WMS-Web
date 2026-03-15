/**
 * 下拉选项国际化翻译工具
 *
 * 用于 VueMultiselect 的 :custom-label prop，将选项值翻译为当前语言的显示文本。
 *
 * 使用方式：
 *   import { useOptionLabel } from '~/utils/optionLabel'
 *   const { translateOption } = useOptionLabel()
 *
 *   <VueMultiselect :custom-label="(val) => translateOption(val, 'roles')" ... />
 *   <VueMultiselect :custom-label="(val) => translateOption(val, 'options.asn-types')" ... />
 */
export const useOptionLabel = () => {
  const { t, te } = useI18n()

  /**
   * 翻译下拉选项值
   * @param value - 选项原始值 (如 'company_admin', 'express')
   * @param category - i18n 路径前缀 (如 'roles', 'options.asn-types')
   * @returns 翻译后的文本，找不到翻译时返回原值
   */
  const translateOption = (value: string, category: string): string => {
    if (!value) return ''
    const key = `${category}.${value}`
    return te(key) ? t(key) : value
  }

  return { translateOption }
}
