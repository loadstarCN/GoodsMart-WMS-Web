<script setup lang="ts">
/**
 * 日期 / 日期时间选择（浏览器原生的日历面板，外观同输入框）：
 * - mode="date"：v-model 是仓库当地的业务日期 YYYY-MM-DD（计划发货日、揽收日），原样显示和提交，不按时区挪；
 *   weekday 时在后面标出星期（按界面语言）
 * - mode="datetime"：v-model 是时刻（后端给的 ISO 8601，提交出去的是带偏移的 2026-10-23T13:03:00+09:00）。
 *   输入框里是 timeZone（记录 / 仓库 id / IANA 名，见 useTimeZone）的墙上时间；与浏览器时区不同时在后面标出时区缩写
 * min / max 与 v-model 同一种写法。空 = null。其余属性（step、placeholder……）传给 <input>。
 * 放在 WField 里时自动接上 id / aria-*（经 WInput）。
 */
import type { TimeZoneSource } from '~/composables/useTimeZone'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  mode?: 'date' | 'datetime'
  /** 时刻按哪个时区显示 / 输入（mode="datetime"）；不给时用上层 provideTimeZone → 页头仓库 → 浏览器 */
  timeZone?: TimeZoneSource
  min?: string | Date | null
  max?: string | Date | null
  /** 日期后面标出星期 */
  weekday?: boolean
  clearable?: boolean
  size?: 'md' | 'sm'
  invalid?: boolean
  disabled?: boolean
  readonly?: boolean
  id?: string
}>(), {
  mode: 'date',
  timeZone: null,
  min: null,
  max: null,
  weekday: false,
  clearable: false,
  size: 'md',
  invalid: false,
  disabled: false,
  readonly: false,
})

const model = defineModel<string | null | undefined>()
const attrs = useAttrs()
const { locale } = useI18n()
const zone = useTimeZone(() => props.timeZone)

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** v-model / min / max → <input> 的值 */
const toInput = (value: string | Date | null | undefined): string => {
  if (value === null || value === undefined || value === '') return ''
  if (props.mode === 'date') {
    if (typeof value === 'string' && DATE_RE.test(value.trim())) return value.trim()
    const date = value instanceof Date ? value : parseDateTime(value, zone.timeZone.value)
    return date ? zone.format(date, 'YYYY-MM-DD', { withZone: false }) : ''
  }
  const date = value instanceof Date ? value : parseDateTime(value, zone.timeZone.value)
  return date ? zone.toInputValue(date) : ''
}

const inputValue = computed(() => toInput(model.value))
const inputMin = computed(() => toInput(props.min) || undefined)
const inputMax = computed(() => toInput(props.max) || undefined)

const onInput = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value).trim()
  if (!text) {
    model.value = null
    return
  }
  if (props.mode === 'date') {
    if (DATE_RE.test(text)) model.value = text
    return
  }
  const date = zone.fromInputValue(text)
  if (date) model.value = zone.toOffsetIso(date)
}

/** 星期（按界面语言的简写；日期本身就是当地日期，按 UTC 算星期不会挪天） */
const weekdayText = computed(() => {
  if (!props.weekday || props.mode !== 'date') return ''
  const m = DATE_RE.exec(inputValue.value)
  if (!m) return ''
  try {
    return new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))
  } catch {
    return ''
  }
})
const zoneText = computed(() => (props.mode === 'datetime' && zone.differs.value ? zone.abbr.value : ''))
const suffix = computed(() => weekdayText.value || zoneText.value)
</script>

<template>
  <WInput v-bind="attrs" :id="id" class="w-date" :type="mode === 'date' ? 'date' : 'datetime-local'"
    :model-value="inputValue" :min="inputMin" :max="inputMax" :size="size" :invalid="invalid" :disabled="disabled"
    :readonly="readonly" :clearable="clearable" @update:model-value="onInput">
    <template v-if="suffix" #suffix>
      <span :title="zoneText ? zone.description.value : undefined">{{ suffix }}</span>
    </template>
  </WInput>
</template>

<style scoped>
/* 原生日期框的日历图标用弱化色，与输入框的后缀一致 */
.w-date :deep(input::-webkit-calendar-picker-indicator) {
  opacity: 0.55;
  cursor: pointer;
}
.w-date :deep(input::-webkit-calendar-picker-indicator:hover) { opacity: 0.9; }
.w-date :deep(input::-webkit-datetime-edit) { padding: 0; }
</style>
