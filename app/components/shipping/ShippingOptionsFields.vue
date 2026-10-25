<script lang="ts" setup>
/**
 * 运单服务选项的输入框（后端 doc/shipping-flow.md §6.4）：只负责按 schema 显示输入。新建 / 编辑发货单（值的转换与
 * 提交见 composables/dn/shippingOptionsForm.ts）和发货流程「运单」一步的 ShippingOptionsEditor（保存 / 锁定）共用。
 * - schema：承运商声明的选项（GET /carrier/<id> 的 service_options）
 * - v-model：{key: 文字}（select 的 value、YYYY-MM-DD、金额的文字）；空 = 不指定（用选项的 default）
 * - errors：{key: 错误文字}（本地校验或后端 16139 的 field = shipping_options.<key>）
 * 一项一个 WField（12 栏网格里占 span 栏）；说明（help）收进「?」。
 */
import {
  localizedText,
  type ServiceOption,
  type ServiceOptionValue,
} from '~/composables/shipping/carrierFile'
import type { WSelectOption } from '~/components/w/WSelect.vue'

const model = defineModel<Record<string, string>>({ required: true })

withDefaults(defineProps<{
  schema: ServiceOption[]
  idPrefix: string
  disabled?: boolean
  errors?: Record<string, string | null | undefined>
  /** 每项占几栏（12 栏） */
  span?: number
}>(), {
  disabled: false,
  errors: () => ({}),
  span: 4,
})

const { t, localeProperties } = useI18n()
const iso = computed(() => String(localeProperties.value?.iso || 'en-US'))
const text = (value: any) => localizedText(value, iso.value)

const valueOf = (key: string): string => String(model.value?.[key] ?? '')
const setValue = (key: string, value: unknown) => {
  model.value = { ...model.value, [key]: value === null || value === undefined ? '' : String(value) }
}

/** select 的可选值（空值的那项由「不指定」代替，不重复列） */
const choices = (o: ServiceOption): ServiceOptionValue[] => (o.values || []).filter((v: ServiceOptionValue) => v.value !== '')

/** 没设时用的值的文字（select 显示选项的文字） */
const defaultText = (o: ServiceOption): string => {
  if (!o.default) return ''
  if (o.kind === 'select') {
    const hit = (o.values || []).find((v: ServiceOptionValue) => v.value === o.default)
    return hit ? text(hit.label) || o.default : o.default
  }
  return o.default
}
const unsetText = (o: ServiceOption): string => {
  if (defaultText(o)) return t('shipping.options.unset-default', { value: defaultText(o) })
  // 预设自带的「不指定」项（值为空串，如「指定なし」）用它的文字
  const blank = (o.values || []).find((v: ServiceOptionValue) => v.value === '')
  return (blank ? text(blank.label) : '') || t('shipping.options.unset')
}
/** 已存的值不在承运商现在的可选值里（承运商换过 / 预设改过）：照样列出来，不悄悄丢掉 */
const unknownValue = (o: ServiceOption): string => {
  const value = valueOf(o.key)
  return value && !choices(o).some((v: ServiceOptionValue) => v.value === value) ? value : ''
}
const selectOptions = (o: ServiceOption): WSelectOption<string>[] => [
  { value: '', label: unsetText(o) },
  ...choices(o).map((v: ServiceOptionValue) => ({ value: v.value, label: text(v.label) || v.value })),
  ...(unknownValue(o) ? [{ value: unknownValue(o), label: unknownValue(o) }] : []),
]
const helpOf = (o: ServiceOption): string | undefined => {
  const help = text(o.help)
  if (help) return help
  return o.kind === 'date' && o.default ? unsetText(o) : undefined
}
</script>

<template>
  <WFormGrid>
    <WField v-for="o in schema" :id="`${idPrefix}-${o.key}`" :key="o.key" :label="text(o.label) || o.key" :span="span"
      :help="helpOf(o)" :error="errors[o.key] || null">
      <WSelect v-if="o.kind === 'select'" :model-value="valueOf(o.key)" :options="selectOptions(o)" :disabled="disabled"
        @update:model-value="setValue(o.key, $event)" />
      <WDatePicker v-else-if="o.kind === 'date'" :model-value="valueOf(o.key) || null" weekday clearable :disabled="disabled"
        @update:model-value="setValue(o.key, $event)" />
      <WInput v-else-if="o.kind === 'money'" :model-value="valueOf(o.key)" inputmode="decimal" align="right"
        :placeholder="o.default || ''" :disabled="disabled" @update:model-value="setValue(o.key, $event)" />
      <WInput v-else :model-value="valueOf(o.key)" :maxlength="o.max_length || 200" :placeholder="o.default || ''"
        :disabled="disabled" @update:model-value="setValue(o.key, $event)" />
    </WField>
  </WFormGrid>
</template>
