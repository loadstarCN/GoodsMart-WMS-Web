<script setup lang="ts">
import GoodsStockDistribution from './GoodsStockDistribution.vue'
import GoodsStockTrend from './GoodsStockTrend.vue'
import GoodsReplenishment from './GoodsReplenishment.vue'
import GoodsFlowDistribution from './GoodsFlowDistribution.vue'
import GoodsAgeLayers from './GoodsAgeLayers.vue'
const props = defineProps<{ goodsId: string | number }>()
const { t, locale } = useI18n(), warehouses = useWarehouseStore()
const { bizErrorMessage } = useBizError()
const data = ref<any>(null), loading = ref(false), error = ref('')
const thresholds=ref<{low:number;high:number}|null>(null)
const warehouseId = computed(() => warehouses.currentWarehouse?.id || null)
let generation = 0
const load = async () => {
  const seq = ++generation
  data.value = null; error.value = ''; loading.value = false;thresholds.value=null
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
const liveLayers=computed(()=>data.value?.lot_age_layers||data.value?.layers||[])
const unknownAge=computed(()=>data.value?.lot_age_layers?liveLayers.value.filter((row:any)=>row.age_days==null).reduce((sum:number,row:any)=>sum+row.quantity,0):data.value?.age_unknown)
const metric = computed(() => data.value?.latest_metrics)
const number = (value: any) => value == null ? '—' : Number(value).toLocaleString(locale.value, { maximumFractionDigits: 1 })
const cards = computed(() => [
  { label: 'out30', value: metric.value?.out_qty_30d },
  { label: 'out90', value: metric.value?.out_qty_90d },
  { label: 'turnover', value: metric.value?.turnover_days_30d, days: true },
  { label: 'supply', value: metric.value?.days_of_supply, days: true },
  { label: 'abc', text: metric.value?.abc_class || '—' },
  { label: 'average-age', value: metric.value?.weighted_age_days, days: true },
  { label: 'oldest-age', value: !unknownAge.value && liveLayers.value.length ? Math.max(...liveLayers.value.map((row: any) => row.age_days)) : null, days: true },
  { label: 'unknown-age', value: unknownAge.value },
])
const daily = computed(() => data.value?.daily || [])
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
        <GoodsStockTrend :days="daily" :goods-id="goodsId" :thresholds="thresholds" />
        <dl><div><dt>{{t('inventory-analysis.last-in')}}</dt><dd>{{metric?.last_in_at?$dayjs(metric.last_in_at,'YYYY-MM-DD',{warehouse_id:warehouseId}):'—'}}</dd></div><div><dt>{{t('inventory-analysis.last-out')}}</dt><dd>{{metric?.last_out_at?$dayjs(metric.last_out_at,'YYYY-MM-DD',{warehouse_id:warehouseId}):'—'}}</dd></div><div><dt>{{t('inventory-analysis.unknown-age')}}</dt><dd>{{number(unknownAge)}}</dd></div></dl>
      </div>
      <p>{{ t('inventory-analysis.hint') }}</p>
      <GoodsStockDistribution :rows="data.distribution||[]" :goods-id="Number(goodsId)" />
      <GoodsReplenishment :goods-id="Number(goodsId)" :warehouse-id="warehouseId" @loaded="row=>thresholds=row?{low:row.current_low,high:row.current_high}:null" />
      <GoodsFlowDistribution v-if="data.flow_distribution" :data="data.flow_distribution" />
      <GoodsAgeLayers :rules="data.lot_rules" :rows="liveLayers" :warehouse-id="warehouseId" :today="daily[daily.length-1]?.date||''" />
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
.w-goods-analytics__details { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; }
h3 { margin:0 0 8px; }
svg { display:block; width:100%; height:110px; overflow:visible; }
svg text { fill:var(--w-text-3); font-size:10px; font-family:var(--w-font); }
.w-goods-analytics__dates { display:flex; justify-content:space-between; font-size:12px; color:var(--w-text-3); }
dl { margin:0; } dl>div { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; padding:8px 0; border-top:1px solid var(--w-line); font-size:13px; line-height:20px; } dt { font-weight:400; color:var(--w-text-3); } dd { margin:0; }
p { margin:0; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-goods-analytics__layers { border-top:1px solid var(--w-line); padding-top:16px; }
@media(max-width:700px) { .w-goods-analytics__metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .w-goods-analytics__details { grid-template-columns:minmax(0,1fr); } }
</style>
