<script lang="ts" setup>
/**
 * 运单服务选项的输入框（DN 新建 / 编辑页；后端 doc/shipping-flow.md §6.4）：只负责按 schema 显示输入，
 * 值的转换与提交见 composables/dn/shippingOptionsForm.ts。发货流程「运单」一步里的保存 / 锁定是 ShippingOptionsEditor。
 * - schema：承运商声明的选项（GET /carrier/<id> 的 service_options）
 * - v-model：{key: 文字}（select 的 value、YYYY-MM-DD、金额的文字）；空 = 不指定（用选项的 default）
 * - errors：{key: 错误文字}（本地校验或后端 16139 的 field = shipping_options.<key>）
 */
import {
  localizedText,
  type ServiceOption,
  type ServiceOptionValue,
} from '~/composables/shipping/carrierFile'

const model = defineModel<Record<string, string>>({ required: true })

withDefaults(defineProps<{
  schema: ServiceOption[]
  idPrefix: string
  disabled?: boolean
  errors?: Record<string, string | null | undefined>
  /** 每项的列宽（默认一行一项） */
  colClass?: string
}>(), {
  disabled: false,
  errors: () => ({}),
  colClass: 'col-12',
})

const { t, localeProperties } = useI18n()
const iso = computed(() => String(localeProperties.value?.iso || 'en-US'))
const text = (value: any) => localizedText(value, iso.value)

const valueOf = (key: string): string => String(model.value?.[key] ?? '')
const setValue = (key: string, value: string) => {
  model.value = { ...model.value, [key]: value }
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
const unsetText = (o: ServiceOption): string =>
  (defaultText(o) ? t('shipping.options.unset-default', { value: defaultText(o) }) : t('shipping.options.unset'))
/** 已存的值不在承运商现在的可选值里（承运商换过 / 预设改过）：照样列出来，不悄悄丢掉 */
const unknownValue = (o: ServiceOption): string => {
  const value = valueOf(o.key)
  return value && !choices(o).some((v: ServiceOptionValue) => v.value === value) ? value : ''
}
</script>

<template>
  <div class="row g-2">
    <div :class="colClass" v-for="o in schema" :key="o.key">
      <label class="form-label fs-12 mb-1" :for="`${idPrefix}-${o.key}`">{{ text(o.label) || o.key }}</label>
      <select class="form-select form-select-sm" :id="`${idPrefix}-${o.key}`" v-if="o.kind === 'select'" :disabled="disabled"
        :value="valueOf(o.key)" @change="setValue(o.key, ($event.target as HTMLSelectElement).value)">
        <option value="">{{ unsetText(o) }}</option>
        <option v-for="v in choices(o)" :key="v.value" :value="v.value">{{ text(v.label) || v.value }}</option>
        <option v-if="unknownValue(o)" :value="unknownValue(o)">{{ unknownValue(o) }}</option>
      </select>
      <input type="date" class="form-control form-control-sm" :id="`${idPrefix}-${o.key}`" v-else-if="o.kind === 'date'"
        :disabled="disabled" :value="valueOf(o.key)" @input="setValue(o.key, ($event.target as HTMLInputElement).value)">
      <input type="number" class="form-control form-control-sm" :id="`${idPrefix}-${o.key}`" min="0" step="any"
        v-else-if="o.kind === 'money'" :placeholder="o.default || ''" :disabled="disabled" :value="valueOf(o.key)"
        @input="setValue(o.key, ($event.target as HTMLInputElement).value)">
      <input type="text" class="form-control form-control-sm" :id="`${idPrefix}-${o.key}`" :maxlength="o.max_length || 200"
        v-else :placeholder="o.default || ''" :disabled="disabled" :value="valueOf(o.key)"
        @input="setValue(o.key, ($event.target as HTMLInputElement).value)">
      <div class="form-text fs-11" v-if="text(o.help)">{{ text(o.help) }}</div>
      <div class="form-text fs-11" v-else-if="o.kind === 'date' && o.default">{{ unsetText(o) }}</div>
      <div class="invalid-feedback d-block" v-if="errors[o.key]">{{ errors[o.key] }}</div>
    </div>
  </div>
</template>
