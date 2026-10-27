<script setup lang="ts">
import { outboundDays } from '~/utils/outboundDays'
const props = defineProps<{ data: any }>()
const emit = defineEmits<{ 'select-date': [date: string] }>()
const { t } = useI18n()
const days = computed(() => outboundDays(props.data.start_date, props.data.end_date, props.data.daily || []))
const maxQuantity = computed(() => Math.max(2, ...days.value.map(day => day.actual)))
const rows = computed(() => Math.max(2, ...days.value.map(day => day.units.length + (day.documents > day.units.length ? 1 : 0))))
const unitTicks = computed(() => Array.from({length: rows.value}, (_, i) => i + 1).filter(n => rows.value <= 5 || n === 1 || n % 5 === 0))
const shown = ref(false)
const timing = (value: string) => t('document-report.' + (value === 'on_time' ? 'on-time' : value === 'late' ? 'late-shipment' : value))
const caption = (day: any) => `${day.date} · ${day.documents} ${t('document-report.documents')} · ${day.actual} ${t('document-report.actual')}`
const columns = computed(() => ['date', 'documents', 'actual'].map(key => ({ key, label: t('document-report.' + (key === 'date' ? 'actual-date' : key)), ...(key === 'date' ? {} : {type: 'qty' as const, keepZero: true}) })))
</script>
<template>
  <WCard class="outbound-daily" :title="t('document-report.daily')" :subtitle="t('document-report.daily-unit')">
    <template #actions><WButton variant="text" size="sm" @click="shown=!shown">{{t('document-report.'+(shown?'view-chart':'view-table'))}}</WButton></template>
    <p class="hint">{{t('document-report.daily-hint')}}</p>
    <WTable v-if="shown" :rows="days" :columns="columns" row-key="date"><template #cell-date="{row}"><button class="day-link" @click="emit('select-date',row.date)">{{row.date}}</button></template></WTable>
    <div v-else class="daily-layout">
      <div class="chart-scroll" tabindex="0" :aria-label="t('document-report.daily')">
        <div class="chart" :style="{'--days':days.length,'--height':(rows*20+24)+'px',minWidth:Math.max(580,days.length*24)+'px'}">
          <div class="chart-label">{{t('document-report.documents')}}</div>
          <div class="units-axis"><span v-for="n in unitTicks" :key="n" :style="{bottom:((n-1)*20)+'px'}">{{n}}</span></div>
          <div class="units-grid">
            <div v-for="day in days" :key="day.date" class="day" :class="{weekend:day.weekend}">
              <button class="day-hit" :aria-label="caption(day)" :title="caption(day)" @click="emit('select-date',day.date)"/>
              <NuxtLink v-for="unit in day.units" :key="unit.id" class="unit" :class="unit.timing" :to="'/dn/detail/'+unit.id" :aria-label="`DN-${unit.id} · ${timing(unit.timing)} · ${unit.actual}`" :title="`DN-${unit.id} · ${timing(unit.timing)} · ${unit.actual}`"/>
              <button v-if="day.documents>day.units.length" class="more" :aria-label="caption(day)" @click="emit('select-date',day.date)">+{{day.documents-day.units.length}}</button>
              <span v-if="day.date===data.today" class="today"><b>{{t('ledger.ranges.today')}}</b></span>
            </div>
          </div>
          <div class="chart-label quantity-label">{{t('document-report.actual')}}</div>
          <div class="quantity-axis"><span>{{maxQuantity}}</span><span>{{(maxQuantity/2).toLocaleString()}}</span><span>0</span></div>
          <div class="quantity-grid">
            <div v-for="day in days" :key="day.date" class="quantity-day"><button :style="{height:80*day.actual/maxQuantity+'px'}" :title="caption(day)" :aria-label="caption(day)" @click="emit('select-date',day.date)"/></div>
          </div>
          <div class="date-axis"><button v-for="(day,index) in days" :key="day.date" :title="day.date" @click="emit('select-date',day.date)"><span v-if="index%Math.max(1,Math.ceil(days.length/7))===0||index===days.length-1">{{day.date.slice(5).replace('-','/')}}</span></button></div>
        </div>
      </div>
      <dl><div v-for="key in ['documents','actual','on_time_rate']" :key="key"><dt>{{t('document-report.'+key)}}</dt><dd>{{data.summary[key]==null?'—':key==='on_time_rate'?(data.summary[key]*100).toFixed(1)+'%':Number(data.summary[key]).toLocaleString()}}</dd></div></dl>
    </div>
    <div class="legend"><span>{{t('document-report.on-time')}}</span><span>{{t('document-report.late-shipment')}}</span><span>{{t('document-report.unscheduled')}}</span></div>
  </WCard>
</template>
<style scoped>
.outbound-daily :deep(.w-card__header){padding:16px 24px 0}.outbound-daily :deep(.w-card__body){padding:12px 24px 20px}.hint{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--w-text-3)}.daily-layout{display:flex;flex-wrap:wrap;gap:24px;align-items:stretch}.chart-scroll{flex:999 1 600px;min-width:0;overflow:auto;padding-bottom:4px}.chart{display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:8px}.chart-label{grid-column:2;font-size:12px;line-height:18px;font-weight:500;padding-bottom:4px}.units-axis{position:relative;height:var(--height);font-size:12px;color:var(--w-text-3)}.units-axis span{position:absolute;right:0;line-height:18px}.units-grid,.quantity-grid,.date-axis{display:grid;grid-template-columns:repeat(var(--days),minmax(0,1fr))}.units-grid{height:var(--height);border-bottom:1px solid #CDD1DA}.day{position:relative;display:flex;flex-direction:column-reverse;align-items:center;gap:2px;padding-bottom:1px}.weekend{background:#F6F7FA}.day-hit{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.unit{position:relative;flex:none;width:18px;height:18px;border-radius:4px;background:#7855FE;z-index:1}.unit.late{background:#E99B1A}.unit.unscheduled{background:#CDD1DA}.unit:focus-visible,.more:focus-visible{outline:2px solid #151923;outline-offset:1px}.more{position:relative;border:0;background:white;font:inherit;font-size:10px;cursor:pointer;z-index:1}.today{position:absolute;left:50%;top:-6px;bottom:-132px;width:1px;background:#4C5261;pointer-events:none}.today b{position:absolute;top:0;right:6px;white-space:nowrap;font-size:12px;line-height:18px;color:#4C5261}.quantity-label{padding:14px 0 4px}.quantity-axis{height:84px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;font-size:12px;line-height:12px;color:var(--w-text-3)}.quantity-grid{height:84px;border-bottom:1px solid #CDD1DA;background:linear-gradient(#EDEFF3,#EDEFF3) 0 4px/100% 1px no-repeat,linear-gradient(#EDEFF3,#EDEFF3) 0 44px/100% 1px no-repeat}.quantity-day{display:flex;align-items:flex-end;justify-content:center}.quantity-day button{width:12px;min-height:0;padding:0;border:0;border-radius:4px 4px 0 0;background:#7855FE;cursor:pointer}.date-axis{grid-column:2;margin-top:4px;height:18px}.date-axis button{position:relative;border:0;padding:0;background:transparent;font:inherit;font-size:12px;color:var(--w-text-3);cursor:pointer}.date-axis span{position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap}.date-axis button:first-child span{left:0;transform:none}.date-axis button:last-child span{left:auto;right:0;transform:none}dl{flex:1 1 190px;margin:0;padding-left:24px;border-left:1px solid #EDEFF3;display:flex;flex-direction:column;gap:12px}dt{font-size:12px;line-height:18px;color:var(--w-text-3)}dd{margin:0;font-size:20px;line-height:28px;font-weight:600}.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:12px;line-height:18px;color:var(--w-text-2)}.legend span:before{content:'';display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:#7855FE}.legend span:nth-child(2):before{background:#E99B1A}.legend span:nth-child(3):before{background:#CDD1DA}.day-link{border:0;background:transparent;padding:0;font:inherit;color:var(--w-pri);cursor:pointer}@media(max-width:600px){dl{flex-direction:row;flex-wrap:wrap;padding:12px 0 0;border-left:0;border-top:1px solid #EDEFF3;gap:24px}}
</style>
