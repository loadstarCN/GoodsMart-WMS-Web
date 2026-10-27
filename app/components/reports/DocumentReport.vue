<script setup lang="ts">
import InboundDifferences from './InboundDifferences.vue'
import OutboundFreight from './OutboundFreight.vue'
import CountAccuracy from './CountAccuracy.vue'
import InboundSpecCoverage from './InboundSpecCoverage.vue'
import OutboundDailyChart from './OutboundDailyChart.vue'
import OutboundDistribution from './OutboundDistribution.vue'
import OutboundLeadTime from './OutboundLeadTime.vue'
import OutboundOnTime from './OutboundOnTime.vue'
import {asnTypesOptions,dnTypesOptions} from '~/data/selectOptions'
const {translateOption}=useOptionLabel()
const documentType=ref<string|null>(null)
const supplierId=ref<number|null>(null)
const suppliers=ref<{value:number;label:string}[]>([])
const supplierError=ref('')
const loadSuppliers=async()=>{
 if(props.kind!=='asn'||!staff.hasPermission('supplier_read'))return
 supplierError.value=''
 const options:{value:number;label:string}[]=[]
 for(const is_active of [true,false]){
  let optionPage=1
  while(true){
   const result=await httpRequest<PaginationData>('/api/warehouse/supplier/',{params:{is_active,page:optionPage,per_page:100},onError:e=>{supplierError.value=bizErrorMessage(e)}})
   if(!result)return
   options.push(...result.items.map((row:any)=>({value:row.id,label:row.name})))
   if(optionPage>=result.pages)break
   optionPage++
  }
 }
 suppliers.value=options
}
const supplierParams=computed(()=>{const params:Record<string,string>={};if(props.kind==='asn'&&supplierId.value)params.supplier_id=String(supplierId.value);return params})
const distributionFilter=ref<{dimension:string;value:string;label:string}|null>(null)
const distributionParams=computed(()=>{const params:Record<string,string>={};if(distributionFilter.value){params.distribution_dimension=distributionFilter.value.dimension;params.distribution_value=distributionFilter.value.value}return params})
const props=defineProps<{kind:'asn'|'dn'}>()
const {t}=useI18n(),staff=useStaffStore(),store=useWarehouseStore(),{bizErrorMessage}=useBizError()
const warehouseId=computed(()=>store.currentWarehouse?.id||null)
const start=ref(''),end=ref(''),page=ref(1),data=ref<any>(null),loading=ref(false),error=ref('')
const compare=ref(true),exporting=ref(false)
const download=async()=>{
 if(!data.value||exporting.value)return
 exporting.value=true;error.value=''
 try{await downloadFile(`/api/warehouse/${props.kind}/report/export?`+new URLSearchParams({...distributionParams.value,...supplierParams.value,start_date:data.value.start_date,end_date:data.value.end_date,...(documentType.value?{[props.kind+'_type']:documentType.value}:{})}),{headers:warehouseHeaders(warehouseId.value)},props.kind+'-report.csv')}
 catch(e){error.value=bizErrorMessage(e as HttpRequestError)}finally{exporting.value=false}
}
const inbound=computed(()=>props.kind==='asn')
const title=computed(()=>t('document-report.'+(inbound.value?'inbound':'outbound')))
let generation=0
const load=async()=>{const seq=++generation;data.value=null;error.value='';loading.value=false;if(!warehouseId.value)return;loading.value=true;const result=await httpRequest<any>(`/api/warehouse/${props.kind}/report`,{params:{...distributionParams.value,...supplierParams.value,[props.kind+'_type']:documentType.value||undefined,warehouse_id:warehouseId.value,start_date:start.value||undefined,end_date:end.value||undefined,page:page.value,per_page:50},headers:warehouseHeaders(warehouseId.value),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq===generation){data.value=result;loading.value=false;if(result){start.value=result.start_date;end.value=result.end_date}}}
const search=()=>{page.value=1;load()}
const metricKeys=computed(()=>inbound.value?['documents','actual','on_time_rate','difference_rate','damage','expected']:['documents','actual','on_time_rate','expected','received','difference'])
const number=(value:any,key='')=>value==null?'—':key.endsWith('_rate')?`${(Number(value)*100).toFixed(1)}%`:Number(value).toLocaleString()
const day=(value:string)=>Date.parse(value+'T00:00:00Z')/86400000
const timeline=computed(()=>data.value?reportTimeline(data.value.start_date,data.value.end_date,data.value.today,data.value.items):null)
const x=(value:string)=>timeline.value?`${(day(value)-timeline.value.min)/(timeline.value.max-timeline.value.min)*100}%`:'0%'
const isLate=(row:any)=>(row.actual_date||data.value.today)>row.planned
const line=(row:any)=>({left:x(row.planned),width:`${Math.abs(parseFloat(x(row.actual_date||data.value.today))-parseFloat(x(row.planned)))}%`})
const columns=computed(()=>[{key:'id',label:t('document-report.document')},{key:'planned',label:t('document-report.planned')},{key:'actual_date',label:t('document-report.actual-date')},...['expected','actual','damage','difference'].filter(key=>inbound.value||key!=='damage').map(key=>({key,label:t('document-report.'+key),type:'qty' as const,keepZero:true}))])
watch(warehouseId,()=>{distributionFilter.value=null;search()})
onMounted(async()=>{await store.fetchWarehouses();load();loadSuppliers()})
onBeforeUnmount(()=>generation++)
useHead({title:()=>title.value})
</script>
<template><div class="w-document-report w-scope"><header class="report-heading"><div><p>{{t('document-report.scope-'+kind)}}<template v-if="data"> · {{data.timezone}}</template></p><h1>{{title}}</h1></div><WButton icon="download" :loading="exporting" :disabled="!data||loading" @click="download">{{t('goods.ui.export')}}</WButton></header>
<form class="filters" @submit.prevent="search"><StockReportPeriod v-if="start&&end" :start="start" :end="end" :timezone="data?.timezone||store.currentWarehouse?.timezone||'UTC'" @change="value=>{start=value.start_time;end=value.end_time;search()}"/><label v-if="data" class="compare-toggle"><input v-model="compare" type="checkbox"/>{{t('document-report.previous')}} <span>{{data.previous_start}} – {{data.previous_end}}</span></label><WFilterSelect v-if="inbound&&warehouseId&&staff.hasPermission('supplier_read')" v-model="supplierId" :options="suppliers" :label="t('common.entities.supplier')" @change="search"/><WFilterSelect v-if="warehouseId" v-model="documentType" :label="t('common.fields.type')" :options="(inbound?asnTypesOptions:dnTypesOptions).map(value=>({value,label:translateOption(value,kind+'.type')}))" @change="search"/><WButton v-if="distributionFilter" variant="text" size="sm" @click="distributionFilter=null;search()">{{distributionFilter.label}} ×</WButton></form>
<WAlert v-if="supplierError" tone="block" :title="supplierError"><template #actions><WButton @click="loadSuppliers">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-if="error" tone="block" :title="error"/><WEmptyState v-if="!warehouseId" :title="t('warehouse-scope.select-top')"/>
<template v-if="data"><div class="metrics"><WCard v-for="key in metricKeys" :key="key"><span>{{t('document-report.'+key)}}</span><strong>{{number(data.summary[key],key)}}</strong><small v-if="compare">{{t('document-report.previous')}} {{number(data.previous[key],key)}}</small></WCard></div>
<p v-if="compare" class="comparison">{{t('document-report.previous')}}: {{data.previous_start}} — {{data.previous_end}}</p>
<WCard v-if="inbound" :title="t('document-report.arrivals')" :subtitle="t('document-report.arrival-hint')"><WEmptyState v-if="!data.items.length" :title="t('w.table.empty')"/><div v-else class="arrival-scroll"><div class="arrival-grid"><NuxtLink v-for="row in data.items" :key="row.id" class="w-arrival" :to="`/asn/detail/${row.id}`"><span class="document">ASN-{{row.id}}<small>{{row.planned}}</small></span><span class="track" :class="{'is-late':isLate(row)}"><i class="today-line" :style="{left:x(data.today)}"/><i v-if="isLate(row)" class="late-line" :style="line(row)"/><i class="planned" :style="{left:x(row.planned)}"/><i class="actual" :class="{'is-missing':!row.actual_date}" :style="{left:x(row.actual_date||data.today)}"/></span><span class="result">{{row.actual_date?t('document-report.'+(isLate(row)?'late':'on-time')):t('document-report.waiting')}}<small>{{number(row.actual)}} / {{number(row.expected)}}</small></span></NuxtLink><div class="axis"><time v-for="tick in timeline?.ticks||[]" :key="tick.date" :datetime="tick.date" :style="{left:tick.percent+'%'}">{{tick.date.slice(5).replace('-','/')}}</time></div></div></div></WCard>
<OutboundDailyChart v-if="!inbound" :data="data" @select-date="value=>{start=value;end=value;search()}"/>
<OutboundLeadTime v-if="!inbound" :data="data" :compare="compare"/>
<OutboundDistribution v-if="!inbound" :data="data" :compare="compare" @select="value=>{distributionFilter=value;search()}"/>
<div v-if="!inbound" class="outbound-finishing"><OutboundOnTime :data="data"/><OutboundFreight :data="data" :compare="compare"/></div>
<InboundDifferences v-if="inbound&&data.receipt_differences" :data="data.receipt_differences" :previous="data.previous_receipt_differences" :compare="compare"/><div v-if="inbound" class="inbound-quality" :class="{single:!staff.hasPermission('cycle_count_read')}"><InboundSpecCoverage v-if="data.spec_coverage" :data="data.spec_coverage"/><CountAccuracy v-if="warehouseId&&staff.hasPermission('cycle_count_read')" :warehouse-id="warehouseId" :start="data.start_date" :end="data.end_date"/></div><WCard :title="t('document-report.details')" flush><WTable :rows="data.items" :columns="columns" :loading="loading" inset><template #cell-id="{row}"><NuxtLink class="w-report-link" :to="`/${kind}/detail/${row.id}`">{{kind.toUpperCase()}}-{{row.id}}</NuxtLink></template><template #cell-actual_date="{row}">{{row.actual_date||'—'}}</template></WTable><template #footer><WPagination :page="page" :page-size="50" :total="data.total" show-total @update:page="value=>{page=value;load()}"/></template></WCard></template></div></template>
<style scoped>
.w-document-report{display:flex;flex-direction:column;gap:16px}header p,.comparison{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0}h1{font-size:24px;line-height:32px;font-weight:600;margin:4px 0 0}.filters{display:flex;flex-wrap:wrap;align-items:end;gap:8px}.filters>.w-field{min-width:160px}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}.metrics :deep(.w-card__body){padding:16px;display:flex;flex-direction:column;gap:2px}.metrics span{font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-2)}.metrics strong{font-size:20px;line-height:28px;font-weight:600}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.arrival-scroll{overflow:auto}.arrival-grid{min-width:580px}.w-arrival{display:grid;grid-template-columns:120px minmax(240px,1fr) 150px;gap:16px;color:var(--w-text-1);text-decoration:none;padding:4px 0;border-bottom:1px solid var(--w-line)}.document{font-size:13px;font-weight:500;line-height:20px}.track{position:relative;min-height:36px}.track i{position:absolute;top:18px}.planned{width:10px;height:10px;border:2px solid #4c5261;border-radius:50%;background:white;transform:translate(-50%,-50%);z-index:2}.actual{width:12px;height:12px;border:2px solid white;background:#7567e8;box-shadow:0 0 0 1px #7567e8;border-radius:50%;transform:translate(-50%,-50%);z-index:3}.is-late .actual{background:#e99b1a;box-shadow:0 0 0 1px #e99b1a}.actual.is-missing{border-radius:0;clip-path:polygon(0 0,100% 50%,0 100%);box-shadow:none}.late-line{height:2px;background:#e99b1a;transform:translateY(-50%)}.result{text-align:right;font-size:12px;line-height:18px}.axis{position:relative;height:24px;margin:8px 166px 0 136px;border-top:1px solid var(--w-border);display:flex;justify-content:space-between;font-size:12px;color:var(--w-text-3)}.axis time{position:absolute;top:4px;transform:translateX(-50%);white-space:nowrap}.axis time:first-child{transform:none}.axis time:last-child{transform:translateX(-100%)}.w-report-link{color:var(--w-pri);text-decoration:none}.w-document-report :deep(.w-table){min-width:740px}@media(max-width:1100px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.filters>.w-field{flex:1 1 100%}}
.compare-toggle{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:36px;padding:0 12px;border:1px solid var(--w-border);border-radius:6px;background:var(--w-surface);font-size:14px;line-height:20px}.compare-toggle input{width:16px;height:16px;accent-color:var(--w-pri)}.compare-toggle span{font-size:12px;color:var(--w-text-3)}.today-line{top:0!important;bottom:0;width:1px;background:var(--w-text-2)}.daily-list{display:flex;flex-direction:column;gap:0}.daily-row{display:grid;grid-template-columns:96px minmax(0,1fr) 44px 72px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--w-line);font-size:13px;line-height:20px}.daily-row strong,.daily-row>span{text-align:right;font-weight:500}.daily-track{display:flex;height:16px;background:var(--w-surface-2)}.daily-track i{background:#7855FE}.daily-track .late{background:#E99B1A}.daily-track .unscheduled{background:#CDD1DA}.daily-legend{display:flex;gap:16px;flex-wrap:wrap;padding-top:12px;font-size:12px;color:var(--w-text-2)}.daily-legend span:before{content:'';display:inline-block;width:8px;height:8px;background:#7855FE;margin-right:6px}.daily-legend span:nth-child(2):before{background:#E99B1A}.daily-legend span:nth-child(3):before{background:#CDD1DA}.daily-card :deep(.w-card__body){padding:16px 24px 20px}
.outbound-finishing{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}@media(max-width:1100px){.outbound-finishing{grid-template-columns:minmax(0,1fr)}}.report-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;flex-wrap:wrap}.inbound-quality{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px;align-items:stretch}.inbound-quality.single{grid-template-columns:minmax(0,1fr)}@media(max-width:1100px){.inbound-quality{grid-template-columns:minmax(0,1fr)}}
</style>
