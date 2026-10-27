<script setup lang="ts">
const props = defineProps<{ goodsId: string | number }>()
const { t, locale } = useI18n(), route = useRoute(), router = useRouter(), warehouses = useWarehouseStore()
const { $dayjs } = useNuxtApp()
const { bizErrorMessage } = useBizError()
const data = ref<any>(null), loading = ref(false), error = ref('')
const warehouseId = computed(() => warehouses.currentWarehouse?.id || null)
let generation = 0
const load = async () => {
  const seq = ++generation
  data.value = null; error.value = ''; loading.value = false
  if (!warehouseId.value) return
  loading.value = true
  const result = await httpRequest<any>('/api/warehouse/inventory/metrics/goods/' + props.goodsId, {
    params: { warehouse_id: warehouseId.value }, headers: warehouseHeaders(warehouseId.value),
    onError: err => { if (seq === generation) error.value = bizErrorMessage(err) },
  })
  if (seq === generation) { data.value = result; loading.value = false }
}
watch([warehouseId, () => props.goodsId], load)
onMounted(async () => { await warehouses.fetchWarehouses(); load() })
onBeforeUnmount(() => generation++)
const metric = computed(() => data.value?.latest_metrics)
const number = (value: any) => value == null ? '—' : Number(value).toLocaleString(locale.value, { maximumFractionDigits: 1 })
const cards = computed(() => [
  { label: 'out30', value: metric.value?.out_qty_30d },
  { label: 'out90', value: metric.value?.out_qty_90d },
  { label: 'turnover', value: metric.value?.turnover_days_30d, days: true },
  { label: 'supply', value: metric.value?.days_of_supply, days: true },
  { label: 'abc', text: metric.value?.abc_class || '—' },
  { label: 'average-age', value: metric.value?.weighted_age_days, days: true },
  { label: 'oldest-age', value: data.value?.layers?.length ? Math.max(...data.value.layers.map((row: any) => row.age_days)) : null, days: true },
  { label: 'unknown-age', value: data.value?.age_unknown },
])
const daily = computed(() => data.value?.daily || [])
const maximum = computed(() => Math.max(1, ...daily.value.map((row: any) => Number(row.stock))))
const points = computed(() => daily.value.map((row: any, index: number) => `${index * 600 / Math.max(1, daily.value.length - 1)},${90 - Number(row.stock) / maximum.value * 80}`).join(' '))
const columns = computed(() => [
  { key: 'in_at', label: t('inventory-analysis.inbound-date'), value: (row: any) => row.in_at ? $dayjs(row.in_at, 'YYYY-MM-DD HH:mm', { warehouse_id: warehouseId.value }) : '—' },
  { key: 'quantity', label: t('common.fields.quantity'), type: 'qty' as const, keepZero: true },
  { key: 'age_days', label: t('inventory-analysis.age-days'), type: 'qty' as const, keepZero: true },
])
</script>

<template>
  <section class="w-goods-analytics">
    <header><div><h2>{{ t('inventory-analysis.title') }}</h2><span v-if="metric">{{ t('inventory-analysis.asof') }} {{ metric.metric_date }}</span></div></header>
    <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{ t('dn.list.retry') }}</WButton></template></WAlert>
    <WEmptyState v-else-if="!warehouseId" :title="t('warehouse-scope.select-top')" />
    <WEmptyState v-else-if="loading" :title="t('common.status.loading')" />
    <template v-else-if="data">
      <WAlert v-if="!metric" tone="info" :title="t('inventory-analysis.no-snapshot')" />
      <div class="w-goods-analytics__metrics"><div v-for="card in cards" :key="card.label"><span>{{ t('inventory-analysis.'+card.label) }}</span><strong>{{ card.text ?? number(card.value) }}<small v-if="card.days && card.value!=null"> {{ t('inventory-analysis.days') }}</small></strong></div></div>
      <div class="w-goods-analytics__details">
        <div class="w-goods-analytics__trend"><h3>{{ t('inventory-analysis.stock90') }}</h3><svg viewBox="0 0 600 110" role="img" :aria-label="t('inventory-analysis.stock90')"><g v-for="tick in [0,.5,1]" :key="tick"><line x1="0" x2="600" :y1="90-tick*80" :y2="90-tick*80" stroke="#EDEFF3"/><text x="0" :y="86-tick*80">{{number(maximum*tick)}}</text></g><polygon v-if="daily.length" :points="'0,90 '+points+' 600,90'" fill="#7855FE" fill-opacity=".1"/><polyline :points="points" fill="none" stroke="#7855FE" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="w-goods-analytics__dates"><span>{{ daily[0]?.date }}</span><span>{{ daily[daily.length-1]?.date }}</span></div></div>
        <dl><div><dt>{{t('inventory-analysis.last-in')}}</dt><dd>{{metric?.last_in_at?$dayjs(metric.last_in_at,'YYYY-MM-DD',{warehouse_id:warehouseId}):'—'}}</dd></div><div><dt>{{t('inventory-analysis.last-out')}}</dt><dd>{{metric?.last_out_at?$dayjs(metric.last_out_at,'YYYY-MM-DD',{warehouse_id:warehouseId}):'—'}}</dd></div><div><dt>{{t('inventory-analysis.unknown-age')}}</dt><dd>{{number(data.age_unknown)}}</dd></div></dl>
      </div>
      <p>{{ t('inventory-analysis.hint') }}</p>
      <div class="w-goods-analytics__layers"><h3>{{t('inventory-analysis.layers')}}</h3><WTable :rows="data.layers" :columns="columns" /></div>
    </template>
  </section>
</template>

<style scoped>
.w-goods-analytics { display:flex; flex-direction:column; gap:16px; padding:16px 20px 20px; }
header,header>div { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
header { justify-content:space-between; gap:12px; }
header>.w-select { width:220px; }
h2 { margin:0; font-size:16px; line-height:24px; font-weight:600; }
header span { font-size:13px; line-height:20px; color:var(--w-text-3); }
.w-goods-analytics__metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.w-goods-analytics__metrics>div { display:flex; flex-direction:column; gap:2px; padding:12px 16px; border:1px solid var(--w-border); border-radius:10px; }
.w-goods-analytics__metrics span,h3 { font-size:12px; line-height:18px; font-weight:500; color:var(--w-text-2); }
.w-goods-analytics__metrics strong { font-size:16px; line-height:24px; font-weight:600; }
.w-goods-analytics__metrics small { font-size:12px; font-weight:400; }
.w-goods-analytics__details { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:24px; }
h3 { margin:0 0 8px; }
svg { display:block; width:100%; height:110px; overflow:visible; }
svg text { fill:var(--w-text-3); font-size:10px; font-family:var(--w-font); }
.w-goods-analytics__dates { display:flex; justify-content:space-between; font-size:12px; color:var(--w-text-3); }
dl { margin:0; } dl>div { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; padding:8px 0; border-top:1px solid var(--w-line); font-size:13px; line-height:20px; } dt { font-weight:400; color:var(--w-text-3); } dd { margin:0; }
p { margin:0; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-goods-analytics__layers { border-top:1px solid var(--w-line); padding-top:16px; }
@media(max-width:700px) { .w-goods-analytics__metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .w-goods-analytics__details { grid-template-columns:minmax(0,1fr); } }
</style>
