/**
 * 下拉选项 / 标签的国际化显示
 *
 * 用于 VueMultiselect 的 :custom-label，以及详情、列表里显示存成代码的值（角色、库位类型、商品分类……）。
 * 找不到翻译时显示原值（自定义的角色、手工加的标签等）。
 *
 * 使用方式：
 *   const { translateOption, roleLabel, categoryLabel } = useOptionLabel()
 *
 *   <VueMultiselect :custom-label="roleLabel" ... />
 *   <VueMultiselect :custom-label="(val) => translateOption(val, 'asn.type')" ... />
 */

/**
 * 英文原值 → i18n key 片段：小写，连续的非字母数字换成「-」，去掉首尾的「-」。
 * 商品分类 / 单位 / 标签存的是英文原文（含空格、&、括号、℃），不能直接当 key（vue-i18n 的 key 路径解析不认这些字符）。
 *   'Pins & Badges' → 'pins-badges'，'Refrigerated (2-8℃)' → 'refrigerated-2-8'，'L' → 'l'
 */
export const optionSlug = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export const useOptionLabel = () => {
  const { t, te } = useI18n()

  /**
   * 翻译选项值
   * @param value - 选项原始值 (如 'company_admin', 'express', 'Pins & Badges')
   * @param category - i18n 路径前缀 (如 'roles', 'asn.type', 'options.goods-categories')
   * @param options.slug - 原值先转成 optionSlug 再查（商品分类 / 单位 / 标签）
   * @returns 翻译后的文本，找不到翻译时返回原值
   */
  const translateOption = (value: unknown, category: string, options?: { slug?: boolean }): string => {
    if (value === null || value === undefined || value === '') return ''
    const raw = String(value)
    const id = options?.slug ? optionSlug(raw) : raw
    if (!id) return raw
    const key = `${category}.${id}`
    return te(key) ? t(key) : raw
  }

  /** 角色（company_admin 等；自定义角色原样） */
  const roleLabel = (role: unknown) => translateOption(role, 'roles')
  /** 库位类型（standard / damaged / return） */
  const locationTypeLabel = (type: unknown) => translateOption(type, 'common.locations')
  /** 商品分类 */
  const categoryLabel = (category: unknown) => translateOption(category, 'options.goods-categories', { slug: true })
  /** 计量单位 */
  const unitLabel = (unit: unknown) => translateOption(unit, 'options.units', { slug: true })
  /** 计量单位下拉：译名后带代码（件 (pcs)），译名与代码相同时只显示一次 */
  const unitOptionLabel = (unit: unknown) => {
    const label = unitLabel(unit)
    const code = String(unit ?? '')
    return label && label !== code ? `${label} (${code})` : code
  }
  /** 商品标签（手工加的标签原样） */
  const tagLabel = (tag: unknown) => translateOption(tag, 'options.goods-tags', { slug: true })
  /** 下架原因 */
  const removalReasonLabel = (reason: unknown) => translateOption(reason, 'options.removal-reasons')

  return { translateOption, roleLabel, locationTypeLabel, categoryLabel, unitLabel, unitOptionLabel, tagLabel, removalReasonLabel }
}
