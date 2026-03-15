<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();

const dataToPass = computed(() => ({
  current: t('admin.nav.roles'),
  list: [t('admin.title'), t('admin.nav.roles')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    await httpRequest<PaginationData>('/api/system/user/roles', {
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
    await router.push({ query: { ...route.query, keyword: keyword.value.trim(), page: 1 } });
}

onMounted(async() => {
    fetchData();
});

const deleteItem = async (item_id: Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('common.entities.role') }), t('button.confirm'), t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/system/user/roles/${item_id}`, {
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

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row d-flex justify-content-center mb-4" v-if="loading">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
  </div>
  <div class="row" v-else>
        <div class="col-xl-12">
            <div class="card custom-card">
                <div class="card-header justify-content-between">
                    <div class="card-title">
                        {{ t('admin.roles.title') }} <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ t('common.search') }}</button>
                        </div>
                        <NuxtLink to="/admin/roles/add" class="btn btn-primary btn-wave">
                            <i class="ri-add-line me-1"></i>{{ t('admin.roles.operations.add') }}
                        </NuxtLink>
                    </div>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered table-hover">
                            <thead>
                                <tr>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.fields.name') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.description') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('admin.roles.fields.permissions') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.created') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="role in pageData?.items" :key="role?.id" class="invoice-list">
                                    <td class="d-none d-md-table-cell">{{ role?.id }}</td>
                                    <td>{{ role?.name }}</td>
                                    <td class="d-none d-lg-table-cell">{{ role?.description || '-' }}</td>
                                    <td class="d-none d-xxl-table-cell">
                                      <span v-for="perm in role?.permissions?.slice(0, 5)" :key="perm" class="badge bg-light text-default me-1 mb-1">{{ perm }}</span>
                                      <span v-if="role?.permissions?.length > 5" class="badge bg-secondary-transparent">+{{ role.permissions.length - 5 }}</span>
                                      <span v-if="!role?.permissions?.length">-</span>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(role?.created_at) }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink :to="`/admin/roles/${role.id}`" class="btn btn-icon btn-sm btn-info-light product-btn"><i class="ri-edit-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(role.id)" class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length==0">{{ t('common.status.nothing-show')}}</div>
                    </div>
                </div>
                <div class="card-footer border-top-0">
                    <div class="d-flex align-items-center justify-content-between flex-wrap">
                        <template v-if="pageData">
                            <Pagination :page-size=pageData?.per_page
                                :current-page=pageData?.page
                                :total=pageData?.total
                                :params=$route.query
                                v-if="pageData.pages > 1"></Pagination>
                        </template>
                    </div>
                </div>
            </div>
        </div>
      </div>
</template>

<style scoped></style>
