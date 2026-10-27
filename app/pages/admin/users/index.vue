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

const fetchData = async () => {
    loading.value = true;
    await httpRequest<PaginationData>('/api/system/user/users', {
        method: 'GET',
        // 默认展示启用中的用户，与下方 Tab 高亮保持一致
        params: { is_active: 'true', ...route.query },
        onSuccess: async(data) => {
            pageData.value = data;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
            loading.value = false;
        }
    })
};

watch(() => route.query, async () => {
    await fetchData();
});

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
let roleOptions = ref<string[]>([]);

const fetchRoles = async () => {
    if (roleOptions.value.length > 0) return;
    await httpRequest<any>('/api/system/user/roles', {
        method: 'GET',
        params: { all: true },
        onSuccess: (data) => {
            const items = Array.isArray(data) ? data : (data?.items || []);
            roleOptions.value = items.map((r: any) => r.name).filter(Boolean);
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    });
};

onMounted(async() => {
    keyword.value = (route.query.keyword as string) || '';
    fetchData();
});

// 当前登录的管理员自己：隐藏删除/停用按钮
const isSelf = (user: any) => String(user?.id) === String(authStore.userInfo?.id);

const deleteItem = async (item_id: Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('common.entities.user') }), t('button.confirm'), t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/system/user/users/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();
            },
            onError: (error) => {
                showToast(error.message, 'error')
            }
        })
    }
}

const activeItem = async (item_id: Number) => {
    await httpRequest(`/api/system/user/users/${item_id}`, {
        method: 'PUT',
        body: { is_active: true },
        onSuccess: async() => {
            showToast(t('action-results.success'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
}

const inactiveItem = async (item_id: Number) => {
    await httpRequest(`/api/system/user/users/${item_id}`, {
        method: 'PUT',
        body: { is_active: false },
        onSuccess: async() => {
            showToast(t('action-results.success'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
}

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
  return statusParam === 'false' ? 'inactive' : 'active'
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

const openCreateModal = async () => {
    editingId.value = null;
    form.value = { user_name: '', email: '', password: '', roles: [], is_active: true };
    formErrors.value = {};
    showModal.value = true;
    await fetchRoles();
};

const openEditModal = async (user: any) => {
    editingId.value = user.id;
    form.value = {
        user_name: user.user_name || '',
        email: user.email || '',
        password: '',
        roles: [...(user.roles || [])],
        is_active: user.is_active ?? true,
    };
    formErrors.value = {};
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
    if(saving.value)return;
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
            showToast(bizErrorMessage(error), 'error');
        },
        onFinally: () => {
            saving.value = false;
        }
    });
};


const columns=computed(()=>[{key:'user',label:t('common.entities.user')},{key:'roles',label:t('staff.fields.roles')},{key:'status',label:t('common.fields.status')},{key:'created',label:t('common.dates.created')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
const toggleRole=(role:string)=>{form.value.roles=form.value.roles.includes(role)?form.value.roles.filter(value=>value!==role):[...form.value.roles,role]}
useHead({title:()=>t('admin.nav.users')})
</script>
<template><div class="w-admin-users w-scope"><header><div><h1>{{t('admin.nav.users')}}</h1><span>{{pageData?.total}}</span></div><WButton variant="primary" @click="openCreateModal">{{t('admin.users.operations.add')}}</WButton></header><WCard flush><WTabs :items="['active','inactive'].map(key=>({key,label:t('common.status.'+key)}))" :label="t('common.fields.status')" :model-value="activeTab" inset @update:model-value="value=>setActiveFilter(value==='active')"/><form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('common.search-placeholder')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton></form><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #cell-user="{row}"><div class="user"><span class="avatar">{{row.user_name?.slice(0,1).toUpperCase()}}</span><div><strong>{{row.user_name}}</strong><small>{{row.email}}</small></div></div></template><template #cell-roles="{row}"><span v-for="role in row.roles||[]" :key="role" class="role">{{roleLabel(role)}}</span></template><template #cell-status="{row}"><WStatus :tone="row.is_active?'ok':'none'">{{t('common.status.'+(row.is_active?'active':'inactive'))}}</WStatus></template><template #cell-created="{row}">{{$dayjs(row.created_at,'YYYY-MM-DD HH:mm')}}</template><template #cell-actions="{row}"><div class="actions"><WButton size="sm" @click="openEditModal(row)">{{t('button.edit')}}</WButton><template v-if="!isSelf(row)"><WButton size="sm" @click="row.is_active?inactiveItem(row.id):activeItem(row.id)">{{t('common.status.'+(row.is_active?'inactive':'active'))}}</WButton><WButton size="sm" variant="danger" @click="deleteItem(row.id)">{{t('button.delete')}}</WButton></template></div></template></WTable><footer><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard><WDrawer v-model:open="showModal" :title="t(editingId?'admin.users.operations.edit':'admin.users.operations.add')" width="480px" :closable="!saving" :close-on-backdrop="!saving"><form @submit.prevent="submitForm"><fieldset :disabled="saving"><WField :label="t('common.fields.name')" required :error="formErrors.user_name"><WInput v-model="form.user_name"/></WField><WField :label="t('common.fields.email')" required :error="formErrors.email"><WInput v-model="form.email" type="email"/></WField><WField :label="t('common.fields.password')" :required="!editingId" :error="formErrors.password" :hint="editingId?t('admin.users.password-keep-hint'):undefined"><WInput v-model="form.password" type="password" autocomplete="new-password"/></WField><WField :label="t('staff.fields.roles')" required :error="formErrors.roles"><div class="role-options"><WCheckbox v-for="role in roleOptions" :key="role" :model-value="form.roles.includes(role)" @update:model-value="toggleRole(role)">{{roleLabel(role)}}</WCheckbox></div></WField><WField :label="t('common.fields.status')"><WSwitch v-model="form.is_active" :disabled="!!editingId&&isSelf({id:editingId})">{{t('common.status.'+(form.is_active?'active':'inactive'))}}</WSwitch></WField></fieldset></form><template #footer><WButton :disabled="saving" @click="showModal=false">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="saving" @click="submitForm">{{t('button.save')}}</WButton></template></WDrawer></div></template>
<style scoped>
.w-admin-users{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;gap:12px;align-items:center}header{justify-content:space-between;flex-wrap:wrap}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}header span{font-size:13px;color:var(--w-text-2)}.filters{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:300px;max-width:100%}.w-admin-users :deep(.w-table){min-width:850px}.w-admin-users :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.user{display:flex;align-items:center;gap:12px}.avatar{width:32px;height:32px;border-radius:50%;background:#EDEFF3;color:var(--w-text-3);display:grid;place-items:center;flex:none}.user strong{font-size:14px;font-weight:500;line-height:20px}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:2px}.role{display:block;font-size:13px;line-height:20px}.actions{display:flex;gap:8px;justify-content:flex-end}footer{padding:16px 20px;border-top:1px solid var(--w-border)}fieldset{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;min-width:0}.role-options{display:flex;flex-wrap:wrap;gap:12px 16px}
</style>
