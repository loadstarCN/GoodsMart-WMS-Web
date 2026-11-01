<script setup lang="ts">
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staff=useStaffStore(),warehouses=useWarehouseStore(),{bizErrorMessage}=useBizError()
const data=ref<PaginationData|null>(null),loading=ref(true),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),overview=ref<Record<number,any>>({})
const keyword=ref(String(route.query.name||'')),active=computed(()=>route.query.is_active==='false'?'false':'true')
const tabs=computed(()=>['true','false'].map(value=>({value,label:t(value==='true'?'recipient.ui.enabled':'recipient.ui.disabled')+' '+(counts.value[value]??'')})))
useHead({title:()=>t('nav.warehouse')})
const ready=ref(false)
const allowed=(permission:string)=>ready.value&&staff.hasPermission(permission)
const companyManager=computed(()=>ready.value&&(staff.isCompanyAdmin||staff.staffInfo?.permissions?.includes('all_access')||staff.staffInfo?.permissions?.includes('company_all_access')))
let generation=0
const go=(patch:Record<string,any>)=>router.push({query:{...route.query,page:1,...patch}})
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';overview.value={};data.value=null;counts.value={}
 ready.value=false
 const currentStaff=await staff.getCurrentStaffInfo()
 if(seq!==generation)return
 ready.value=!!currentStaff
 if(!allowed('warehouse_read')){loading.value=false;return}
 const params={...route.query,is_active:active.value,per_page:10}
 const values=await Promise.all([httpRequest<PaginationData>('/api/warehouse/warehouse/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/warehouse/',{params:{...params,is_active:active.value==='true'?'false':'true',per_page:1},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})])
 if(seq!==generation)return
 data.value=values[0];loading.value=false
 counts.value={...(values[0]?{[active.value]:values[0].total}:{}),...(values[1]?{[active.value==='true'?'false':'true']:values[1].total}:{})}
 await Promise.all((data.value?.items||[]).filter(row=>row.is_active&&(warehouses.canSelectAll||warehouses.warehouses.some(w=>w.id===row.id))).map(async row=>{
  const result=await httpRequest<any>('/api/warehouse/warehouse/'+row.id+'/overview',{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
  if(seq===generation&&result)overview.value[row.id]=result
 }))
}
const act=async(row:any,remove=false)=>{
 if(busy.value||loading.value||!allowed(remove?'warehouse_delete':'warehouse_edit')||(remove&&(!companyManager.value||overview.value[row.id]?.location_records>0)))return
 busy.value=true
 try{
  if(remove&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/warehouse/'+row.id,{method:remove?'DELETE':'PUT',...(remove?{}:{body:{is_active:!row.is_active}}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){await staff.refreshStaffInfo();await load();showToast(t('action-results.success'),'success')}
 }finally{busy.value=false}
}
const stats=(row:any)=>{
 const item=overview.value[row.id]
 if(!item)return []
 return [
  {key:'locations',permission:'location_read',label:t('nav.location'),value:item.locations,path:'/location',hint:t('warehouse.ui.location-summary',{zones:item.zones??'\u2014',empty:item.empty_locations??'\u2014'})},
  {key:'total_stock',permission:'inventory_read',label:t('inventory.history.total'),value:item.total_stock,path:'/inventory',hint:t('warehouse.ui.goods-count',{count:item.total_goods_count})},
  {key:'dispatch_today',permission:'dn_read',label:t('warehouse.ui.dispatch-today'),value:item.dispatch_today,path:'/dn',hint:t('warehouse.ui.missing-tracking',{count:item.dispatch_without_tracking??'\u2014'})},
  {key:'receive_today',permission:'asn_read',label:t('warehouse.ui.receive-today'),value:item.receive_today,path:'/asn',hint:t('warehouse.ui.receiving-quantity',{count:item.receive_today_quantity??'\u2014'})},
 ].filter(stat=>stat.value!==undefined&&allowed(stat.permission))
}
const openStat=(row:any,stat:{path:string;key:string;permission:string})=>{
 if(!allowed(stat.permission))return
 const date=overview.value[row.id]?.date
 if(['dispatch_today','receive_today'].includes(stat.key)&&!date)return
 warehouses.selectWarehouse(row)
 router.push({path:stat.path,query:['dispatch_today','receive_today'].includes(stat.key)?{warehouse_todo_date:date}:{}})
}
watch(()=>route.query,()=>{keyword.value=String(route.query.name||'');load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-warehouse-list w-scope">
  <header><div><h1>{{t('nav.warehouse')}}</h1><span>{{t('warehouse.ui.status-count',{active:counts.true??'—',inactive:counts.false??'—'})}}</span></div><WButton v-if="companyManager&&allowed('warehouse_edit')" icon="plus" variant="primary" to="/warehouse/add">{{t('warehouse.ui.create')}}</WButton></header>
  <div class="w-warehouse-toolbar"><WSegmented :model-value="active" :options="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" /><form @submit.prevent="go({name:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('warehouse.fields.name')" :aria-label="t('common.search')" @change="go({name:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput></form></div>
  <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="loading" @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
  <WEmptyState v-if="loading" :title="t('common.status.loading')" />
  <WEmptyState v-else-if="!data?.items.length" :title="t('common.status.nothing-show')" />
  <article v-for="row in data?.items||[]" :key="row.id" class="w-warehouse-card">
   <div class="w-warehouse-card__body"><span class="w-warehouse-card__icon"><WIcon name="warehouse" :size="22" /></span><div class="w-warehouse-card__content"><div class="w-warehouse-card__heading"><h2><NuxtLink class="w-warehouse-name" :to="'/warehouse/detail/'+row.id">{{row.name}}</NuxtLink></h2><WStatus :tone="row.is_active?'ok':'none'" muted>{{t(row.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus></div><span>{{row.address||'—'}}</span><div class="w-warehouse-card__meta"><span>{{isValidTimeZone(row.timezone)?timeZoneDescription(row.timezone):'—'}} <small v-if="!row.timezone_configured">{{t('timezone.default')}}</small></span><span>{{row.phone}}</span><span v-if="row.manager?.user_name">{{t('common.users.manager')}} {{row.manager.user_name}}</span></div></div><div class="w-warehouse-card__actions"><WButton v-if="allowed('warehouse_edit')" :to="'/warehouse/edit/'+row.id">{{t('button.edit')}}</WButton><WDropdown v-if="allowed('warehouse_edit')||(companyManager&&allowed('warehouse_delete'))" :label="t('common.fields.action')" placement="bottom-end"><template #trigger="{attrs}"><WButton v-bind="attrs" icon="more" icon-only :aria-label="t('common.fields.action')" /></template><button v-if="allowed('warehouse_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row)">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="companyManager&&allowed('warehouse_delete')" class="w-menu-item" role="menuitem" :disabled="busy||overview[row.id]?.location_records>0" :title="overview[row.id]?.location_records>0?t('warehouse.ui.location-delete-blocked',{count:overview[row.id].location_records}):undefined" @click="act(row,true)">{{t('button.delete')}}</button><small v-if="overview[row.id]?.location_records>0" class="delete-hint">{{t('warehouse.ui.location-delete-blocked',{count:overview[row.id].location_records})}}</small></WDropdown></div></div>
   <div v-if="stats(row).length" class="w-warehouse-card__stats"><button v-for="stat in stats(row)" :key="stat.key" type="button" @click="openStat(row,stat)"><span>{{stat.label}}</span><strong>{{stat.value.toLocaleString(locale)}}</strong><small>{{stat.hint||' '}}</small></button></div>
   <div v-if="!row.address_en||!row.contact_name_en" class="w-warehouse-card__warning"><WStatus tone="warn" muted>{{t('warehouse.ui.export-missing')}}</WStatus><WHelp :text="t('warehouse.tips.export')" /><NuxtLink v-if="allowed('warehouse_edit')" class="w-warehouse-complete" :to="'/warehouse/edit/'+row.id">{{t('button.edit')}}</NuxtLink></div>
  </article>
  <WPagination :page="Number(route.query.page)||1" :page-size="10" :total="data?.total" @update:page="value=>go({page:value})" />
 </div>
</template>
<style scoped>
.w-warehouse-list { display:flex; flex-direction:column; gap:18px; max-width:1216px; }
.w-warehouse-list header,.w-warehouse-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
.w-warehouse-list header>div { display:flex; flex-wrap:wrap; align-items:baseline; gap:10px; }
.w-warehouse-list h1 { margin:0;font-size:24px;line-height:32px;font-weight:600; }
.w-warehouse-list header span { font-size:14px;color:var(--w-text-2); }
.w-warehouse-toolbar form { flex:0 1 300px; }
.w-warehouse-card { border:1px solid var(--w-border);border-radius:10px;background:var(--w-surface); }
.w-warehouse-card__body { display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px 20px;padding:20px 24px; }
.w-warehouse-card__icon { flex:none;width:44px;height:44px;border:1px solid var(--w-border);border-radius:10px;display:grid;place-items:center;color:var(--w-text-2); }
.w-warehouse-card__content { flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:6px;color:var(--w-text-2);font-size:14px;line-height:22px;overflow-wrap:anywhere; }
.w-warehouse-card__heading { display:flex;flex-wrap:wrap;align-items:center;gap:10px; }
.w-warehouse-card h2 { margin:0;font-size:20px;line-height:28px;font-weight:600; }
.w-warehouse-name { color:var(--w-text-1); }
.w-warehouse-card__meta { display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px; }
.w-warehouse-card__meta small { font-size:12px;border:1px solid var(--w-border);border-radius:6px;padding:1px 6px; }
.w-warehouse-card__actions { display:flex;gap:8px; }
.w-warehouse-card__stats { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--w-line); }
.w-warehouse-card__stats button { display:flex;flex-direction:column;gap:2px;padding:14px 24px 16px;border:0;background:transparent;text-align:left;color:var(--w-text-1); }
.w-warehouse-card__stats button+button { border-left:1px solid var(--w-line); }
.w-warehouse-card__stats span { font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-2); }
.w-warehouse-card__stats strong { font-size:20px;line-height:28px;font-weight:600; }
.w-warehouse-card__stats small { min-height:18px;font-size:12px;line-height:18px;color:var(--w-text-3); }
.w-warehouse-card__warning { display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:12px 24px;border-top:1px solid var(--w-line);font-size:13px;line-height:20px; }
.delete-hint{display:block;padding:4px 10px 8px;font-size:12px;line-height:18px;color:var(--w-text-3)}
.w-warehouse-complete { font-weight:600;color:var(--w-link); }
@media(max-width:600px){.w-warehouse-card__stats{grid-template-columns:repeat(2,minmax(0,1fr))}.w-warehouse-card__stats button:nth-child(3){border-left:0;border-top:1px solid var(--w-line)}.w-warehouse-card__stats button:nth-child(4){border-top:1px solid var(--w-line)}}
</style>
