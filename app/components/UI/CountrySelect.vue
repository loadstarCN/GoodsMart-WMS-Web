<script lang="ts" setup>
/**
 * 国家/地区下拉（ISO 3166-1 alpha-2）
 * - 可按代码、当前语言名、英文名搜索
 * - 不设默认值；可清空（清空时回传 null）
 */
import { COUNTRY_CODES, countryOptionLabel } from '~/data/countries'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  id?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  size?: 'sm' | 'md'
}>(), {
  modelValue: null,
  id: undefined,
  placeholder: undefined,
  disabled: false,
  clearable: true,
  size: 'md',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const { t, locale } = useI18n()

const selected = computed<string | null>({
  get: () => (props.modelValue ? String(props.modelValue).toUpperCase() : null),
  set: (val: string | null) => emit('update:modelValue', val ? String(val).toUpperCase() : null),
})

const label = (code: string) => countryOptionLabel(code, locale.value)

const clear = () => {
  if (props.disabled) return
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="country-select d-flex align-items-stretch gap-1" :class="{ 'country-select-sm': size === 'sm' }">
    <div class="flex-fill" style="min-width: 0;">
      <VueMultiselect
        :id="id"
        v-model="selected"
        :options="COUNTRY_CODES"
        :custom-label="label"
        :searchable="true"
        :show-labels="false"
        :allow-empty="true"
        :disabled="disabled"
        :placeholder="placeholder || t('countries.placeholder')"
        :options-limit="300"
      >
        <template #noResult>{{ t('countries.no-result') }}</template>
      </VueMultiselect>
    </div>
    <button
      v-if="clearable && selected && !disabled"
      type="button"
      class="btn btn-light btn-sm px-2"
      :title="t('countries.clear')"
      :aria-label="t('countries.clear')"
      @click="clear"
    >
      <i class="ri-close-line"></i>
    </button>
  </div>
</template>

<style scoped>
.country-select-sm :deep(.multiselect) {
  min-height: 32px;
}
.country-select-sm :deep(.multiselect__tags) {
  min-height: 32px;
  padding-top: 4px;
}
</style>
