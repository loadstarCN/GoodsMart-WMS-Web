<script lang="ts" setup>
/**
 * 国家 / 地区下拉（ISO 3166-1 alpha-2），新界面版：WCombobox，按代码、界面语言的国名、英文名都能搜。
 * v-model 是大写代码或 null；不设默认值。旧页面仍用 components/UI/CountrySelect（vue-multiselect）。
 */
import { COUNTRY_CODES, COUNTRY_NAMES_EN, countryName } from '~/data/countries'
import type { WComboboxOption } from '~/components/w/WCombobox.vue'

withDefaults(defineProps<{
  placeholder?: string
  clearable?: boolean
  size?: 'md' | 'sm'
  disabled?: boolean
  invalid?: boolean
  id?: string
}>(), {
  clearable: true,
  size: 'md',
  disabled: false,
  invalid: false,
})

const model = defineModel<string | null | undefined>()
const { t, locale } = useI18n()

const value = computed({
  get: () => (model.value ? String(model.value).toUpperCase() : null),
  set: (next: string | null) => {
    model.value = next ? next.toUpperCase() : null
  },
})
/** 选项：「JP 日本」，英文名、代码另作搜索关键词 */
const options = computed<WComboboxOption<string>[]>(() => COUNTRY_CODES.map((code) => {
  const local = countryName(code, locale.value) || COUNTRY_NAMES_EN[code] || code
  return { value: code, label: `${code} ${local}`, keywords: `${code} ${COUNTRY_NAMES_EN[code] || ''}` }
}))
</script>

<template>
  <WCombobox v-model="value" :options="options" :clearable="clearable" :size="size" :disabled="disabled" :invalid="invalid"
    :id="id" :limit="300" :placeholder="placeholder || t('countries.placeholder')" :empty-text="t('countries.no-result')" />
</template>
