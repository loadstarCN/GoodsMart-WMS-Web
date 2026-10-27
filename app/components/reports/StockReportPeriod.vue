<script setup lang="ts">
import { ledgerDateRange } from '~/utils/ledgerDateRange'
const props = defineProps<{ start: string; end: string; timezone: string }>()
const emit = defineEmits<{ change: [value: { start_time: string; end_time: string }] }>()
const { t, locale } = useI18n()
const root = ref<HTMLDetailsElement>(), trigger = ref<HTMLElement>()
const draftStart = ref(''), draftEnd = ref(''), year = ref(new Date().getFullYear())
const today = computed(() => ledgerDateRange('today', props.timezone)!.end_time)
const presets = computed(() => ['month', 'previous'].map(key => ({ key, ...ledgerDateRange(key, props.timezone)! })))
const selected = computed(() => presets.value.find(p => p.start_time === props.start && p.end_time === props.end)?.key || 'custom')
const compact = (value: string) => value.slice(5).replace('-', '/')
const close = (focus = false) => { if (root.value) root.value.open = false; if (focus) trigger.value?.focus() }
const apply = (start_time: string, end_time: string) => { if (!start_time || !end_time || start_time > end_time || end_time > today.value) return; emit('change', { start_time, end_time }); close(true) }
const monthStart = (month: number) => `${year.value}-${String(month).padStart(2, '0')}-01`
const pickMonth = (month: number) => {
  const last = new Date(Date.UTC(year.value, month, 0)).toISOString().slice(0, 10)
  apply(monthStart(month), last > today.value ? today.value : last)
}
const monthLabel = (month: number) => new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)))
const opened = () => { if (root.value?.open) { draftStart.value = props.start; draftEnd.value = props.end; year.value = Number((props.start || today.value).slice(0, 4)) } }
const outside = (event: PointerEvent) => { if (!root.value?.contains(event.target as Node)) close() }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>
<template>
  <details ref="root" class="report-period" @toggle="opened" @keydown.esc.stop.prevent="close(true)">
    <summary ref="trigger" aria-haspopup="dialog"><WIcon name="calendar" :size="16"/><strong>{{ t('ledger.ranges.' + selected) }}</strong><span>{{ compact(start) }}–{{ compact(end) }}</span><WIcon name="chevron-down" :size="14"/></summary>
    <div class="period-panel" role="dialog" :aria-label="t('ledger.time')">
      <button v-for="preset in presets" :key="preset.key" type="button" class="preset" :aria-pressed="selected === preset.key" @click="apply(preset.start_time,preset.end_time)"><span class="check">{{selected===preset.key?'✓':''}}</span><span>{{t('ledger.ranges.'+preset.key)}}</span><small>{{compact(preset.start_time)}}–{{compact(preset.end_time)}}</small></button>
      <section><div class="year"><strong>{{t('stock-report.by-month')}}</strong><button type="button" :aria-label="t('stock-report.previous-year')" @click="year--"><WIcon name="chevron-left" :size="14"/></button><span>{{year}}</span><button type="button" :disabled="year>=Number(today.slice(0,4))" :aria-label="t('stock-report.next-year')" @click="year++"><WIcon name="chevron-right" :size="14"/></button></div><div class="months"><button v-for="month in 12" :key="month" type="button" :disabled="monthStart(month)>today" :aria-pressed="start===monthStart(month) && end.slice(0,7)===start.slice(0,7)" @click="pickMonth(month)">{{monthLabel(month)}}</button></div></section>
      <section><strong>{{t('ledger.ranges.custom')}}</strong><div class="custom-dates"><WDatePicker v-model="draftStart" size="sm" :max="draftEnd||today" :aria-label="t('stock-report.from')"/><span>–</span><WDatePicker v-model="draftEnd" size="sm" :min="draftStart" :max="today" :aria-label="t('stock-report.to')"/></div><WButton size="sm" :disabled="!draftStart||!draftEnd||draftStart>draftEnd||draftEnd>today" @click="apply(draftStart,draftEnd)">{{t('button.confirm')}}</WButton></section>
    </div>
  </details>
</template>
<style scoped>
.report-period{position:relative;font-size:14px;line-height:20px}.report-period summary{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px 0 12px;border:1px solid var(--w-border-strong,#CDD1DA);border-radius:6px;cursor:pointer;list-style:none;background:var(--w-surface)}summary::-webkit-details-marker{display:none}summary strong{font-weight:600}summary>span{color:var(--w-text-3)}.period-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:30;width:320px;max-width:calc(100vw - 64px);padding:6px;border:1px solid var(--w-border);border-radius:10px;background:var(--w-surface);box-shadow:0 8px 24px rgba(22,26,35,.12)}button{font:inherit;cursor:pointer;color:var(--w-text-1);background:transparent;border:0;border-radius:6px}button:disabled{cursor:default;color:var(--w-text-4,#CDD1DA)}button:hover:not(:disabled){background:var(--w-surface-2)}.preset{display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:8px;width:100%;height:36px;padding:0 10px;text-align:left}.preset[aria-pressed=true]{font-weight:600}.check{color:var(--w-primary,#5F1FE6)}small{font-size:13px;line-height:20px;font-weight:400;color:var(--w-text-3)}section{display:flex;flex-direction:column;gap:8px;margin-top:4px;padding:10px 10px 8px;border-top:1px solid var(--w-line);font-size:13px;line-height:20px}section strong{font-weight:500}.year{display:flex;align-items:center;gap:4px}.year strong{margin-right:auto}.year button{display:grid;place-items:center;width:24px;height:24px;padding:0}.months{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}.months button{height:28px;padding:0;border:1px solid transparent}.months button[aria-pressed=true]{border-color:var(--w-primary,#5F1FE6);color:var(--w-primary,#5F1FE6);font-weight:600}.custom-dates{display:flex;align-items:center;gap:6px}.custom-dates :deep(.w-date-picker){min-width:0;flex:1}.custom-dates :deep(input){min-width:0;width:100%}
</style>
