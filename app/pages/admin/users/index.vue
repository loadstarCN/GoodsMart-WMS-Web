<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
// 角色存代码（company_admin 等），显示译名；自定义角色原样
const { roleLabel } = useOptionLabel();
const { bizErrorMessage } = useBizError();
const authStore = useAuthStore();

const dataToPass = computed(() => ({
  current: t('admin.nav.users'),
  list: [t('admin.title'), t('admin.nav.users')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const error=ref('');
let generation=0;
const fetchData = async () => {
 const current=++generation;
 loading.value=true; pageData.value=null; error.value='';
 try {
  const result=await httpRequest<PaginationData>('/api/system/user/users',{
   params:{...route.query},onError:e=>{if(current===generation) error.value=bizErrorMessage(e);}
  });
  if(current===generation) pageData.value=result;
 } finally {if(current===generation) loading.value=false;}
};
watch(() => route.query, () => {keyword.value=String(route.query.keyword||'');fetchData();});

async function search() {
    const query: Record<string, any> = { ...route.query, page: 1 };
    if (keyword.value.trim()) {
        query.keyword = keyword.value.trim();
    } else {
        delete query.keyword;
    }
    await router.push({ query });
}

// ==================== 角色选项（用于新增/编辑弹窗） ====================
const originalRoles = ref<string[]>([]);
const roleCatalog = ref<any[]>([]), editingCompany = ref<number|null>(null);
const roleOptions = computed(() => roleCatalog.value.filter(r => (r.company_id == null || r.company_id === editingCompany.value) && (r.is_active || originalRoles.value.includes(r.name))));
const companies = ref<any[]>([]);
const companiesError=ref(''),companiesLoading=ref(false);
const fetchCompanies=async()=>{
 if(companiesLoading.value)return;
 companiesLoading.value=true;companiesError.value='';
 companies.value=(await httpRequest<any>('/api/warehouse/company/',{params:{all:true},onError:e=>{companiesError.value=bizErrorMessage(e)}}))?.items||[];
 companiesLoading.value=false;
};
const changeFilter=(key:string,value:any)=>router.push({query:{...route.query,[key]:value||undefined,page:1}});
const statusKey=(row:any)=>!row.is_active?'inactive':row.company_status==='inactive'?'tenant-inactive':row.company_status==='expired'?'tenant-expired':'active';

const rolesLoading=ref(false),rolesError=ref(''),saveError=ref('');
const fetchRoles = async () => {
    if (rolesLoading.value) return;
    rolesLoading.value=true;rolesError.value='';
    roleCatalog.value=[];
    try {
        const items:any[]=[];
        let page=1;
        while(true) {
            const data=await httpRequest<any>('/api/system/user/roles', {params:{page,per_page:100},onError:error=>{rolesError.value=bizErrorMessage(error)}});
            if(!data)return;
            if(Array.isArray(data)){items.push(...data);break;}
            items.push(...(data.items||[]));
            if(items.length>=data.total||!data.items?.length)break;
            page++;
        }
        roleCatalog.value=items;
    } finally {rolesLoading.value=false;}
};

onMounted(async() => {
    keyword.value = (route.query.keyword as string) || '';
    fetchData();
    fetchCompanies();
});

// 当前登录的管理员自己：隐藏删除/停用按钮
const isSelf = (user: any) => String(user?.id) === String(authStore.userInfo?.id);

const mutationBusy = ref(false);
const mutateUser = async (item_id: number, active?: boolean) => {
    if (mutationBusy.value || isSelf({id:item_id})) return;
    mutationBusy.value=true;
    try {
        if (active === undefined && !await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('common.entities.user') }), t('button.confirm'), t('button.cancel'))) return;
        await httpRequest(`/api/system/user/users/${item_id}`, {
            method: active === undefined ? 'DELETE' : 'PUT',
            ...(active === undefined ? {} : {body:{is_active:active}}),
            onSuccess: async () => { showToast(t('action-results.success'), 'success'); await fetchData(); },
            onError: error => showToast(bizErrorMessage(error), 'error'),
        });
    } finally { mutationBusy.value=false; }
};
const deleteItem = (id:number) => mutateUser(id);
const activeItem = (id:number) => mutateUser(id,true);
const inactiveItem = (id:number) => mutateUser(id,false);

const setActiveFilter = (status: boolean | null) => {
  const query: Record<string, any> = { ...route.query }
  if (status === null) {
    delete query.is_active
  } else {
    query.is_active = String(status)
  }
  query.page = '1'
  router.push({ query })
}

const activeTab = computed(() => {
  const statusParam = route.query.is_active
  return statusParam === 'false' ? 'inactive' : statusParam === 'true' ? 'active' : 'all'
})

// ==================== 新增 / 编辑弹窗 ====================
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);

const form = ref({
    user_name: '',
    email: '',
    password: '',
    roles: [] as string[],
    is_active: true,
});

let formErrors = ref<Record<string, string>>({});
const originalForm=ref('');
const hasChanges=()=>showModal.value&&JSON.stringify(form.value)!==originalForm.value;
useUnsavedForm(hasChanges,()=>saving.value);
let closing=false;
const closeEditor=async()=>{
 if(saving.value||closing)return;
 closing=true;
 try{if(!hasChanges()||await showConfirm(t('unsaved-form.title'),t('unsaved-form.message'),t('unsaved-form.leave'),t('unsaved-form.stay')))showModal.value=false}
 finally{closing=false}
};
const editorOpen=computed({get:()=>showModal.value,set:(value:boolean)=>{if(value)showModal.value=true;else void closeEditor()}});

const openCreateModal = async () => {
    editingId.value = null; editingCompany.value = null; originalRoles.value=[];
    form.value = { user_name: '', email: '', password: '', roles: [], is_active: true };
    formErrors.value = {};saveError.value='';
    originalForm.value=JSON.stringify(form.value);
    showModal.value = true;
    await fetchRoles();
};

const openEditModal = async (user: any) => {
    editingId.value = user.id; editingCompany.value = user.company_id ?? null; originalRoles.value=[...(user.roles||[])];
    form.value = {
        user_name: user.user_name || '',
        email: user.email || '',
        password: '',
        roles: [...(user.roles || [])],
        is_active: user.is_active ?? true,
    };
    formErrors.value = {};saveError.value='';
    originalForm.value=JSON.stringify(form.value);
    showModal.value = true;
    await fetchRoles();
};

const validateForm = () => {
    formErrors.value = {};
    if (!form.value.user_name.trim()) {
        formErrors.value.user_name = t('common.validation.name-required', { entity: t('common.entities.user') });
    }
    if (!form.value.email.trim()) {
        formErrors.value.email = t('common.validation.email-required');
    } else if (!/\S+@\S+\.\S+/.test(form.value.email)) {
        formErrors.value.email = t('common.validation.email-format');
    }
    // 新增必须填密码；编辑留空表示不修改；填了就按后端的密码规则（10015）校验
    if (!editingId.value && !form.value.password) {
        formErrors.value.password = t('common.validation.password-required');
    } else if (form.value.password && !isValidPassword(form.value.password)) {
        formErrors.value.password = t('common.validation.password-policy', passwordPolicyParams());
    }
    if (form.value.roles.length === 0) {
        formErrors.value.roles = t('common.validation.role-min-count');
    }
    return Object.keys(formErrors.value).length === 0;
};

const submitForm = async () => {
    if(saving.value||rolesLoading.value||rolesError.value)return;
    saveError.value='';
    if (!validateForm()) return;
    saving.value = true;
    const body: Record<string, any> = {
        user_name: form.value.user_name.trim(),
        email: form.value.email.trim(),
        roles: form.value.roles,
        is_active: form.value.is_active,
    };
    if (form.value.password) {
        body.password = form.value.password;
    }
    const isEdit = !!editingId.value;
    await httpRequest(isEdit ? `/api/system/user/users/${editingId.value}` : '/api/system/user/users', {
        method: isEdit ? 'PUT' : 'POST',
        body,
        onSuccess: async () => {
            showToast(t('action-results.success'), 'success');
            showModal.value = false;
            await fetchData();
        },
        onError: (error) => {
            saveError.value=bizErrorMessage(error);
            showToast(saveError.value, 'error');
        },
        onFinally: () => {
            saving.value = false;
        }
    });
};


const columns=computed(()=>[{key:'user',label:t('common.entities.user')},{key:'type',label:t('user-list.type')},{key:'company',label:t('user-list.company')},{key:'roles',label:t('staff.fields.roles')},{key:'status',label:t('common.fields.status')},{key:'last_login',label:t('user-list.last-login')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const toggleRole=(role:string)=>{form.value.roles=form.value.roles.includes(role)?form.value.roles.filter(value=>value!==role):[...form.value.roles,role]}
onBeforeUnmount(()=>generation++);
useHead({title:()=>t('admin.nav.users')})
</script>
<template><div class="w-admin-users w-scope"><header><div><h1>{{t('admin.nav.users')}}</h1><span>{{pageData?.total}}</span></div><WButton variant="primary" :disabled="mutationBusy" @click="openCreateModal">{{t('admin.users.operations.add')}}</WButton></header><WAlert v-if="companiesError" tone="block" :title="companiesError"><template #actions><WButton @click="fetchCompanies">{{t('dn.list.retry')}}</WButton></template></WAlert><p class="hint">{{t('user-list.hint')}}</p><WAlert v-if="error" tone="block" :title="error"><WButton @click="fetchData">{{t('delivery.pickup.operations.refresh')}}</WButton></WAlert><WCard flush><WTabs :items="['all','active','inactive'].map(key=>({key,label:t('tenant-list.'+key)}))" :label="t('common.fields.status')" :model-value="activeTab" inset @update:model-value="value=>setActiveFilter(value==='all'?null:value==='active')"/><form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('common.search-placeholder')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WSelect :model-value="String(route.query.type||'')" :aria-label="t('user-list.type')" :options="[{value:'',label:t('user-list.all-types')},{value:'user',label:t('user-list.user')},{value:'staff',label:t('user-list.staff')}]" @update:model-value="value=>changeFilter('type',value)"/><WSelect :model-value="String(route.query.company_id||'')" :aria-label="t('user-list.company')" :disabled="companiesLoading||!!companiesError" :options="[{value:'',label:t('user-list.all-companies')},...companies.map(c=>({value:String(c.id),label:c.name}))]" @update:model-value="value=>changeFilter('company_id',value)"/><WButton type="submit">{{t('common.search')}}</WButton></form><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #cell-user="{row}"><div class="user"><span class="avatar">{{row.user_name?.slice(0,1).toUpperCase()}}</span><div><strong>{{row.user_name}}</strong><WStatus v-if="isSelf(row)" class="self-marker" tone="none">{{t('user-list.current-account')}}</WStatus><small>{{row.email}}</small></div></div></template><template #cell-type="{row}">{{t('user-list.'+row.type)}}</template><template #cell-company="{row}"><NuxtLink v-if="row.company_id" :to="'/admin/tenants/'+row.company_id">{{row.company_name}}</NuxtLink></template><template #cell-roles="{row}"><span v-for="role in row.roles||[]" :key="role" class="role">{{row.role_labels?.[role]||roleLabel(role)}}</span></template><template #cell-status="{row}"><WStatus :tone="statusKey(row)==='active'?'ok':statusKey(row)==='tenant-expired'?'bad':'none'">{{t('user-list.'+statusKey(row))}}</WStatus></template><template #cell-last_login="{row}">{{row.last_login_at?$dayjs(row.last_login_at,'YYYY-MM-DD HH:mm'):t('user-list.unknown')}}</template><template #cell-actions="{row}"><div class="actions"><WButton size="sm" :disabled="mutationBusy" @click="openEditModal(row)">{{t('button.edit')}}</WButton><template v-if="!isSelf(row)"><WButton size="sm" :disabled="mutationBusy" @click="row.is_active?inactiveItem(row.id):activeItem(row.id)">{{t('tenant-list.'+(row.is_active?'inactive':'active'))}}</WButton><WButton size="sm" variant="danger" :disabled="mutationBusy" @click="deleteItem(row.id)">{{t('button.delete')}}</WButton></template></div></template></WTable><footer><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard><WDrawer v-model:open="editorOpen" :title="t(editingId?'admin.users.operations.edit':'admin.users.operations.add')" width="480px" :closable="!saving" :close-on-backdrop="!saving"><WAlert v-if="rolesError" tone="block" :title="rolesError"><template #actions><WButton :disabled="rolesLoading" @click="fetchRoles">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-if="saveError" tone="block" :title="saveError"/><form @submit.prevent="submitForm"><fieldset :disabled="saving||rolesLoading||!!rolesError"><WField :label="t('common.fields.name')" required :error="formErrors.user_name"><WInput v-model="form.user_name"/></WField><WField :label="t('common.fields.email')" required :error="formErrors.email"><WInput v-model="form.email" type="email"/></WField><WField :label="t('common.fields.password')" :required="!editingId" :error="formErrors.password" :hint="editingId?t('admin.users.password-keep-hint'):undefined"><WInput v-model="form.password" type="password" autocomplete="new-password"/></WField><WField group :label="t('staff.fields.roles')" :hint="t('user-list.roles-hint')" required :error="formErrors.roles"><div class="role-options"><WCheckbox v-for="role in roleOptions" :key="role.name" :model-value="form.roles.includes(role.name)" @update:model-value="toggleRole(role.name)">{{role.display_name||roleLabel(role.name)}}</WCheckbox></div></WField><WField :label="t('common.fields.status')" :hint="t('staff.ui.account-enabled-help')"><WSwitch v-model="form.is_active" :disabled="!!editingId&&isSelf({id:editingId})">{{t('common.status.'+(form.is_active?'active':'inactive'))}}</WSwitch></WField></fieldset></form><template #footer><WButton :disabled="saving" @click="closeEditor">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="saving" :disabled="rolesLoading||!!rolesError" @click="submitForm">{{t('button.save')}}</WButton></template></WDrawer></div></template>
<style scoped>
.w-admin-users{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;gap:12px;align-items:center}header{justify-content:space-between;flex-wrap:wrap}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}header span{font-size:13px;color:var(--w-text-2)}.hint{margin:0;font-size:12px;color:var(--w-text-3)}.filters{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-select{width:180px;max-width:100%}.filters>.w-input{width:300px;max-width:100%}.w-admin-users :deep(.w-table){min-width:1100px}.w-admin-users :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.user{display:flex;align-items:center;gap:12px}.avatar{width:32px;height:32px;border-radius:50%;background:#EDEFF3;color:var(--w-text-3);display:grid;place-items:center;flex:none}.self-marker{margin-left:8px}.user strong{font-size:14px;font-weight:500;line-height:20px}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:2px}.role{display:block;font-size:13px;line-height:20px}.actions{display:flex;gap:8px;justify-content:flex-end}footer{padding:16px 20px;border-top:1px solid var(--w-border)}fieldset{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;min-width:0}.role-options{display:flex;flex-wrap:wrap;gap:12px 16px}
</style>

