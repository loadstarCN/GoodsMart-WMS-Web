<script lang="ts" setup>
/**
 * 仓库时区下拉（IANA 名，后端 doc/timezone-utc.md §2）
 * - 候选：浏览器的 Intl.supportedValuesOf('timeZone')，不支持时用常用时区的兜底列表（utils/timeZones.ts）
 * - 第一项「服务器默认」= null（用服务器的 WMS_DEFAULT_TIMEZONE）；defaultZone 给了时标出它是哪个
 * - 可按名称（Asia/Tokyo）或偏移（UTC+09:00）搜索；当前值不在候选里（旧别名）时也列出来
 */
const DEFAULT_OPTION = '__default__'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  id?: string
  disabled?: boolean
  /** 服务器默认时区（编辑没设时区的仓库时 = 详情接口的生效时区）；不知道时不标 */
  defaultZone?: string | null
  invalid?: boolean
}>(), {
  modelValue: null,
  id: undefined,
  disabled: false,
  defaultZone: null,
  invalid: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const { t } = useI18n()

const options = computed<string[]>(() => {
  const zones = supportedTimeZones()
  const current = props.modelValue
  const extra = current && !zones.includes(current) ? [current] : []
  return [DEFAULT_OPTION, ...extra, ...zones]
})

const selected = computed<string>({
  get: () => props.modelValue || DEFAULT_OPTION,
  set: (val: string | null) => emit('update:modelValue', !val || val === DEFAULT_OPTION ? null : val),
})

const label = (tz: string): string => {
  if (tz === DEFAULT_OPTION) {
    return isValidTimeZone(props.defaultZone)
      ? t('timezone.default-with', { zone: timeZoneDescription(props.defaultZone) })
      : t('timezone.default')
  }
  return isValidTimeZone(tz) ? timeZoneDescription(tz) : tz
}
</script>

<template>
  <div class="time-zone-select" :class="{ 'is-invalid': invalid }">
    <VueMultiselect
      :id="id"
      v-model="selected"
      :options="options"
      :custom-label="label"
      :searchable="true"
      :show-labels="false"
      :allow-empty="false"
      :disabled="disabled"
      :placeholder="t('timezone.search')"
      :options-limit="600"
    >
      <template #noResult>{{ t('timezone.no-result') }}</template>
    </VueMultiselect>
  </div>
</template>

<style scoped>
.time-zone-select.is-invalid :deep(.multiselect__tags) {
  border-color: var(--bs-danger, #dc3545);
}
</style>
