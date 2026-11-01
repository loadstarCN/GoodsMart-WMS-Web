<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t, te } = useI18n();
// 删除失败按业务码显示三语文案（如内置权限 11011）
const { bizErrorMessage } = useBizError();

const dataToPass = computed(() => ({
  current: t('admin.nav.permissions'),
  list: [t('admin.title'), t('admin.nav.permissions')]
}));

const router = useRouter();
let route = useRoute();
const loading = ref(true),busy=ref(false),editorVisible=ref(false);
const editingPermission=ref<CatalogPermission|null>(null);
const openEditor=(row:CatalogPermission|null)=>{editingPermission.value=row;editorVisible.value=true};
const savedEditor=()=>{editorVisible.value=false;fetchData()};
interface CatalogPermission { id:number; name:string; description:string; is_builtin:boolean; is_platform_only:boolean; role_count:number }
const catalog = ref<CatalogPermission[]>([]);
const keyword = ref('');
const moduleFilter = ref('');
const kindFilter = ref('');
const moduleDefs = computed(() => PERMISSION_CATEGORIES.flatMap(c => c.modules).sort((a,b)=>(b.prefix?.length||0)-(a.prefix?.length||0)));
const moduleDef = (name:string) => moduleDefs.value.find(m => m.perms?.includes(name) || (m.prefix && name.startsWith(m.prefix+'_')));
const moduleKey = (name:string) => moduleDef(name)?.label || 'permission-catalog.other';
const permissionName=(name:string)=>{if(te('permission-labels.'+name))return t('permission-labels.'+name);const mod=moduleDef(name);if(!mod?.prefix)return name;return t(mod.label)+' / '+t(permissionOpLabelKey(mod,name.slice(mod.prefix.length+1)))};
const modules = computed(() => [...new Set(catalog.value.map(p=>moduleKey(p.name)))].map(value=>({value,label:t(value)})));
const counts = computed(()=>({custom:catalog.value.filter(p=>!p.is_builtin).length,platform:catalog.value.filter(p=>p.is_platform_only).length,unused:catalog.value.filter(p=>p.role_count===0).length}));
const filtered = computed(()=>catalog.value.filter(p=>{
  const q=String(route.query.keyword||'').toLowerCase();
  return (!q || (p.name+' '+(p.description||'')).toLowerCase().includes(q)) &&
    (!route.query.module || moduleKey(p.name)===route.query.module) &&
    (route.query.kind!=='custom'||!p.is_builtin) && (route.query.kind!=='platform'||p.is_platform_only) &&
    (route.query.kind!=='unused'||p.role_count===0);
}));
const pageData = computed(()=>{const page=Math.max(1,Math.min(Math.ceil(filtered.value.length/20)||1,Number(route.query.page)||1));return {total:filtered.value.length,page,per_page:20,items:filtered.value.slice((page-1)*20,page*20)}});
const restoreFilters=()=>{keyword.value=String(route.query.keyword||'');moduleFilter.value=String(route.query.module||'');kindFilter.value=String(route.query.kind||'')};
const error=ref('');
let generation=0;
const fetchData=async()=>{
 const seq=++generation;loading.value=true;error.value='';catalog.value=[];
 const data=await httpRequest<{items:CatalogPermission[]}>('/api/system/user/permissions/catalog',{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});
 if(seq!==generation)return;
 catalog.value=data?.items||[];loading.value=false;
};
onBeforeUnmount(()=>generation++);
watch(()=>route.query,restoreFilters);
async function search(){await router.push({query:{page:1,...(keyword.value.trim()?{keyword:keyword.value.trim()}:{}),...(moduleFilter.value?{module:moduleFilter.value}:{}),...(kindFilter.value?{kind:kindFilter.value}:{})}})}
onMounted(()=>{restoreFilters();fetchData()});

const deleteItem = async (item_id: Number) => {
    if(busy.value||loading.value||catalog.value.find(p=>p.id===item_id)?.is_builtin)return;
    busy.value=true;
    try{
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('admin.permissions.entity') }), t('button.confirm'), t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/system/user/permissions/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();
            },
            onError: (error) => {
                showToast(bizErrorMessage(error), 'error')
            }
        })
    }
    }finally{busy.value=false}
}


const columns=computed(()=>[{key:'name',label:t('permission-catalog.code')},{key:'label',label:t('common.fields.name')},{key:'description',label:t('common.fields.description'),wrap:true},{key:'role_count',label:t('permission-catalog.roles'),align:'right' as const},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
useHead({title:()=>t('admin.nav.permissions')})
</script>
<template><div class="w-admin-list w-scope"><header><div><h1>{{t('admin.nav.permissions')}}</h1><span>{{pageData?.total}}</span></div><WButton variant="primary" @click="openEditor(null)">{{t('admin.permissions.operations.add')}}</WButton></header><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="fetchData">{{t('dn.list.retry')}}</WButton></template></WAlert><p class="catalog-hint">{{t('permission-catalog.hint')}}</p><WCard flush><form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('common.search-placeholder')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WSelect v-model="moduleFilter" :aria-label="t('permission-catalog.module')" :options="[{value:'',label:t('permission-catalog.allModules')},...modules]"/><WSelect v-model="kindFilter" :aria-label="t('permission-catalog.scope')" :options="[{value:'',label:t('permission-catalog.all')},{value:'custom',label:t('permission-catalog.custom')+' ('+counts.custom+')'},{value:'platform',label:t('permission-catalog.platform')+' ('+counts.platform+')'},{value:'unused',label:t('permission-catalog.unused')+' ('+counts.unused+')'}]"/><WButton type="submit">{{t('common.search')}}</WButton></form><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #cell-name="{row}"><button type="button" class="w-admin-name permission-name" @click="openEditor(row)">{{row.name}}</button><small>{{t(moduleKey(row.name))}}</small><small v-if="row.is_platform_only">{{t('permission-catalog.platform')}}</small><small v-if="row.is_builtin">{{t('admin.builtin.label')}}</small></template><template #cell-label="{row}">{{permissionName(row.name)}}</template><template #cell-actions="{row}"><div class="actions"><WButton size="sm" @click="openEditor(row)">{{t('button.edit')}}</WButton><WButton size="sm" variant="danger" :disabled="busy||!!row.is_builtin" @click="deleteItem(row.id)">{{t('button.delete')}}</WButton></div></template></WTable><footer><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard><PermissionEditor v-if="editorVisible" :permission-id="editingPermission?.id??null" :platform-only="editingPermission?.is_platform_only" :display-name="editingPermission?permissionName(editingPermission.name):undefined" :module-name="editingPermission?t(moduleKey(editingPermission.name)):undefined" @close="editorVisible=false" @saved="savedEditor"/></div></template>
<style scoped>
.w-admin-list{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;gap:12px;align-items:center}header{justify-content:space-between;flex-wrap:wrap}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}header span{font-size:13px;color:var(--w-text-2)}.filters{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:280px;max-width:100%}.filters>.w-select{width:190px;max-width:100%}.catalog-hint{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0}.w-admin-name{overflow-wrap:anywhere}.w-admin-list :deep(.w-table){min-width:800px}.w-admin-list :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.w-admin-name{color:var(--w-text-1);font-size:14px;font-weight:500;line-height:20px;text-decoration:none}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.actions{display:flex;gap:8px;justify-content:flex-end}footer{padding:16px 20px;border-top:1px solid var(--w-border)}
</style>
<style scoped>.permission-name{background:none;border:0;padding:0;text-align:left;font:inherit;cursor:pointer}.permission-name:focus-visible{outline:2px solid var(--w-link);outline-offset:3px}</style>
