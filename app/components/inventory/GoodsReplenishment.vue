<script setup lang="ts">
const props=defineProps<{goodsId:number;warehouseId:number}>()
const emit=defineEmits<{loaded:[row:any]}>()
const {t,locale}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const row=ref<any>(null),error=ref(''),loading=ref(false),open=ref(false)
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';row.value=null;emit('loaded',null)
 const result=await httpRequest<any>('/api/warehouse/inventory/thresholds/suggest',{params:{goods_ids:String(props.goodsId)},headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){row.value=result?.items?.[0]||null;loading.value=false;emit('loaded',row.value)}
}
const n=(value:any)=>value==null?'—':Number(value).toLocaleString(locale.value,{maximumFractionDigits:3})
watch(()=>[props.goodsId,props.warehouseId],()=>{open.value=false;load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template><section class="goods-replenishment"><header><h3>{{t('goods-trend.replenishment')}}</h3><WButton v-if="staff.hasPermission('inventory_edit')" size="sm" :disabled="loading||!row" @click="open=true">{{t('inventory.ui.thresholds')}}</WButton></header>
<WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><WEmptyState v-else-if="loading" :title="t('common.status.loading')"/>
<template v-else-if="row"><p>{{t('goods-trend.replenishment-hint',{average:n(row.avg_daily_out),available:n(row.available_stock_for_sale)})}}</p><table><thead><tr><th>{{t('inventory.ui.thresholds')}}</th><th>{{t('goods-trend.current')}}</th><th>{{t('goods-trend.suggested')}}</th></tr></thead><tbody><tr v-for="kind in ['low','high']" :key="kind"><th>{{t('inventory.ui.'+kind)}}</th><td>{{row['current_'+kind]<0?'—':n(row['current_'+kind])}}</td><td>{{n(row['suggested_'+kind])}}</td></tr></tbody></table><p v-if="row.suggested_low==null">{{t('threshold.no-outbound')}}</p><template v-else><p>{{t('goods-trend.formula')}}</p><p>{{t('goods-trend.replenishment-quantity',{incoming:n(row.incoming_stock),quantity:n(row.suggested_replenishment)})}}</p></template></template>
<ThresholdEditor v-model:open="open" :warehouse-id="warehouseId" :goods-ids="[goodsId]" @saved="load"/></section></template>
<style scoped>
.goods-replenishment{border-top:1px solid var(--w-line);padding-top:16px;display:flex;flex-direction:column;gap:12px}header{display:flex;justify-content:space-between;gap:12px;align-items:center}h3{margin:0;font-size:16px;line-height:24px;font-weight:600}p{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:right;padding:10px 12px;border-bottom:1px solid var(--w-line)}th:first-child{text-align:left}th{font-weight:500;color:var(--w-text-2)}
</style>
