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
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    await httpRequest<PaginationData>('/api/warehouse/company/', {
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
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('admin.tenants.entity') }), t('button.confirm'), t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/company/${item_id}`, {
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
    await httpRequest(`/api/warehouse/company/${item_id}`, {
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
    await httpRequest(`/api/warehouse/company/${item_id}`, {
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
                        {{ t('admin.tenants.title') }} <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2">
                            <NuxtLink to="/admin/tenants/add" class="btn btn-primary btn-wave"><i class="ri-add-line me-1 fw-semibold align-middle"></i>{{ t('admin.tenants.operations.add') }}</NuxtLink>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ t('common.search') }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div>
                        <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'active' }" href="javascript:void(0);" @click="setActiveFilter(true)">{{ t('common.status.active') }}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'inactive' }" href="javascript:void(0);" @click="setActiveFilter(false)">{{ t('common.status.inactive') }}</a>
                            </li>
                        </ul>
                    </div>

                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered table-hover">
                            <thead>
                                <tr>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.fields.name') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.fields.email') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.fields.phone') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('admin.tenants.fields.expired-at') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.created') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="company in pageData?.items" :key="company?.id" class="invoice-list">
                                    <td class="d-none d-md-table-cell">{{ company?.id }}</td>
                                    <td>
                                      <NuxtLink :to="`/admin/tenants/${company?.id}`">{{ company?.name }}</NuxtLink>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ company?.email }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ company?.phone }}</td>
                                    <td class="d-none d-xxl-table-cell">
                                      <span v-if="company?.expired_at" :class="new Date(company.expired_at) < new Date() ? 'text-danger' : ''">
                                        {{ $dayjs(company?.expired_at, 'YYYY-MM-DD') }}
                                      </span>
                                      <span v-else class="text-muted">-</span>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(company?.created_at) }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink :to="`/admin/tenants/${company?.id}`" class="btn btn-icon btn-sm btn-success-light product-btn"><i class="ri-edit-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="inactiveItem(company.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-if="activeTab === 'active'"><i class="ri-eye-off-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="activeItem(company.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-else><i class="ri-eye-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(company.id)" class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
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
