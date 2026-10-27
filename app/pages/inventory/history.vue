<script setup lang="ts">
const {t}=useI18n(),route=useRoute(),router=useRouter(),warehouses=useWarehouseStore(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),busy=ref(false),keyword=ref(String(route.query.keyword||''))
const warehouseId=computed(()=>warehouses.currentWarehouse?.id||null)
const warehouse=computed(()=>warehouses.warehouses.find(row=>row.id===warehouseId.value))
const today=computed(()=>new Intl.DateTimeFormat('en-CA',{timeZone:warehouse.value?.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
const date=computed(()=>String(route.query.date||today.value))
const params=computed(()=>({...route.query,date:date.value,warehouse_id:warehouseId.value,per_page:50}))
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{const seq=++generation;data.value=null;error.value='';loading.value=false;if(!warehouseId.value)return;loading.value=true;const result=await httpRequest<any>('/api/warehouse/inventory/history',{params:params.value,headers:warehouseHeaders(warehouseId.value),onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}});if(seq===generation){data.value=result;loading.value=false}}
const download=async()=>{if(!warehouseId.value||busy.value)return;busy.value=true;try{const query=new URLSearchParams(Object.entries(params.value).filter(([key,value])=>!['page','per_page'].includes(key)&&value!=null).map(([key,value])=>[key,String(value)]));await downloadFile('/api/warehouse/inventory/history/export?'+query,{headers:warehouseHeaders(warehouseId.value)},'stock-'+date.value+'.csv')}catch(err){error.value=bizErrorMessage(err as HttpRequestError)}finally{busy.value=false}}
watch(warehouseId,load)
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()});onMounted(async()=>{await warehouses.fetchWarehouses();load()});onBeforeUnmount(()=>generation++)
const types=['onhand','damaged','return','pending','pending_damaged','picked','packed','in_transit']
const columns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},...types.map(key=>({key,label:t('ledger.types.'+key),type:'qty' as const})),{key:'total',label:t('inventory.history.total'),type:'qty' as const,strong:true,keepZero:true}])
useHead({title:()=>t('inventory.views.history')})
</script>
<template><div class="w-stock-history w-scope"><header><h1>{{t('nav.inventory')}}</h1><WButton icon="download" :disabled="!data" :loading="busy" @click="download">{{t('goods.ui.export')}}</WButton></header><InventoryViewNav active="/inventory/history" />
 <WCard flush><form class="w-history-filters" @submit.prevent="go({keyword:keyword.trim()})"><WField :label="t('inventory.history.date')"><WDatePicker :model-value="date" :max="today" @update:model-value="value=>go({date:value})" /></WField><WField :label="t('common.search')"><WInput v-model="keyword" type="search" :placeholder="t('ledger.search')" @change="go({keyword:keyword.trim()})" /></WField></form></WCard>
 <WAlert v-if="error" tone="block" :title="error" /><WAlert v-if="data&&data.coverage!=='full'" tone="warn" :title="t('inventory.history.'+(data.coverage==='on_shelf_only'?'partial':'none'))" />
 <WCard flush><WEmptyState v-if="!warehouseId" :title="t('warehouse-scope.select-top')" /><template v-else><WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset><template #cell-goods="{row}"><NuxtLink class="w-history-link" :to="'/goods/detail/'+row.goods?.id">{{row.goods?.name}}</NuxtLink><span class="w-history-sub">{{row.goods?.code}}</span></template></WTable><footer><span>{{t('inventory.history.source')}}: {{data?t('inventory.history.sources.'+data.source):'—'}}</span><WPagination :page="Number(route.query.page)||1" :page-size="50" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer></template></WCard>
</div></template>
<style scoped>
.w-stock-history{display:flex;flex-direction:column;gap:16px}.w-stock-history header{display:flex;justify-content:space-between;align-items:center;gap:12px}.w-stock-history h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-history-filters{padding:16px 20px;display:grid;grid-template-columns:200px minmax(200px,1fr);gap:12px 16px}.w-stock-history :deep(.w-table){min-width:1100px;border-collapse:collapse}.w-stock-history :deep(.w-table thead th){height:auto;padding-top:12px;padding-bottom:8px;line-height:18px}.w-stock-history :deep(.w-table tbody td){padding-top:12px;padding-bottom:12px}.w-history-link{color:var(--w-text-1);font-weight:500}.w-history-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.w-stock-history footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-top:1px solid var(--w-border);font-size:12px;color:var(--w-text-3)}@media(max-width:767px){.w-history-filters{grid-template-columns:minmax(0,1fr)}}
</style>
