<script setup lang="ts">
const props=defineProps<{warehouseId:number|null;filters:Record<string,any>}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),page=ref(1)
let generation=0
const scope=computed(()=>Object.fromEntries(['goods_id','goods_code','keyword','lot_id','lot_no','location_id','location_code','stock_types','start_time','end_time','category','brand','category_missing','brand_missing'].filter(key=>props.filters[key]).map(key=>[key,props.filters[key]])))
const load=async()=>{
 const seq=++generation;data.value=null;error.value='';loading.value=false
 if(!props.warehouseId)return
 loading.value=true
 const result=await httpRequest<any>('/api/warehouse/stock-ledger/overview',{params:{...scope.value,page:page.value,per_page:20},headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){data.value=result;loading.value=false}
}
watch([scope,()=>props.warehouseId],()=>{if(page.value!==1)page.value=1;else load()},{deep:true})
watch(page,load);onMounted(load);onBeforeUnmount(()=>generation++)
const keys=['opening','inbound','outbound','closing']
const number=(value:number)=>Number(value).toLocaleString()
const columns=computed(()=>[...(!scope.value.goods_id?[{key:'goods',label:t('nav.goods'),wrap:true}]:[]),{key:'lot_no',label:t('goods-label.lot')},{key:'expiry_date',label:t('goods-label.expiry')},...keys.map(key=>({key,label:t('stock-report.'+key),type:'qty' as const,keepZero:true,strong:key==='closing'}))])
const chart=computed(()=>{
 const points=data.value?.series||[]
 if(!points.length)return null
 const values=points.map((p:any)=>Number(p.total)),min=Math.min(0,...values),max=Math.max(1,...values),span=max-min
 const coords=values.map((value:number,i:number)=>[points.length===1?150:i/(points.length-1)*300,140-(value-min)/span*130])
 return {line:coords.map((p:number[],i:number)=>(i?'L':'M')+p.join(' ')).join(' '),area:'M'+coords[0][0]+' 140 '+coords.map((p:number[])=>'L'+p.join(' ')).join(' ')+' L'+coords[coords.length-1][0]+' 140 Z',min,max,last:coords[coords.length-1],firstDate:points[0].date,lastDate:points[points.length-1].date,lastValue:values[values.length-1]}
})
</script>
<template>
<section class="w-ledger-overview" :aria-label="t('ledger.overview-title')">
 <header><h2>{{t('ledger.overview-title')}} <WHelp :text="t('ledger.overview-help')" /></h2><span v-if="data">{{$dayjs(data.start_time,'YYYY-MM-DD HH:mm',warehouseId)}} – {{$dayjs(data.end_time,'MM-DD HH:mm',warehouseId)}}</span></header>
 <WEmptyState v-if="!warehouseId" :title="t('common.validation.warehouse-required')" compact />
 <WAlert v-else-if="error" tone="block" :title="error" />
 <WEmptyState v-else-if="loading" :title="t('common.status.loading')" compact />
 <template v-else-if="data">
 <div class="content"><div class="breakdown">
  <div class="equation"><template v-for="(key,index) in keys" :key="key"><span v-if="index" class="operator" aria-hidden="true">{{['','+','−','='][index]}}</span><div><span>{{t('stock-report.'+key)}}</span><strong :class="{closing:key==='closing'}">{{number(data.totals[key])}}</strong></div></template></div>
  <WTable :rows="data.items" :columns="columns" :row-key="row=>row.goods_id+':'+row.lot_id"><template #cell-goods="{row}"><NuxtLink :to="'/goods/detail/'+row.goods_id">{{row.goods.name}}</NuxtLink><small>{{row.goods.code}}</small></template><template #cell-lot_no="{row}"><strong v-if="row.lot_no">{{row.lot_no}}</strong><span v-else class="no-lot">{{t('ledger.no-lot')}}</span></template></WTable>
  <WPagination v-if="data.total>20" v-model:page="page" :page-size="20" :total="data.total" show-total />
 </div><div v-if="chart" class="trend"><h3>{{t('ledger.trend')}} <small>{{t('ledger.day-end')}}</small></h3><div class="plot"><div class="y-axis"><span>{{number(chart.max)}}</span><span>{{number(chart.min)}}</span></div><svg viewBox="0 0 300 150" role="img" :aria-label="t('ledger.trend')+': '+number(chart.lastValue)" preserveAspectRatio="none"><path d="M0 10H300 M0 75H300 M0 140H300" stroke="#EDEFF3" fill="none"/><path :d="chart.area" fill="#7855FE" fill-opacity=".1"/><path :d="chart.line" stroke="#7855FE" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/><circle :cx="chart.last[0]" :cy="chart.last[1]" r="3" fill="#7855FE"/></svg></div><div class="x-axis"><span>{{chart.firstDate}}</span><span>{{chart.lastDate}}</span></div><span class="latest">{{number(chart.lastValue)}}</span></div></div>
 <p class="scope-note">{{t('ledger.overview-scope')}}</p>
 </template>
</section>
</template>
<style scoped>
.w-ledger-overview{padding:16px 24px 20px;border:1px solid var(--w-border);border-radius:10px;background:var(--w-surface);display:flex;flex-direction:column;gap:16px}header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}h2{display:flex;align-items:center;gap:6px;margin:0;font-size:16px;line-height:24px;font-weight:600}header>span{font-size:12px;line-height:18px;color:var(--w-text-3)}.content{display:flex;flex-wrap:wrap;gap:24px;align-items:stretch}.breakdown{flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:16px}.equation{display:flex;flex-wrap:wrap;align-items:flex-end;gap:4px 16px}.equation>div{display:flex;flex-direction:column}.equation>div>span{font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-2)}.equation strong{font-size:24px;line-height:32px;font-weight:600}.equation strong.closing{font-size:28px;line-height:36px}.operator{font-size:16px;line-height:32px;color:var(--w-text-3)}.trend{position:relative;flex:1 1 280px;min-width:0;padding-left:24px;border-left:1px solid var(--w-line)}h3{margin:0 0 8px;font-size:14px;line-height:22px;font-weight:600}small{font-size:12px;line-height:18px;color:var(--w-text-3);font-weight:400}.plot{display:flex;gap:8px}.plot svg{display:block;width:calc(100% - 36px);height:150px;overflow:visible}.y-axis{width:28px;display:flex;flex-direction:column;justify-content:space-between;padding:2px 0 0;font-size:12px;color:var(--w-text-3)}.x-axis{display:flex;justify-content:space-between;margin:4px 0 0 36px;font-size:12px;color:var(--w-text-3)}.latest{display:block;text-align:right;font-size:12px;font-weight:600}.scope-note{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}.breakdown :deep(table){min-width:500px}.breakdown :deep(th){height:auto;padding:0 8px 8px;line-height:16px}.breakdown :deep(td){height:auto;padding:8px}.breakdown :deep(th:first-child),.breakdown :deep(td:first-child){padding-left:0}.breakdown :deep(th:last-child),.breakdown :deep(td:last-child){padding-right:0}.breakdown small{display:block}.breakdown a{color:var(--w-text-1);text-decoration:none}.no-lot{font-size:12px;padding:1px 6px;border:1px solid var(--w-border);border-radius:6px;color:var(--w-text-2)}@media(max-width:900px){.trend{border-left:0;padding:16px 0 0;border-top:1px solid var(--w-line)}}
</style>
