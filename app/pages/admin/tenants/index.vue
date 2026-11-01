<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();

const dataToPass = computed(() => ({
  current: t('admin.nav.tenants'),
  list: [t('admin.title'), t('admin.nav.tenants')]
}));

const router = useRouter();
let route = useRoute();
const busy=ref(false)
const loading = ref(true), keyword = ref(''), error = ref('');
const pageData = ref<any>(null);
let generation = 0;
const {bizErrorMessage} = useBizError();
const fetchData = async () => {
    const current = ++generation;
    loading.value = true; error.value = ''; pageData.value = null;
    try {
        const result = await httpRequest('/api/warehouse/company/platform-tenants', {
            params: {...route.query, status: activeTab.value},
            onError: e => { if(current === generation) error.value = bizErrorMessage(e); }
        });
        if(current === generation) pageData.value = result;
    } finally { if(current === generation) loading.value = false; }
};
watch(() => route.query, () => { keyword.value = String(route.query.keyword || ''); fetchData(); });

async function search() {
    const query: Record<string, any> = { ...route.query, page: 1 };
    if (keyword.value.trim()) {
        query.keyword = keyword.value.trim();
    } else {
        delete query.keyword;
    }
    await router.push({ query });
}

onMounted(async() => {
    keyword.value = (route.query.keyword as string) || '';
    fetchData();
});

const activeTab = computed(() => String(route.query.status || (route.query.is_active === 'false' ? 'inactive' : route.query.is_active === 'true' ? 'active' : 'all')));
const tabs = computed(() => ['all','active','expiring','expired','inactive'].map(key => ({key,label:t('tenant-list.'+key),count:pageData.value?.counts?.[key],attention:key==='expiring',error:key==='expired'})));
const setFilter = (status:string|undefined) => { if(!status) return; const query:Record<string,any>={...route.query,status,page:1}; delete query.is_active; router.push({query}); };
const columns=computed(()=>[
 {key:'name',label:t('admin.nav.tenants'),wrap:true},
 {key:'status',label:t('common.fields.status')},
 {key:'expired',label:t('admin.tenants.fields.expired-at')},
 {key:'warehouse_count',label:t('tenant-list.warehouses'),type:'qty' as const,keepZero:true},
 {key:'user_count',label:t('tenant-list.users'),type:'qty' as const,keepZero:true},
 {key:'document_count',label:t('tenant-list.documents'),type:'qty' as const,keepZero:true},
 {key:'created',label:t('common.dates.created')},
 {key:'actions',label:t('common.fields.action'),align:'right' as const}
]);
const act=async(row:any,action:'toggle'|'delete')=>{
 if(busy.value||loading.value)return
 busy.value=true
 try{
  if(!await wConfirm({title:t(action==='delete'?'admin.tenants.operations.delete':row.is_active?'tenant-list.inactive':'tenant-list.active'),message:action==='delete'?t('tenant-management.delete-confirm'):t('tenant-list.toggle-confirm',{name:row.name}),confirmText:t('button.confirm'),cancelText:t('button.cancel')}))return
  let success=false
  await httpRequest('/api/warehouse/company/'+row.id,{method:action==='delete'?'DELETE':'PUT',...(action==='toggle'?{body:{is_active:!row.is_active}}:{}),onSuccess:()=>{success=true},onError:e=>showToast(bizErrorMessage(e),'error')})
  if(success){showToast(t('action-results.success'),'success');await fetchData()}
 }finally{busy.value=false}
}
onBeforeUnmount(()=>generation++);
useHead({title:()=>t('admin.nav.tenants')})
</script>
<template>
 <div class="w-admin-list w-scope">
  <header><div><h1>{{t('admin.nav.tenants')}}</h1><span>{{pageData?.total}}</span></div><WButton variant="primary" to="/admin/tenants/add">{{t('admin.tenants.operations.add')}}</WButton></header>
  <WAlert v-if="error" tone="block" :title="error"><WButton @click="fetchData">{{t('delivery.pickup.operations.refresh')}}</WButton></WAlert>
  <WCard flush>
   <WTabs :items="tabs" :label="t('common.fields.status')" :model-value="activeTab" inset @update:model-value="setFilter"/>
   <form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('tenant-list.search')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton></form>
   <WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset>
    <template #cell-name="{row}"><NuxtLink class="w-admin-name" :to="'/admin/tenants/'+row.id">{{row.name}}</NuxtLink><small>{{row.email}}</small></template>
    <template #cell-created="{row}">{{$dayjs(row.created_at,'YYYY-MM-DD',pageData.timezone)}}</template>
    <template #cell-status="{row}"><WStatus :tone="!row.is_active?'none':row.expired?'bad':'ok'">{{t('tenant-list.'+(!row.is_active?'inactive':row.expired?'expired':'active'))}}</WStatus></template>
    <template #head-expired><span class="help-heading">{{t('admin.tenants.fields.expired-at')}}<WButton type="button" variant="text" size="sm" icon="help" icon-only :aria-label="t('tenant-list.expiry-hint',{zone:pageData?.timezone||'UTC'})" @click="wAlert({title:t('admin.tenants.fields.expired-at'),message:t('tenant-list.expiry-hint',{zone:pageData?.timezone||'UTC'})})"/></span></template><template #cell-expired="{row}">{{row.expired_at?$dayjs(row.expired_at,'YYYY-MM-DD HH:mm',pageData.timezone):t('tenant-list.unlimited')}}</template>
    <template #cell-actions="{row}"><div class="actions"><WButton size="sm" :to="'/admin/tenants/'+row.id">{{t('button.edit')}}</WButton><WDropdown :label="t('common.fields.action')" placement="bottom-end" width="280px"><template #trigger="{attrs}"><WButton v-bind="attrs" variant="text" icon="more" icon-only :aria-label="t('common.fields.action')" :disabled="busy"/></template><TenantRowMenu :row="row" :busy="busy" @action="action=>act(row,action)"/></WDropdown></div></template>
   </WTable>
   <footer><small v-if="pageData">{{t('tenant-list.scope',{month:pageData.month,zone:pageData.timezone})}}</small><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer>
  </WCard>
 </div>
</template>
<style scoped>
.w-admin-list{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;gap:12px;align-items:center}header{justify-content:space-between;flex-wrap:wrap}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}header span{font-size:13px;color:var(--w-text-2)}.filters{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:300px;max-width:100%}.w-admin-list :deep(.w-table){min-width:1050px}.w-admin-list :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.w-admin-name{color:var(--w-text-1);font-size:14px;font-weight:500;line-height:20px;text-decoration:none}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.actions{display:flex;gap:8px;justify-content:flex-end}footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 20px;border-top:1px solid var(--w-border)}
</style>
<style scoped>.help-heading{display:inline-flex;align-items:center;gap:3px}.help-heading :deep(.w-btn){width:22px;height:22px;min-height:22px;padding:2px}</style>
