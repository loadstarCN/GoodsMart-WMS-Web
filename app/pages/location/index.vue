<script setup lang="ts">
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staff=useStaffStore(),warehouse=useWarehouseStore(),{bizErrorMessage}=useBizError()
useHead({title:()=>t('nav.location')})
const keyword=ref(String(route.query.code||'')),data=ref<PaginationData|null>(null),loading=ref(false),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),summaries=ref<Record<number,any>>({})
const zones=ref<{zone:string;active:number;inactive:number}[]>([])
const zoneError=ref('')
const active=computed(()=>route.query.is_active==='false'?'false':'true'),page=computed(()=>Math.max(1,Number(route.query.page)||1))
const tabs=computed(()=>[{key:'true',label:t('recipient.ui.enable'),count:counts.value.true},{key:'false',label:t('recipient.ui.disable'),count:counts.value.false}])
const {locationTypeLabel}=useOptionLabel()
const types=computed(()=>['standard','damaged','return'].map(value=>({value,label:locationTypeLabel(value)})))
const columns=computed(()=>[{key:'code',label:t('location.fields.code')},{key:'location_type',label:t('location.fields.location-type'),format:locationTypeLabel},{key:'status',label:t('common.fields.status')},...(staff.hasPermission('inventory_read')?[{key:'goods',label:t('nav.goods'),align:'right' as const},{key:'volume',label:t('location.ui.utilization')}]:[]),{key:'updated_at',label:t('common.dates.updated')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';summaries.value={};counts.value={};data.value=null;zones.value=[];zoneError.value=''
 const params={...route.query,warehouse_id:warehouse.currentWarehouse?.id,is_active:active.value,per_page:20,page:page.value};const headers=warehouseHeaders(warehouse.currentWarehouse?.id)
 const [result,other,zoneResult]=await Promise.all([httpRequest<PaginationData>('/api/warehouse/location/',{params,headers,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/location/',{headers,params:{...params,is_active:active.value==='true'?'false':'true',per_page:1,page:1}}),httpRequest<{items:{zone:string;active:number;inactive:number}[]}>('/api/warehouse/location/zones',{params:{warehouse_id:warehouse.currentWarehouse?.id},headers,onError:e=>{if(seq===generation)zoneError.value=bizErrorMessage(e)}})])
 if(seq!==generation)return
 data.value=result;zones.value=zoneResult?.items||[];loading.value=false
 if(result)counts.value[active.value]=result.total
 if(other)counts.value[active.value==='true'?'false':'true']=other.total
 if(result?.items.length&&staff.hasPermission('inventory_read'))await Promise.all(result.items.map(async row=>{
  const summary=await httpRequest<any>('/api/warehouse/inventory/by-location',{params:{location_id:row.id,include_inactive:true},headers:warehouseHeaders(row.warehouse_id)})
  if(seq===generation&&summary?.items[0])summaries.value[row.id]=summary.items[0]
 }))
}
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value)return
 busy.value=true
 try{
  if(action==='delete'&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.code}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/location/'+row.id,{headers:warehouseHeaders(row.warehouse_id),method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){showToast(t('action-results.success'),'success');await load()}
 }finally{busy.value=false}
}
watch(()=>warehouse.currentWarehouse?.id,()=>{data.value=null;summaries.value={};if(route.query.zone||route.query.warehouse_id||(route.query.page&&Number(route.query.page)!==1))go({page:1,warehouse_id:undefined,zone:undefined},true);else load()});watch(()=>route.query,()=>{keyword.value=String(route.query.code||'');load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-location-list w-scope">
  <header><div><h1>{{t('nav.location')}}</h1><span>{{data?.total?.toLocaleString(locale)}}</span></div><WButton v-if="staff.hasPermission('location_edit')" variant="primary" icon="plus" to="/location/add">{{t('location.ui.create')}}</WButton></header>
  <div class="location-grid"><nav class="zone-nav" :aria-label="t('location-zones.title')"><h2>{{t('location-zones.title')}}<WHelp :text="t('location-zones.help')"/></h2><button type="button" :class="{selected:!route.query.zone}" @click="go({zone:undefined})"><span>{{t('location-zones.all')}}</span><span>{{zones.reduce((total,row)=>total+(active==='true'?row.active:row.inactive),0)}}</span></button><button v-for="zone in zones" :key="zone.zone" type="button" :class="{selected:route.query.zone===zone.zone}" :aria-pressed="route.query.zone===zone.zone" @click="go({zone:zone.zone})"><span>{{zone.zone}}</span><span>{{active==='true'?zone.active:zone.inactive}}</span></button><WAlert v-if="zoneError" tone="warn" :title="zoneError"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert></nav><WCard flush><WTabs inset :model-value="active" :items="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" />
   <form class="w-location-list__filters" @submit.prevent="go({code:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('location.fields.code')" :aria-label="t('common.search')" @change="go({code:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput><WFilterSelect :model-value="String(route.query.location_type||'')||null" :label="t('location.fields.location-type')" :options="types" @change="value=>go({location_type:value})" /></form>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset><template #head-actions><span class="w-sr-only">{{t('common.fields.action')}}</span></template>
    <template #cell-code="{row}"><NuxtLink class="w-location-list__name" :to="'/location/detail/'+row.id">{{row.code}}</NuxtLink><span class="w-location-list__sub">{{warehouse.warehouses.find(w=>w.id===row.warehouse_id)?.name||row.warehouse_name||'—'}}</span></template>
    <template #cell-status="{row}"><WStatus muted :tone="row.is_active?'ok':'none'">{{t(row.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus></template>
    <template #cell-goods="{row}"><strong v-if="summaries[row.id]">{{summaries[row.id].quantity.toLocaleString(locale)}}</strong><span v-if="summaries[row.id]" class="w-location-list__sub">{{t('warehouse.ui.goods-count',{count:summaries[row.id].goods_count})}}</span></template>
    <template #cell-volume="{row}"><div v-if="summaries[row.id]?.volume_utilization!=null" class="w-location-utilization"><progress :value="summaries[row.id].volume_utilization" max="1" /><span>{{Math.round(summaries[row.id].volume_utilization*100)}}%</span></div><span v-else class="w-location-list__sub">—</span></template>
    <template #cell-updated_at="{row}">{{$dayjs(row.updated_at)}}</template>
    <template #cell-actions="{row}"><WDropdown v-if="staff.hasPermission('location_edit')||staff.hasPermission('location_delete')" :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton class="location-more" v-bind="attrs" variant="text" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template><NuxtLink v-if="staff.hasPermission('location_edit')" role="menuitem" class="w-menu-item" :to="'/location/edit/'+row.id">{{t('button.edit')}}</NuxtLink><button v-if="staff.hasPermission('location_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="staff.hasPermission('location_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{t('button.delete')}}</button></WDropdown></template>
   </WTable><footer><WPagination :page="page" :page-size="20" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard></div>
 </div>
</template>
<style scoped>
.w-location-list { display:flex; flex-direction:column; gap:16px; }
.location-grid{display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px;align-items:start}.zone-nav{border:1px solid var(--w-border);background:white;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:2px}.zone-nav h2{display:flex;align-items:center;gap:6px;padding:4px 8px 8px;margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-3)}.zone-nav>button{border:0;background:transparent;border-radius:6px;padding:7px 10px;display:flex;justify-content:space-between;gap:8px;text-align:left;font:inherit;font-size:14px;line-height:20px;color:var(--w-text-1)}.zone-nav>button span:first-child{overflow-wrap:anywhere}.zone-nav>button span:last-child{font-size:12px;color:var(--w-text-3)}.zone-nav>button.selected{background:#F5F4FF;color:#4E1DBC;font-weight:600}.zone-nav>button:hover{background:#F6F7FA}.zone-nav>button:focus-visible{outline:2px solid var(--w-pri);outline-offset:-2px}@media(max-width:1100px){.location-grid{grid-template-columns:minmax(0,1fr)}.zone-nav{max-height:220px;overflow:auto}}
.w-location-list header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-location-list header>div { display:flex; align-items:baseline; gap:12px; }
.w-location-list h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-location-list header>div>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-location-list__filters { display:flex; flex-wrap:wrap; gap:8px; padding:14px 20px; border-bottom:1px solid var(--w-line); }
.w-location-list__filters>.w-input { width:300px; max-width:100%; }
.w-location-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-location-list :deep(table) { border-collapse:collapse; min-width:850px; }
.w-location-list :deep(th) { height:auto; padding:10px 8px 8px; line-height:16px; }
.w-location-list :deep(.w-table__head) { vertical-align:top; }
.w-location-list :deep(tbody td) { padding:10px 8px; }
.w-location-list :deep(th:first-child),.w-location-list :deep(td:first-child) { padding-left:20px; }
.w-location-list :deep(th:last-child),.w-location-list :deep(td:last-child) { padding-right:20px; }
.w-location-list__identity { display:flex; align-items:center; gap:10px; }
.w-location-list__identity>span { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--w-line); color:var(--w-text-2); font-weight:600; font-size:13px; }
.w-location-list__name { font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-location-list__stack,.w-location-list__address { display:flex; flex-direction:column; }
.w-location-list__address { max-width:280px; }
.w-location-list__address>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-location-list__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-location-list__transit { font-size:12px; line-height:18px; color:var(--w-link); }
.w-location-list footer { padding:12px 20px; border-top:1px solid var(--w-border); }

</style>

<style scoped>.w-location-utilization{display:flex;gap:10px;align-items:center;font-size:13px}.w-location-utilization progress{width:100px;height:6px;appearance:none;border:0;border-radius:999px;overflow:hidden;background:var(--w-line)}.location-more{color:var(--w-text-1)}.w-location-utilization progress::-webkit-progress-bar{background:var(--w-line)}.w-location-utilization progress::-webkit-progress-value{background:#7855FE}.w-location-utilization progress::-moz-progress-bar{background:#7855FE}
</style>
