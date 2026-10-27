<script setup lang="ts">
import {staffRolesOptions} from '~/data/selectOptions'
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staffStore=useStaffStore(),{bizErrorMessage}=useBizError()
const {roleLabel}=useOptionLabel()
useHead({title:()=>t('nav.staff')})
const keyword=ref(String(route.query.keyword||'')),data=ref<PaginationData|null>(null),loading=ref(false),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),summaries=ref<Record<number,any>>({})
const active=computed(()=>route.query.is_active==='false'?'false':'true'),page=computed(()=>Math.max(1,Number(route.query.page)||1))
const tabs=computed(()=>[{key:'true',label:t('recipient.ui.enable'),count:counts.value.true},{key:'false',label:t('recipient.ui.disable'),count:counts.value.false}])
const departments=ref<any[]>([])
const roleOptions=computed(()=>Array.from(new Set([...staffRolesOptions,...(data.value?.items||[]).flatMap((row:any)=>row.roles||[])])).map(value=>({value,label:roleLabel(value)})))
onMounted(async()=>{if(staffStore.hasPermission('department_read')){const result=await httpRequest<PaginationData>('/api/warehouse/department/',{params:{all:true}});departments.value=result?.items||[]}})
const columns=computed(()=>[{key:'staff',label:t('nav.staff')},{key:'account',label:t('staff.ui.account')},{key:'department',label:t('staff.fields.department')},{key:'roles',label:t('staff.ui.roles')},{key:'warehouses',label:t('nav.warehouse')},{key:'last_login',label:t('staff.ui.last-login')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';summaries.value={};counts.value={}
 const params={...route.query,per_page:20,page:page.value}
 const [result,other]=await Promise.all([httpRequest<PaginationData>('/api/warehouse/staff/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/staff/',{params:{...params,is_active:active.value==='true'?'false':'true',per_page:1,page:1}})])
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result)counts.value[active.value]=result.total
 if(other)counts.value[active.value==='true'?'false':'true']=other.total

}
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value)return
 busy.value=true
 try{
  if(action==='delete'&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.user_name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/staff/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){showToast(t('action-results.success'),'success');await load()}
 }finally{busy.value=false}
}
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()});onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-staff-list w-scope">
  <header><div><h1>{{t('nav.staff')}}</h1><span>{{data?.total?.toLocaleString(locale)}}</span></div><WButton v-if="staffStore.hasPermission('staff_edit')" variant="primary" icon="plus" to="/staff/add">{{t('staff.ui.create')}}</WButton></header>
  <WCard flush><WTabs inset :model-value="active" :items="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" />
   <form class="w-staff-list__filters" @submit.prevent="go({keyword:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('staff.ui.search')" :aria-label="t('common.search')" @change="go({keyword:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput><WFilterSelect v-if="staffStore.hasPermission('department_read')" :model-value="Number(route.query.department_id)||null" :label="t('staff.fields.department')" :options="departments.map(row=>({value:row.id,label:row.name}))" @change="value=>go({department_id:value})" /><WFilterSelect :model-value="String(route.query.role||'')||null" :label="t('staff.ui.roles')" :options="roleOptions" @change="value=>go({role:value})" /></form>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset>
    <template #head-actions><span class="sr-only">{{t('common.fields.action')}}</span></template>
    <template #cell-staff="{row}"><div class="w-staff-list__identity"><span>{{Array.from(String(row.user_name||''))[0]?.toUpperCase()}}</span><div class="w-staff-list__stack"><NuxtLink class="w-staff-list__name" :to="'/staff/detail/'+row.id">{{row.user_name}}</NuxtLink><span class="w-staff-list__sub">{{[row.position,row.employee_number].filter(Boolean).join(' · ')}}</span></div></div></template>
    <template #cell-account="{row}">{{row.email||'—'}}<span class="w-staff-list__sub">{{row.phone}}</span></template>
    <template #cell-department="{row}">{{row.department?.name||'—'}}</template>
    <template #cell-roles="{row}"><span v-for="role in row.roles" :key="role" class="w-staff-role">{{roleLabel(role)}}</span></template>
    <template #cell-warehouses="{row}"><span v-if="row.roles?.includes('company_admin')">{{t('common.all-warehouse')}}</span><span v-for="warehouse in (row.roles?.includes('company_admin')?[]:row.warehouses)" :key="warehouse.id" class="w-staff-warehouse">{{warehouse.name}}</span></template>
    <template #cell-last_login="{row}">{{row.last_login_at?$dayjs(row.last_login_at):'—'}}</template>
    <template #cell-actions="{row}"><WDropdown :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton v-bind="attrs" class="list-more" variant="text" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template><NuxtLink v-if="staffStore.hasPermission('staff_edit')" role="menuitem" class="w-menu-item" :to="'/staff/edit/'+row.id">{{t('button.edit')}}</NuxtLink><button v-if="staffStore.hasPermission('staff_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="staffStore.hasPermission('staff_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{t('button.delete')}}</button></WDropdown></template>
   </WTable><footer><WPagination :page="page" :page-size="20" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard>
 </div>
</template>
<style scoped>
.w-staff-list { display:flex; flex-direction:column; gap:16px; }
.w-staff-list header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-staff-list header>div { display:flex; align-items:baseline; gap:12px; }
.w-staff-list h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-staff-list header>div>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-staff-list__filters { display:flex; flex-wrap:wrap; gap:8px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-staff-list__filters>.w-input { width:300px; max-width:100%; }
.w-staff-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-staff-list :deep(table) { border-collapse:collapse; min-width:920px; }
.w-staff-list :deep(th) { height:auto; padding:10px 8px 8px; line-height:16px; }
.w-staff-list :deep(.w-table__head) { vertical-align:top; }
.w-staff-list :deep(tbody td) { padding:12px 8px; }
.w-staff-list :deep(th:first-child),.w-staff-list :deep(td:first-child) { padding-left:20px; }
.w-staff-list :deep(th:last-child),.w-staff-list :deep(td:last-child) { padding-right:20px; }
.w-staff-list__identity { display:flex; align-items:center; gap:12px; }
.w-staff-list__identity>span { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--w-line); color:var(--w-text-2); font-weight:600; font-size:13px; }
.w-staff-list__name { font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-staff-list__stack,.w-staff-list__address { display:flex; flex-direction:column; }
.w-staff-list__address { max-width:280px; }
.w-staff-list__address>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-staff-list__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-staff-list__transit { font-size:12px; line-height:18px; color:var(--w-link); }
.w-staff-list footer { padding:12px 20px; border-top:1px solid var(--w-border); }
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.list-more{color:var(--w-text-2)}
</style>

<style scoped>.w-staff-role{display:inline-flex;margin:2px 4px 2px 0;border:1px solid var(--w-border);border-radius:6px;padding:1px 6px;font-size:12px;line-height:16px;font-weight:500;color:var(--w-text-2);white-space:nowrap}.w-staff-warehouse{display:block;font-size:13px;line-height:20px}</style>
