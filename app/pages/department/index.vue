<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),actor=useStaffStore(),{bizErrorMessage}=useBizError()
const {roleLabel}=useOptionLabel()
useHead({title:()=>t('nav.department')})
const keyword=ref(String(route.query.name||'')),data=ref<PaginationData|null>(null),loading=ref(false),error=ref(''),busy=ref(false),counts=ref<Record<string,number>>({}),summaries=ref<Record<number,any>>({})
const active=computed(()=>route.query.is_active==='false'?'false':'true'),page=computed(()=>Math.max(1,Number(route.query.page)||1))
const tabs=computed(()=>[{key:'true',label:t('recipient.ui.enable'),count:counts.value.true},{key:'false',label:t('recipient.ui.disable'),count:counts.value.false}])
const selected=ref<any>(null),drawerOpen=ref(false),drawerBusy=ref(false),drawerError=ref(''),members=ref<any[]>([]),memberCount=ref<number|null>(null)
const openEditor=async(row?:any)=>{selected.value=row?{...row}:{name:'',description:'',is_active:true};drawerError.value='';members.value=[];memberCount.value=null;drawerOpen.value=true;if(row&&actor.hasPermission('staff_read')){const [enabled,disabled]=await Promise.all([httpRequest<any>('/api/warehouse/staff/',{params:{department_id:row.id,per_page:5,is_active:true}}),httpRequest<any>('/api/warehouse/staff/',{params:{department_id:row.id,per_page:1,is_active:false}})]);if(selected.value?.id===row.id){members.value=enabled?.items||[];memberCount.value=enabled&&disabled?enabled.total+disabled.total:null}}}
const save=async()=>{if(drawerBusy.value||!actor.hasPermission('department_edit'))return;drawerError.value='';if(!String(selected.value.name||'').trim()){drawerError.value=t('common.validation.name-required',{entity:t('department.entity')});return}drawerBusy.value=true;let success=false;try{await httpRequest('/api/warehouse/department/'+(selected.value.id||''),{method:selected.value.id?'PUT':'POST',body:{name:selected.value.name,description:selected.value.description,is_active:selected.value.is_active,...(!selected.value.id?{company_id:actor.staffInfo?.company_id}:{})},onSuccess:()=>success=true,onError:e=>drawerError.value=bizErrorMessage(e)});if(success){drawerOpen.value=false;await load();await actor.getCurrentStaffInfo();showToast(t('action-results.success'),'success')}}finally{drawerBusy.value=false}}
const columns=computed(()=>[{key:'name',label:t('nav.department')},{key:'members',label:t('nav.staff'),align:'right' as const},{key:'created',label:t('common.dates.created')},{key:'updated',label:t('common.dates.updated')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};if(!keepPage)delete query.page;for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';summaries.value={};counts.value={}
 const params={...route.query,is_active:active.value,per_page:20,page:page.value}
 const [result,other]=await Promise.all([httpRequest<PaginationData>('/api/warehouse/department/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),httpRequest<PaginationData>('/api/warehouse/department/',{params:{...params,is_active:active.value==='true'?'false':'true',per_page:1,page:1}})])
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result)counts.value[active.value]=result.total
 if(other)counts.value[active.value==='true'?'false':'true']=other.total
 if(result&&actor.hasPermission('staff_read'))await Promise.all(result.items.map(async(row:any)=>{const values=await Promise.all([true,false].map(is_active=>httpRequest<any>('/api/warehouse/staff/',{params:{department_id:row.id,is_active,per_page:1}})));if(seq===generation&&values.every(Boolean))summaries.value[row.id]=values.reduce((sum,value)=>sum+value.total,0)}))

}
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value)return
 busy.value=true
 try{
  if(action==='delete'&&!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:row.name}),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/department/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:err=>showToast(bizErrorMessage(err),'error')})
  if(success){showToast(t('action-results.success'),'success');await load()}
 }finally{busy.value=false}
}
watch(()=>route.query,()=>{keyword.value=String(route.query.name||'');load()});onMounted(async()=>{await load();if(route.query.editor==='new')await openEditor();else if(Number(route.query.editor)>0){const row=await httpRequest<any>('/api/warehouse/department/'+Number(route.query.editor),{onError:e=>error.value=bizErrorMessage(e)});if(row)await openEditor(row)}});onBeforeUnmount(()=>generation++)
</script>
<template>
 <div class="w-department-list w-scope">
  <header><div><h1>{{t('nav.department')}}</h1><span>{{data?.total?.toLocaleString(locale)}}</span></div><WButton v-if="actor.hasPermission('department_edit')" variant="primary" icon="plus" @click="openEditor()">{{t('department.ui.create')}}</WButton></header>
  <WCard flush><div class="w-department-toolbar"><WTabs :model-value="active" :items="tabs" :label="t('common.fields.status')" @update:model-value="value=>go({is_active:value})" /><form @submit.prevent="go({name:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('department.fields.name')" :aria-label="t('common.search')" @change="go({name:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput></form></div>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset>
    <template #head-actions><span class="w-sr-only">{{t('common.fields.action')}}</span></template><template #cell-name="{row}"><button class="w-department-name" @click="openEditor(row)">{{row.name}}</button><span class="w-department-list__sub">{{String(row.description||'').replace(/<[^>]*>/g,'')}}</span></template>
    <template #cell-members="{row}"><NuxtLink v-if="summaries[row.id]!=null" class="w-department-count" :to="'/staff?department_id='+row.id">{{summaries[row.id]}}</NuxtLink><span v-else>—</span></template>
    <template #cell-created="{row}">{{$dayjs(row.created_at,'YYYY-MM-DD')}} · {{row.creator?.user_name||'—'}}</template>
    <template #cell-updated="{row}">{{$dayjs(row.updated_at,'YYYY-MM-DD')}}</template>
    <template #cell-actions="{row}"><WDropdown v-if="actor.hasPermission('department_edit')||actor.hasPermission('department_delete')" :label="t('common.fields.action')" placement="bottom-end" width="180px"><template #trigger="{attrs}"><WButton class="w-department-more" v-bind="attrs" variant="text" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template><button v-if="actor.hasPermission('department_edit')" role="menuitem" class="w-menu-item" @click="openEditor(row)">{{t('button.edit')}}</button><button v-if="actor.hasPermission('department_edit')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'toggle')">{{t(row.is_active?'recipient.ui.disable':'recipient.ui.enable')}}</button><button v-if="actor.hasPermission('department_delete')" class="w-menu-item" role="menuitem" :disabled="busy" @click="act(row,'delete')">{{t('button.delete')}}</button></WDropdown></template>
   </WTable><footer><WPagination :page="page" :page-size="20" :total="data?.total" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard>
 <WDrawer v-model:open="drawerOpen" :title="selected?.id?selected.name:t('department.ui.create')" width="480px" :closable="!drawerBusy" :close-on-backdrop="!drawerBusy"><form v-if="selected" id="department-editor" class="w-department-editor" @submit.prevent="save"><WAlert v-if="drawerError" tone="block" :title="drawerError" /><WField :label="t('department.fields.name')"><WInput v-model="selected.name" :disabled="drawerBusy||!actor.hasPermission('department_edit')" /></WField><WField :label="t('department.fields.description')" optional><QuillEditor v-if="/<[^>]+>/.test(selected.description||'')" v-model:content="selected.description" content-type="html" theme="snow" :read-only="!actor.hasPermission('department_edit')" /><WInput v-else v-model="selected.description" :disabled="drawerBusy||!actor.hasPermission('department_edit')" /></WField><WSwitch v-model="selected.is_active" :label="t('recipient.ui.enable')" :disabled="drawerBusy||!actor.hasPermission('department_edit')" /><section v-if="selected.id&&actor.hasPermission('staff_read')"><div class="w-department-members-heading"><strong>{{t('nav.staff')}} {{memberCount??'—'}}</strong><NuxtLink class="w-department-count" :to="'/staff?department_id='+selected.id">{{t('department.ui.view-staff')}} →</NuxtLink></div><ul><li v-for="member in members" :key="member.id"><span class="w-department-avatar">{{member.user_name.slice(0,1)}}</span><span>{{member.user_name}}</span><small>{{member.roles.map(roleLabel).join(' · ')}}</small></li></ul></section><dl v-if="selected.id"><dt>{{t('common.dates.created')}}</dt><dd>{{$dayjs(selected.created_at)}} · {{selected.creator?.user_name||'—'}}</dd><dt>{{t('common.dates.updated')}}</dt><dd>{{$dayjs(selected.updated_at)}}</dd></dl></form><template #footer><WButton @click="drawerOpen=false" :disabled="drawerBusy">{{t('button.cancel')}}</WButton><WButton v-if="actor.hasPermission('department_edit')" type="submit" form="department-editor" variant="primary" :loading="drawerBusy">{{t('button.save')}}</WButton></template></WDrawer>
 </div>
</template>
<style scoped>
.w-department-list { display:flex; flex-direction:column; gap:16px; }
.w-department-list header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-department-list header>div { display:flex; align-items:baseline; gap:12px; }
.w-department-list h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-department-list header>div>span { font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-department-list__filters { display:flex; flex-wrap:wrap; gap:8px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-department-list__filters>.w-input { width:300px; max-width:100%; }
.w-department-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-department-list :deep(table) { border-collapse:collapse; min-width:760px; }
.w-department-list :deep(th) { height:auto; padding:10px 8px 8px; line-height:16px; }
.w-department-list :deep(.w-table__head) { vertical-align:top; }
.w-department-list :deep(tbody td) { padding:12px 8px; }
.w-department-list :deep(th:first-child),.w-department-list :deep(td:first-child) { padding-left:20px; }
.w-department-list :deep(th:last-child),.w-department-list :deep(td:last-child) { padding-right:20px; }
.w-department-list__identity { display:flex; align-items:center; gap:10px; }
.w-department-list__identity>span { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:50%; background:var(--w-line); color:var(--w-text-2); font-weight:600; font-size:13px; }
.w-department-list__name { font-size:14px; line-height:20px; font-weight:500; color:var(--w-text-1); }
.w-department-list__stack,.w-department-list__address { display:flex; flex-direction:column; }
.w-department-list__address { max-width:280px; }
.w-department-list__address>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-department-list__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-department-list__transit { font-size:12px; line-height:18px; color:var(--w-link); }
.w-department-list footer { padding:12px 20px; border-top:1px solid var(--w-border); }
</style>

<style scoped>.w-department-more{color:var(--w-text-2)}.w-department-list :deep(th:nth-child(3)),.w-department-list :deep(td:nth-child(3)){padding-left:24px}.w-department-role{display:inline-flex;margin:2px 4px 2px 0;border:1px solid var(--w-border);border-radius:6px;padding:1px 6px;font-size:12px;line-height:18px}.w-department-warehouse{display:block;font-size:13px;line-height:20px}</style>

<style scoped>
.w-department-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;padding:0 20px;border-bottom:1px solid var(--w-border);flex-wrap:wrap}.w-department-toolbar :deep(.w-tabs){box-shadow:none}.w-department-toolbar :deep(.w-tabs__tab){height:48px}.w-department-toolbar form{width:300px;max-width:100%;padding:6px 0}.w-department-name{padding:0;border:0;background:none;font-size:14px;line-height:20px;font-weight:500;color:var(--w-text-1);text-align:left;cursor:pointer}.w-department-count{color:var(--w-link);font-weight:600;text-decoration:none}.w-department-editor{display:flex;flex-direction:column;gap:16px}.w-department-editor section,.w-department-editor dl{padding-top:16px;border-top:1px solid var(--w-line)}.w-department-members-heading{display:flex;justify-content:space-between;gap:12px;font-size:13px}.w-department-editor ul{margin:8px 0 0;padding:0;list-style:none}.w-department-editor li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--w-line)}.w-department-avatar{width:28px;height:28px;display:grid;place-items:center;background:#EDEFF3;border-radius:50%;font-size:12px}.w-department-editor small{font-size:12px;color:var(--w-text-3)}.w-department-editor dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px;font-size:13px}.w-department-editor dt{color:var(--w-text-3);font-weight:400}.w-department-editor dd{margin:0}
</style>
