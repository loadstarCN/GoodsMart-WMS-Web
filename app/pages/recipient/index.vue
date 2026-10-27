<script setup lang="ts">
import {countryName, COUNTRY_CODES} from '~/data/countries'
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
useHead({title:()=>t('nav.recipient')})
const keyword=ref(String(route.query.keyword||'')),data=ref<PaginationData|null>(null),loading=ref(false),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),summaries=ref<Record<number,any>>({})
const active=computed(()=>route.query.is_active==='false'?'false':'true'),page=computed(()=>Math.max(1,Number(route.query.page)||1))
const tabs=computed(()=>[{key:'true',label:t('recipient.ui.enable'),count:counts.value.true},{key:'false',label:t('recipient.ui.disable'),count:counts.value.false}])
const countries=computed(()=>COUNTRY_CODES.map(value=>({value,label:countryName(value,locale.value)})))
const columns=computed(()=>[{key:'recipient',label:t('nav.recipient')},{key:'country',label:t('common.fields.country')},{key:'contact',label:t('recipient.ui.contact')},{key:'source',label:t('recipient.ui.source')},...(staff.hasPermission('dn_read')?[{key:'dns',label:t('dn.entity'),align:'right' as const},{key:'arrival',label:t('recipient.ui.last-dispatch')}]:[]),{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';summaries.value={};counts.value={}
 const params={...route.query,per_page:20,page:page.value}
 const [result,other]=await Promise.all([httpRequest<PaginationData>('/api/warehouse/recipient/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/recipient/',{params:{...params,is_active:active.value==='true'?'false':'true',per_page:1,page:1}})])
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result)counts.value[active.value]=result.total
 if(other)counts.value[active.value==='true'?'false':'true']=other.total
 if(result?.items.length&&staff.hasPermission('dn_read')){
  const summary=await httpRequest<{items:any[]}>('/api/warehouse/dn/recipient-summary',{params:{recipient_ids:result.items.map(row=>row.id).join(',')},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
  if(seq===generation&&summary){for(const row of result.items)summaries.value[row.id]={total:0};for(const item of summary.items)summaries.value[item.recipient_id]=item}
 }
}
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value)return
 busy.value=true
 try{
  if(action==='delete'&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/recipient/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){showToast(t('action-results.success'),'success');await load()}
 }finally{busy.value=false}
}
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-recipient-list w-scope">
  <header><div><h1>{{t('nav.recipient')}}</h1><span>{{data?.total?.toLocaleString(locale)}}</span></div><WButton v-if="staff.hasPermission('recipient_edit')" variant="primary" icon="plus" to="/recipient/add">{{t('recipient.ui.create')}}</WButton></header>
  <WCard flush><WTabs inset :model-value="active" :items="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" />
   <form class="w-recipient-list__filters" @submit.prevent="go({keyword:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('recipient.ui.search')" :aria-label="t('common.search')" @change="go({keyword:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput><WFilterSelect :model-value="String(route.query.country||'')||null" :label="t('common.fields.country')" :options="countries" @change="value=>go({country:value})" /></form>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset>
    <template #head-actions><span class="sr-only">{{t('common.fields.action')}}</span></template>
    <template #cell-recipient="{row}"><div class="w-recipient-list__identity"><span aria-hidden="true">{{Array.from(String(row.name||''))[0]}}</span><div class="w-recipient-list__stack"><NuxtLink class="w-recipient-list__name" :to="'/recipient/detail/'+row.id">{{row.name}}</NuxtLink><span class="w-recipient-list__sub">{{row.organization}}</span></div></div></template>
    <template #cell-country="{row}"><span>{{countryName(row.country,locale)}}</span><span class="w-recipient-list__sub">{{[row.admin_area,row.locality].filter(Boolean).join(' · ')}}</span></template>
    <template #cell-contact="{row}"><div class="w-recipient-list__stack"><span>{{row.contact}}</span><span class="w-recipient-list__sub">{{row.phone||row.email}}</span></div></template>
    <template #cell-source="{row}"><span>{{t('recipient.ui.source-unrecorded')}}</span></template>
    <template #cell-dns="{row}">{{summaries[row.id]?.total?.toLocaleString(locale)}}</template>
    <template #cell-arrival="{row}">{{summaries[row.id]?.dispatched_at?$dayjs(summaries[row.id].dispatched_at,'MM/DD'):(summaries[row.id]?t('recipient.ui.no-dispatch'):'')}}</template>
    <template #cell-actions="{row}"><WDropdown :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton v-bind="attrs" class="list-more" variant="text" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template><NuxtLink v-if="staff.hasPermission('recipient_edit')" role="menuitem" class="w-menu-item" :to="'/recipient/edit/'+row.id">{{t('button.edit')}}</NuxtLink><button v-if="staff.hasPermission('recipient_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="staff.hasPermission('recipient_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{t('button.delete')}}</button></WDropdown></template>
   </WTable><footer><WPagination :page="page" :page-size="20" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard>
 </div>
</template>
<style scoped>
.w-recipient-list { display:flex; flex-direction:column; gap:16px; }
.w-recipient-list header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-recipient-list header>div { display:flex; align-items:baseline; gap:12px; }
.w-recipient-list h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-recipient-list header>div>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-recipient-list__filters { display:flex; flex-wrap:wrap; gap:8px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-recipient-list__filters>.w-input { width:300px; max-width:100%; }
.w-recipient-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-recipient-list :deep(table) { border-collapse:collapse; min-width:900px; }
.w-recipient-list :deep(th) { height:auto; padding:10px 8px 8px; line-height:16px; }
.w-recipient-list :deep(.w-table__head) { vertical-align:top; }
.w-recipient-list :deep(tbody td) { padding:12px 8px; }
.w-recipient-list :deep(th:first-child),.w-recipient-list :deep(td:first-child) { padding-left:20px; }
.w-recipient-list :deep(th:last-child),.w-recipient-list :deep(td:last-child) { padding-right:20px; }
.w-recipient-list__identity { display:flex; align-items:center; gap:12px; }
.w-recipient-list__identity>span { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--w-line); color:var(--w-text-2); font-weight:600; font-size:13px; }
.w-recipient-list__name { font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-recipient-list__stack,.w-recipient-list__address { display:flex; flex-direction:column; }
.w-recipient-list__address { max-width:280px; }
.w-recipient-list__address>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-recipient-list__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-recipient-list__transit { font-size:12px; line-height:18px; color:var(--w-link); }
.w-recipient-list footer { padding:12px 20px; border-top:1px solid var(--w-border); }
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.list-more{color:var(--w-text-2)}
</style>
