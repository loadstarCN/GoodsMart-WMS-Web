<script setup lang="ts">
import { ledgerDateRange } from '~/utils/ledgerDateRange'
const {t}=useI18n(),route=useRoute(),router=useRouter(),{bizErrorMessage}=useBizError()
const warehouse=useWarehouseStore()
const staff=useStaffStore()
const selectedGoods=ref<{value:number;label:string;description?:string}|null>(null)
const goodsError=ref('')
let goodsGeneration=0
const searchGoods=async(keyword:string)=>{
 goodsError.value=''
 const result=await httpRequest<PaginationData>('/api/warehouse/goods/',{params:{keyword,is_active:'all',per_page:30},onError:e=>{goodsError.value=bizErrorMessage(e)}})
 return (result?.items||[]).map((row:any)=>({value:row.id,label:row.name,description:row.code}))
}
const loadSelectedGoods=async()=>{
 const seq=++goodsGeneration;selectedGoods.value=null;goodsError.value=''
 const id=Number(route.query.goods_id)
 if(!id||!staff.hasPermission('goods_read'))return
 const row=await httpRequest<any>('/api/warehouse/goods/'+id,{onError:e=>{if(seq===goodsGeneration)goodsError.value=bizErrorMessage(e)}})
 if(seq===goodsGeneration&&row)selectedGoods.value={value:row.id,label:row.name,description:row.code}
}
const warehouseId=computed(()=>warehouse.currentWarehouse?.id||null)
const activeWarehouse=computed(()=>warehouse.warehouses.find(row=>row.id===warehouseId.value)||warehouse.currentWarehouse)
const data=ref<PaginationData|null>(null),loading=ref(true),busy=ref(false),error=ref(''),keyword=ref(String(route.query.keyword||''))
const movements=['opening','reconcile','sort_in','putaway','removal','transfer','pick','pack','pack_short_return','dn_cancel_return','ship','sign','adjust_gain','adjust_loss','lot_relabel','correction']
const range=ref(route.query.start_time||route.query.end_time?'custom':'month')
const timezone=computed(()=>activeWarehouse.value?.timezone||'UTC')
const effectiveFilters=computed(()=>({...ledgerDateRange('month',timezone.value),...Object.fromEntries(Object.entries(route.query).filter(([key,value])=>value!=null&&value!==''&&key!=='warehouse_id'))}))
const selectRange=(value:string|undefined)=>{if(!value)return;range.value=value;const dates=ledgerDateRange(value,timezone.value);if(dates)go(dates)}
let generation=0
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
const load=async()=>{const seq=++generation;data.value=null;loading.value=true;error.value='';const result=await httpRequest<PaginationData>('/api/warehouse/stock-ledger/',{params:{...effectiveFilters.value,movement_types:route.query.movement_types||route.query.movement_type,per_page:50},headers:warehouseHeaders(warehouseId.value),onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}});if(seq===generation){data.value=result;loading.value=false}}
const download=async()=>{busy.value=true;try{const params=new URLSearchParams(Object.entries(effectiveFilters.value).filter(([key,value])=>!['page','per_page'].includes(key)&&value!=null).map(([key,value])=>[key,String(value)]));if(params.has('movement_type')){if(!params.has('movement_types'))params.set('movement_types',params.get('movement_type')!);params.delete('movement_type')}await downloadFile('/api/warehouse/stock-ledger/export?'+params,{headers:warehouseHeaders(warehouseId.value)},'stock-ledger.csv')}catch(err){error.value=bizErrorMessage(err as HttpRequestError)}finally{busy.value=false}}
watch(()=>warehouse.currentWarehouse?.id,()=>{data.value=null;generation++;if(route.query.page&&Number(route.query.page)!==1)go({page:1},true);else load()})
watch(()=>route.query.goods_id,loadSelectedGoods)
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()});onMounted(()=>{load();loadSelectedGoods()});onBeforeUnmount(()=>{generation++;goodsGeneration++})
useHead({title:()=>t('ledger.title')})
</script>
<template><div class="w-ledger-page w-scope"><header><div><h1>{{t('nav.inventory')}}</h1><span>{{activeWarehouse?.name || t('ledger.all-warehouses')}} · {{t('ledger.title')}} {{data?.total}}</span></div><WButton icon="download" :loading="busy" @click="download">{{t('goods.ui.export')}}</WButton></header>
 <WTabs model-value="ledger" :label="t('nav.inventory')" :items="[{key:'balance',label:t('ledger.balances')},{key:'ledger',label:t('ledger.title')}]" @change="key=>key==='balance'&&router.push('/inventory')" />
 <WCard flush><form class="w-ledger-filters" @submit.prevent="go({keyword:keyword.trim()})"><div><WCombobox v-if="staff.hasPermission('goods_read')" class="ledger-goods" :model-value="Number(route.query.goods_id)||null" :selected-option="selectedGoods" :search="searchGoods" clearable :aria-label="t('nav.goods')" :placeholder="t('nav.goods')" @select="option=>{selectedGoods=option;go({goods_id:option?.value,goods_code:undefined,keyword:undefined})}"/><WInput v-model="keyword" type="search" :placeholder="t('ledger.search')" :aria-label="t('common.search')" @change="go({keyword:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput><WFilterSelect :model-value="String(route.query.movement_types||route.query.movement_type||'')||null" :label="t('ledger.movement')" :options="movements.map(value=>({value,label:t('ledger.movements.'+value)}))" @change="value=>go({movement_types:value,movement_type:null})" /><WInput :model-value="String(route.query.location_code||'')" :placeholder="t('location.fields.code')" :aria-label="t('location.fields.code')" @change="(event:Event)=>go({location_code:(event.target as HTMLInputElement).value})" /><WInput :model-value="String(route.query.lot_no||'')" :placeholder="t('goods-label.lot')" :aria-label="t('goods-label.lot')" @change="(event:Event)=>go({lot_no:(event.target as HTMLInputElement).value.trim()})" />
<WFilterSelect :model-value="String(route.query.stock_types||'')||null" :label="t('ledger.stock-type')" :options="['onhand','damaged','return','pending','pending_damaged','picked','packed','in_transit'].map(value=>({value,label:t('ledger.types.'+value)}))" @change="value=>go({stock_types:value})" />
<WFilterSelect :model-value="String(route.query.doc_type||'')||null" :label="t('ledger.document-type')" :options="['asn','dn','putaway','removal','transfer','picking_task','packing_task','adjustment'].map(value=>({value,label:t('ledger.documents.'+value)}))" @change="value=>go({doc_type:value})" />
<WInput :model-value="String(route.query.doc_no||'')" :placeholder="t('ledger.document')" :aria-label="t('ledger.document')" @change="(event:Event)=>go({doc_no:(event.target as HTMLInputElement).value.trim()})" />
</div><div><span>{{t('ledger.time')}}</span><WSegmented v-model="range" :label="t('ledger.time')" size="sm" :options="['today','week','month','previous','custom'].map(value=>({value,label:t('ledger.ranges.'+value)}))" @update:model-value="selectRange" /><WDatePicker :model-value="String(effectiveFilters.start_time||'')||null" :aria-label="t('ledger.from')" @update:model-value="value=>{range='custom';go({start_time:value})}" /><span>–</span><WDatePicker :model-value="String(effectiveFilters.end_time||'')||null" :aria-label="t('ledger.to')" @update:model-value="value=>{range='custom';go({end_time:value})}" /><span class="timezone">{{timezone}}</span><WButton variant="text" size="sm" @click="range='month';router.push('/inventory/ledger')">{{t('ledger.reset')}}</WButton></div></form></WCard>
 <WAlert v-if="goodsError" tone="warn" :title="goodsError"/><WAlert v-if="error" tone="block" :title="error" />
 <LedgerOverview :warehouse-id="warehouseId" :filters="effectiveFilters" />
 <WCard flush><StockLedgerTable :rows="data?.items||[]" :loading="loading" /><footer><WPagination :page="Number(route.query.page)||1" :page-size="50" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer></WCard>
</div></template>
<style scoped>
.w-ledger-page{display:flex;flex-direction:column;gap:16px}.ledger-goods{flex:1 1 320px;max-width:420px;min-width:0}.w-ledger-page header{flex-wrap:wrap;display:flex;justify-content:space-between;align-items:center;gap:12px}.w-ledger-page header>div{flex-wrap:wrap;display:flex;align-items:baseline;gap:12px}.w-ledger-page h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-ledger-page header span{font-size:13px;color:var(--w-text-2)}.w-ledger-filters{padding:16px 20px;display:flex;flex-direction:column;gap:12px}.w-ledger-filters>div{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;color:var(--w-text-2)}.w-ledger-filters :deep(.w-input){max-width:280px}.w-ledger-filters :deep(.w-segmented){max-width:100%;overflow-x:auto}.timezone{font-size:12px;color:var(--w-text-3)}.warehouse-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid var(--w-border);border-radius:6px;background:var(--w-bg);white-space:nowrap}.warehouse-chip strong{font-weight:600;color:var(--w-text-1)}.w-ledger-page :deep(.w-tabs){gap:8px}.w-ledger-page :deep(.w-tabs__tab){padding:0 8px}.w-ledger-page footer{padding:12px 20px;border-top:1px solid var(--w-border)}
</style>
