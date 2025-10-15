<script lang="ts" setup>


// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.department'),
  list: [t('nav.warehouse'), t('nav.department')]
}));
const staffStore = useStaffStore()
const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/department/', {
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
    return data;   
};

watch(() => route.query, async () => {
    await fetchData();
});

async function search() {
    await router.push({ query: { ...route.query, name: keyword.value.trim(),page:1 } });
}
onMounted(async() => {
    fetchData();
});

// 删除商品
const deleteItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm'),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/department/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();
                await staffStore.clearStaffInfo();
                await staffStore.getCurrentStaffInfo();
            },
            onError: (error) => {
                showToast(error.message, 'error')
            }
        })
    }
}

// 激活商品
const activeItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/department/${item_id}`, {
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

// 禁用商品
const inactiveItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/department/${item_id}`, {
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

// 处理标签切换
const setActiveFilter = (status: boolean | null) => {
  const query: Record<string, any> = { ...route.query }

  // 处理状态参数
  if (status === null) {
    delete query.is_active
  } else {
    query.is_active = String(status)
  }

  // 切换过滤条件时重置页码
  query.page = '1'
  
  router.push({ query })
}

// 修改：计算当前激活状态
const activeTab = computed(() => {
  const statusParam = route.query.is_active
  /* 
  逻辑对应关系：
  - 无参数 → 显示Active（根据接口默认行为）
  - true → 显示Active
  - false → 显示Inactive
  */
  return statusParam === 'false' ? 'inactive' : 'active'
})

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <!-- Start::row-1 -->
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
                        {{ $t('department.title') }} <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2" >
                            <NuxtLink to="/department/add" class="btn btn-primary btn-wave"><i class="ri-add-line me-1 fw-semibold align-middle"></i>{{ $t('department.operations.add') }}</NuxtLink>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ $t('common.search') }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div>
                        <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'active' }" href="javascript:void(0);" @click="setActiveFilter(true)">{{ $t('common.status.active') }}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'inactive' }" href="javascript:void(0);" @click="setActiveFilter(false)">{{ $t('common.status.inactive') }}</a>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered table-hover">
                            <thead>
                                <tr>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ $t('common.fields.name') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.updated') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.users.creator') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                
                                <tr v-for="department in pageData?.items" class="invoice-list">
                                    <td class="d-none d-md-table-cell">{{ department?.id }}</td>
                                    <td>
                                      <NuxtLink :to="`/department/detail/${department?.id}`">{{ department?.name }}</NuxtLink>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(department?.updated_at) }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ department?.creator?.user_name }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">                                            
                                            <NuxtLink :to="`/department/edit/${department?.id}`" class="btn btn-icon btn-sm btn-success-light product-btn"><i class="ri-edit-line" ></i></NuxtLink>
                                           
                                            <NuxtLink href="javascript:void(0);" @click="inactiveItem(department.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-if="activeTab === 'active'"><i class="ri-eye-off-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="activeItem(department.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-else><i class="ri-eye-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(department.id)" class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
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
  <!-- End::row-1 -->

</template>

<style scoped></style>
