<script lang="ts" setup>
import { countryName } from '~/data/countries'

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t, locale } = useI18n();
const { bizErrorMessage } = useBizError();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}));

const router = useRouter();
// 按权限显示新建 / 编辑 / 删除（鉴权仍以后端为准）
const staffStore = useStaffStore();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/goods/', {
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
    await router.push({ query: { ...route.query, keyword: keyword.value.trim(),page:1 } });
}
onMounted(async() => {
    fetchData();
});

// 删除商品
const deleteItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('goods.entity') }),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/goods/${item_id}`, {
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

// 激活商品
const activeItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/goods/${item_id}`, {
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
    await httpRequest(`/api/warehouse/goods/${item_id}`, {
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

// 原产国未录入筛选（origin_missing=true）
const originMissing = computed(() => route.query.origin_missing === 'true')
const toggleOriginMissing = () => {
  const query: Record<string, any> = { ...route.query }
  if (originMissing.value) {
    delete query.origin_missing
  } else {
    query.origin_missing = 'true'
  }
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
                        {{ $t('goods.title') }} <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2" >
                            <NuxtLink v-if="staffStore.hasPermission('goods_edit')" to="/goods/add" class="btn btn-primary btn-wave"><i class="ri-add-line me-1 fw-semibold align-middle"></i>{{ $t('goods.operations.add') }}</NuxtLink>
                            <NuxtLink v-if="staffStore.hasPermission('goods_add', 'goods_edit')" to="/goods/upload" class="btn btn-secondary btn-wave"><i class="ri-upload-line me-1 fw-semibold align-middle"></i>{{ $t('button.upload') }}</NuxtLink>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ $t('common.search') }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
                        <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'active' }" href="javascript:void(0);" @click="setActiveFilter(true)">{{ t('common.status.active') }}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'inactive' }" href="javascript:void(0);" @click="setActiveFilter(false)">{{ t('common.status.inactive') }}</a>
                            </li>
                        </ul>
                        <button type="button" class="btn btn-sm mb-3" :class="originMissing ? 'btn-warning' : 'btn-outline-warning'"
                            :aria-pressed="originMissing" @click="toggleOriginMissing">
                            <i :class="originMissing ? 'ri-checkbox-line' : 'ri-checkbox-blank-line'" class="me-1"></i>{{ t('goods.filters.origin-missing') }}
                        </button>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered table-hover">
                            <thead>
                                <tr>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ $t('goods.fields.name') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('goods.fields.manufacturer') }}</th>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('goods.fields.brand') }}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('goods.fields.category') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('goods.fields.origin-country') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.updated') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.users.creator') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                
                                <tr v-for="goods in pageData?.items" class="invoice-list">
                                    <td class="d-none d-md-table-cell">{{ goods?.id }}</td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <div class="me-2 lh-1">
                                                <span class="avatar avatar-xxl me-2">
                                                  <NuxtLink :to="`/goods/detail/${goods?.id}`">
                                                    <img :src="goods?.thumbnail_url" alt="" v-if="goods?.thumbnail_url">
                                                    <img src="/images/goods/default.png" alt="" v-else>
                                                  </NuxtLink>
                                                </span>
                                            </div>
                                            <div>
                                                <p class="mb-0 fs-11 d-md-none">{{ goods?.brand }}</p>
                                                <p class="mb-0 fw-semibold"><NuxtLink :to="`/goods/detail/${goods?.id}`" class="text-wrap">{{ goods?.name }}</NuxtLink></p>
                                                <p class="mb-0 fs-11 text-muted">{{ goods?.code }}</p>
                                                <p class="mb-0 fs-11 d-lg-none">{{ goods?.manufacturer }}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="d-none d-lg-table-cell">{{ goods?.manufacturer }}</td>
                                    <td class="d-none d-md-table-cell">{{ goods?.brand }}</td>
                                    <td class="d-none d-xl-table-cell">{{ goods?.category }}</td>
                                    <td class="d-none d-lg-table-cell">
                                        <!-- 列表模型没带该字段（undefined）时不显示，null 才是「未录入」 -->
                                        <span v-if="goods?.origin_country" :title="countryName(goods.origin_country, locale)">{{ String(goods.origin_country).toUpperCase() }}</span>
                                        <span class="badge bg-warning-transparent" v-else-if="goods && goods.origin_country === null">{{ t('goods.tips.origin-missing') }}</span>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(goods?.updated_at) }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ goods?.creator?.user_name }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">                                            
                                            <NuxtLink v-if="staffStore.hasPermission('goods_edit')" :to="`/goods/edit/${goods?.id}`" class="btn btn-icon btn-sm btn-success-light product-btn"><i class="ri-edit-line" ></i></NuxtLink>
                                            <NuxtLink :to="`/inventory/?goods_id=${goods?.id}`" class="btn btn-icon btn-sm btn-secondary-light product-btn"><i class="ri-archive-drawer-line" :title="t('goods.operations.view-inventory')"></i></NuxtLink>
                                            
                                            <NuxtLink href="javascript:void(0);" @click="inactiveItem(goods.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-if="activeTab === 'active'"><i class="ri-eye-off-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="activeItem(goods.id)" class="btn btn-icon btn-sm btn-warning-light product-btn" v-else><i class="ri-eye-line"></i></NuxtLink>
                                            <NuxtLink v-if="staffStore.hasPermission('goods_delete')" href="javascript:void(0);" @click="deleteItem(goods.id)" class="btn btn-icon btn-sm btn-danger-light product-btn"><i class="ri-delete-bin-line"></i></NuxtLink>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length==0">{{ t('common.status.nothing-show') }}</div>
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
