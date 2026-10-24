/**
 * DN 的单行收件地址 shipping_address 跟着结构化的收件地址（ship_to）自动生成（与 StructuredAddressFields 的「单行地址」
 * 一栏同样的做法，后端只给了 ship_to 时也按同样的写法生成）：
 * - 空着、或与当前排版一致（之前就是自动生成的）时跟着结构化字段更新；手工改过之后不再覆盖，可以一键换成排版的写法
 * - 没填结构化地址（旧数据 / 收货方只有单行地址）时不清空单行地址
 * 页面换了一整份地址（选收货方、读到 DN）后调用 reset()，按新的值重新判断是否自动跟随。
 */
import type { Ref } from 'vue'
import { formatAddressOneLine, hasStructuredAddress } from '~/composables/address/structuredAddress'

const clean = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

export const useShippingAddressLine = (shipTo: Ref<Record<string, any>>, line: Ref<string | null>) => {
  /** 按结构化字段排的单行写法（不带姓名、本地写法不带国家）；没填结构化地址为 '' */
  const formatted = computed(() => (hasStructuredAddress(shipTo.value) ? formatAddressOneLine(shipTo.value, 'local') : ''))
  const auto = ref(true)

  const reset = () => {
    const value = clean(line.value)
    auto.value = !value || value === formatted.value
  }
  watch(formatted, (value: string) => {
    if (auto.value && value) line.value = value
  })
  const onInput = (value: string) => {
    line.value = value
    auto.value = !value.trim()
  }
  const useFormatted = () => {
    line.value = formatted.value
    auto.value = true
  }
  /** 手工写的单行地址与结构化地址的排版不一致 */
  const differs = computed(() => !!formatted.value && clean(line.value) !== formatted.value)

  return { formatted, auto, differs, reset, onInput, useFormatted }
}
