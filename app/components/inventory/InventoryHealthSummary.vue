<script setup lang="ts">
const props=defineProps<{warehouseId?:number|null}>()
const {t,locale}=useI18n(),{bizErrorMessage}=useBizError()
const metrics=ref<any>(null),expiry=ref<any>(null),error=ref(''),loading=ref(false)
let generation=0
const load=async()=>{
 const seq=++generation;metrics.value=null;expiry.value=null;error.value='';loading.value=false
 if(!props.warehouseId)return
 loading.value=true
 const onError=(e:any)=>{if(seq===generation)error.value=bizErrorMessage(e)}
 const results=await Promise.all([
  httpRequest<any>('/api/warehouse/inventory/metrics',{headers:warehouseHeaders(props.warehouseId),params:{per_page:1},onError}),
  httpRequest<any>('/api/warehouse/inventory/expiry',{headers:warehouseHeaders(props.warehouseId),params:{per_page:1},onError}),
 ])
 if(seq===generation){metrics.value=results[0];expiry.value=results[1];loading.value=false}
}
watch(()=>props.warehouseId,load,{immediate:true});onBeforeUnmount(()=>generation++)
const count=(value:any)=>value==null?'—':Number(value).toLocaleString(locale.value)
const rate=computed(()=>metrics.value?.metric_date&&metrics.value.summary.moving_rate!=null?Number(metrics.value.summary.moving_rate).toLocaleString(locale.value,{style:'percent',maximumFractionDigits:1}):'—')
</script>
<template><section class="health-summary"><header><span>{{t(warehouseId?'inventory-buckets.health-scope':'warehouse-scope.select-top')}}</span><WButton variant="text" size="sm" to="/reports/inventory">{{t('inventory-analysis.title')}} →</WButton></header><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="loading" @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><div v-if="warehouseId" class="health-values">
 <NuxtLink to="/reports/inventory"><span>{{t('inventory-analysis.moving-rate')}}</span><strong>{{rate}}</strong><small>{{t('inventory-analysis.asof')}} {{metrics?.metric_date||'—'}}</small></NuxtLink>
 <NuxtLink to="/reports/inventory?status=dead"><span>{{t('inventory-analysis.dead')}}</span><strong>{{count(metrics?.metric_date?metrics.summary.dead_sku:null)}}</strong><small>{{t('inventory-analysis.asof')}} {{metrics?.metric_date||'—'}}</small></NuxtLink>
 <NuxtLink to="/inventory/by-lot?status=warning"><span>{{t('expiry.warning')}}</span><strong>{{count(expiry?.summary?.warning)}}</strong><small>{{expiry?.as_of||'—'}} · {{t('pending-age.units')}}</small></NuxtLink>
 <NuxtLink to="/inventory/by-lot?status=blocked"><span>{{t('expiry.blocked')}}</span><strong>{{count(expiry?.summary?.blocked)}}</strong><small>{{expiry?.as_of||'—'}} · {{t('pending-age.units')}}</small></NuxtLink>
 </div></section></template>
<style scoped>.health-summary{border:1px solid var(--w-border);border-radius:10px;background:var(--w-surface);padding:12px 20px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;color:var(--w-text-3)}.health-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:8px}.health-values a{display:flex;flex-direction:column;gap:4px;color:var(--w-text-1);text-decoration:none;padding:8px;border-radius:6px}.health-values a:hover{background:var(--w-bg)}.health-values a:focus-visible{outline:2px solid var(--w-pri)}span,small{font-size:12px;line-height:18px;color:var(--w-text-3)}strong{font-size:20px;line-height:28px;font-weight:600}@media(max-width:600px){.health-values{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
