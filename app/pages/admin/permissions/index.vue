<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
// 删除失败按业务码显示三语文案（如内置权限 11011）
const { bizErrorMessage } = useBizError();

const dataToPass = computed(() => ({
  current: t('admin.nav.permissions'),
  list: [t('admin.title'), t('admin.nav.permissions')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    await httpRequest<PaginationData>('/api/system/user/permissions', {
        method: 'GET',
        params: route.query,
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

onMounted(async() => {
    keyword.value = (route.query.keyword as string) || '';
    fetchData();
});

const deleteItem = async (item_id: Number) => {
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
}


const columns=computed(()=>[{key:'name',label:t('common.fields.name')},{key:'description',label:t('common.fields.description'),wrap:true},{key:'created',label:t('common.dates.created')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
useHead({title:()=>t('admin.nav.permissions')})
</script>
<template><div class="w-admin-list w-scope"><header><div><h1>{{t('admin.nav.permissions')}}</h1><span>{{pageData?.total}}</span></div><WButton variant="primary" to="/admin/permissions/add">{{t('admin.permissions.operations.add')}}</WButton></header><WCard flush><form class="filters" @submit.prevent="search"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('common.search-placeholder')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton></form><WTable :columns="columns" :rows="pageData?.items||[]" :loading="loading" inset><template #cell-name="{row}"><NuxtLink class="w-admin-name" :to="'/admin/permissions/'+row.id">{{row.name}}</NuxtLink><small v-if="row.is_builtin">{{t('admin.builtin.label')}}</small></template><template #cell-created="{row}">{{$dayjs(row.created_at,'YYYY-MM-DD HH:mm')}}</template><template #cell-actions="{row}"><div class="actions"><WButton size="sm" :to="'/admin/permissions/'+row.id">{{t('button.edit')}}</WButton><WButton size="sm" variant="danger" :disabled="!!row.is_builtin" @click="deleteItem(row.id)">{{t('button.delete')}}</WButton></div></template></WTable><footer><WPagination :page="pageData?.page||1" :page-size="pageData?.per_page||20" :total="pageData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})"/></footer></WCard></div></template>
<style scoped>
.w-admin-list{display:flex;flex-direction:column;gap:16px}header,header>div{display:flex;gap:12px;align-items:center}header{justify-content:space-between;flex-wrap:wrap}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}header span{font-size:13px;color:var(--w-text-2)}.filters{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--w-line)}.filters>.w-input{width:300px;max-width:100%}.w-admin-list :deep(.w-table){min-width:800px}.w-admin-list :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}.w-admin-name{color:var(--w-text-1);font-size:14px;font-weight:500;line-height:20px;text-decoration:none}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.actions{display:flex;gap:8px;justify-content:flex-end}footer{padding:16px 20px;border-top:1px solid var(--w-border)}
</style>