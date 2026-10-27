<script setup lang="ts">
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staffStore=useStaffStore(),{bizErrorMessage}=useBizError()
const {roleLabel}=useOptionLabel()
useHead({title:()=>t('nav.carrier')})
const keyword=ref(String(route.query.name||'')),data=ref<PaginationData|null>(null),loading=ref(false),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),summaries=ref<Record<number,any>>({})
const active=computed(()=>route.query.is_active==='false'?'false':'true'),page=computed(()=>Math.max(1,Number(route.query.page)||1))
const tabs=computed(()=>[{key:'true',label:t('recipient.ui.enable'),count:counts.value.true},{key:'false',label:t('recipient.ui.disable'),count:counts.value.false}])
const columns=computed(()=>[{key:'name',label:t('nav.carrier')},{key:'waybill',label:t('carrier.methods.waybill')},{key:'pickup',label:t('carrier.methods.pickup')},{key:'tracking',label:t('carrier.methods.tracking')},{key:'integration',label:t('carrier.integration.title')},{key:'updated',label:t('common.dates.updated')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';summaries.value={};counts.value={}
 const params={...route.query,per_page:20,page:page.value}
 const [result,other]=await Promise.all([httpRequest<PaginationData>('/api/warehouse/carrier/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/carrier/',{params:{...params,is_active:active.value==='true'?'false':'true',per_page:1,page:1}})])
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result)counts.value[active.value]=result.total
 if(other)counts.value[active.value==='true'?'false':'true']=other.total

}
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value)return
 busy.value=true
 try{
  if(action==='delete'&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/carrier/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){showToast(t('action-results.success'),'success');await load()}
 }finally{busy.value=false}
}
watch(()=>route.query,()=>{keyword.value=String(route.query.name||'');load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-carrier-list w-scope">
  <header><div><h1>{{t('nav.carrier')}}</h1><span>{{data?.total?.toLocaleString(locale)}}</span></div><WButton v-if="staffStore.hasPermission('carrier_edit')" variant="primary" icon="plus" to="/carrier/add">{{t('carrier.operations.add')}}</WButton></header>
  <WCard flush><WTabs inset :model-value="active" :items="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" />
   <form class="w-carrier-list__filters" @submit.prevent="go({name:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('carrier.fields.name')" :aria-label="t('common.search')" @change="go({name:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput></form>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset valign="top">
    <template #head-actions><span class="sr-only">{{t('common.fields.action')}}</span></template>
    <template #cell-name="{row}"><NuxtLink class="w-carrier-list__name" :to="'/carrier/detail/'+row.id">{{row.name}}</NuxtLink><span class="w-carrier-list__sub w-carrier-code">{{row.code}}</span></template>
    <template #cell-waybill="{row}"><span class="method"><WIcon v-if="row.waybill_method==='api'" name="link" :size="14"/>{{t('carrier.methods.options.waybill.'+(row.waybill_method||'manual'))}}</span><span class="w-carrier-list__sub">{{row.waybill_method==='api'?row.integration?.name:row.waybill_method==='file'?row.file_preset:''}}</span></template>
    <template #cell-pickup="{row}"><span class="method"><WIcon v-if="row.pickup_method==='api'" name="link" :size="14"/>{{t('carrier.methods.options.pickup.'+(row.pickup_method||'none'))}}</span><span v-if="row.pickup_method==='scheduled'&&row.pickup_schedule" class="w-carrier-list__sub">{{row.pickup_schedule.ready_time||'—'}}–{{row.pickup_schedule.close_time||'—'}}</span><span v-else-if="row.pickup_method==='api'" class="w-carrier-list__sub">{{row.integration?.name}}</span></template>
    <template #cell-tracking="{row}"><span class="method"><WIcon v-if="row.tracking_method==='api'" name="link" :size="14"/>{{t('carrier.methods.options.tracking.'+(row.tracking_method||'link'))}}</span><span v-if="row.tracking_method==='api'" class="w-carrier-list__sub">{{row.integration?.name}}</span></template>
    <template #cell-integration="{row}"><WStatus :tone="row.integration?.enabled?'ok':'none'">{{row.integration?.name||t('carrier.integration.status.none')}}</WStatus></template>
    <template #cell-updated="{row}">{{$dayjs(row.updated_at)}}</template>
    <template #cell-actions="{row}"><div class="carrier-actions"><WButton v-if="staffStore.hasPermission('carrier_edit')&&row.is_active" size="sm" :to="'/carrier/edit/'+row.id">{{t('carrier.list-settings')}}</WButton><WButton v-else-if="staffStore.hasPermission('carrier_edit')" size="sm" :disabled="busy" @click="act(row,'toggle')">{{t('recipient.ui.enable')}}</WButton><WDropdown :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton v-bind="attrs" class="list-more" variant="text" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template><NuxtLink v-if="staffStore.hasPermission('carrier_edit')" role="menuitem" class="w-menu-item" :to="'/carrier/edit/'+row.id">{{t('button.edit')}}</NuxtLink><button v-if="staffStore.hasPermission('carrier_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="staffStore.hasPermission('carrier_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{t('button.delete')}}</button></WDropdown></div></template>
   </WTable><footer><WPagination :page="page" :page-size="20" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard>
 </div>
</template>
<style scoped>
.w-carrier-list { display:flex; flex-direction:column; gap:16px; }
.w-carrier-list header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-carrier-list header>div { display:flex; align-items:baseline; gap:12px; }
.w-carrier-list h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-carrier-list header>div>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-carrier-list__filters { display:flex; flex-wrap:wrap; gap:8px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-carrier-list__filters>.w-input { width:300px; max-width:100%; }
.w-carrier-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-carrier-list :deep(table) { border-collapse:collapse; min-width:1000px; }
.w-carrier-list :deep(th) { height:auto; padding:10px 8px 8px; line-height:16px; }
.w-carrier-list :deep(.w-table__head) { vertical-align:top; }
.w-carrier-list :deep(tbody td) { padding:12px 8px; }
.w-carrier-list :deep(th:first-child),.w-carrier-list :deep(td:first-child) { padding-left:20px; }
.w-carrier-list :deep(th:last-child),.w-carrier-list :deep(td:last-child) { padding-right:20px; }
.w-carrier-list__identity { display:flex; align-items:center; gap:10px; }
.w-carrier-list__identity>span { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--w-line); color:var(--w-text-2); font-weight:600; font-size:13px; }
.w-carrier-list__name { font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-carrier-list__stack,.w-carrier-list__address { display:flex; flex-direction:column; }
.w-carrier-list__address { max-width:280px; }
.w-carrier-list__address>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-carrier-list__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-carrier-list__transit { font-size:12px; line-height:18px; color:var(--w-link); }
.w-carrier-list footer { padding:12px 20px; border-top:1px solid var(--w-border); }
.w-carrier-code{font-family:ui-monospace,Consolas,monospace}.carrier-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px}.method{display:inline-flex;align-items:center;gap:4px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.list-more{color:var(--w-text-2)}
</style>

<style scoped>.w-carrier-role{display:inline-flex;margin:2px 4px 2px 0;border:1px solid var(--w-border);border-radius:6px;padding:1px 6px;font-size:12px;line-height:18px}.w-carrier-warehouse{display:block;font-size:13px;line-height:20px}</style>
