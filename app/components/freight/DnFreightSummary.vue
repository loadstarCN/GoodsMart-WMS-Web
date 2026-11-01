<script setup lang="ts">
const props=defineProps<{dnId:number;warehouseId:number;version:number;estimate:{amount:number;currency:string}|null}>()
const {t,locale}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const canRead=computed(()=>staff.refreshed&&!!staff.staffInfo&&staff.hasPermission('freight_read'))
const row=ref<any>(null),loading=ref(false),error=ref('')
let generation=0
const load=async()=>{
 const seq=++generation;row.value=null;error.value='';loading.value=false
 if(!canRead.value)return
 loading.value=true
 const result=await httpRequest<any>(`/api/warehouse/carrier/freight/dn/${props.dnId}`,{headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){row.value=result?.item||null;loading.value=false}
}
watch(()=>[props.dnId,props.warehouseId,props.version,canRead.value],load,{immediate:true})
onBeforeUnmount(()=>generation++)
const money=(value:any)=>value==null?'—':Number(value).toLocaleString(locale.value,{minimumFractionDigits:2,maximumFractionDigits:2})
const estimate=computed(()=>row.value?{amount:row.value.estimated_amount,currency:row.value.estimated_currency}:props.estimate)
</script>
<template>
 <WCard v-if="row||estimate||loading||error" class="dn-freight-summary" :heading-level="3" :title="t('dn.detail.aside.freight')">
  <WAlert v-if="error" tone="block" :title="error"><WButton size="sm" @click="load">{{t('freight.reload')}}</WButton></WAlert>
  <p v-if="loading">{{t('common.status.loading')}}</p>
  <dl v-else>
   <dt>{{t('freight.estimate')}}</dt><dd>{{money(estimate?.amount)}} {{estimate?.currency||''}}</dd>
   <template v-if="row">
    <dt>{{t('freight.amount')}}</dt><dd><div v-for="(amount,currency) in row.billed" :key="currency">{{money(amount)}} {{currency}}</div><span v-if="!Object.keys(row.billed).length">—</span></dd>
    <dt>{{t('freight.difference')}}</dt><dd>{{money(row.difference)}} <span v-if="row.difference!=null">{{row.estimated_currency}}</span></dd>
    <dt>{{t('freight.actual-weight')}}</dt><dd>{{row.actual_weight??'—'}} kg</dd>
   </template>
  </dl>
  <template v-if="row&&!loading">
   <WStatus :tone="row.state==='matched'||row.state==='accepted'?'ok':'warn'">{{t('freight.states.'+row.state)}}</WStatus>
   <div v-for="invoice in row.invoices" :key="invoice.id" class="invoice">
    <NuxtLink :to="'/freight/invoices/'+invoice.id">{{invoice.invoice_number}} · {{t('freight.states.'+invoice.status)}} →</NuxtLink>
    <small>{{t('freight.billed-weight')}}: {{row.billed_weights[invoice.id]??'—'}} kg</small>
   </div>
   <div v-for="(charges,currency) in row.charge_breakdown" :key="currency" class="charges"><small>{{t('freight-charges.hint')}}</small><dl><template v-for="(amount,name) in charges" :key="name"><dt>{{t('freight-charges.'+name)}}</dt><dd>{{money(amount)}} {{currency}}</dd></template></dl></div>
  </template>
  <NuxtLink v-if="canRead" :to="{path:'/reports/freight',query:row?{start_date:row.shipping_date,end_date:row.shipping_date}:undefined}">{{t('shell.nav.freight')}} →</NuxtLink>
 </WCard>
</template>
<style scoped>
.dn-freight-summary :deep(.w-card__body){display:flex;flex-direction:column;gap:12px}dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 12px;margin:0;font-size:13px;line-height:20px}dt{color:var(--w-text-3);font-weight:400}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}p,small{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}a{font-size:13px;line-height:20px;color:var(--w-pri);text-decoration:none;overflow-wrap:anywhere}.invoice,.charges{display:flex;flex-direction:column;gap:4px;padding-top:8px;border-top:1px solid var(--w-line)}
</style>
