<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.DN'),
  list: [t('nav.warehouse'), t('nav.DN')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/dn/', {
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


// 删除DN
const deleteItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm'),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/dn/${item_id}`, {
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

// 激活DN
const progressItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/dn/${item_id}/progress/`, {
        method: 'PUT',
        onSuccess: async() => {
            showToast(t('action-results.success'), 'success')
            await fetchData();            
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
}

// 禁用DN
const closeItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/dn/${item_id}/close/`, {
        method: 'PUT',
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
const setActiveFilter = (status: string | null) => {
  const query: Record<string, any> = { ...route.query }

  // 处理状态参数
  if (status === null) {
    delete query.status
  } else {
    if (status === 'all') {
      delete query.status
    } else {
      query.status = status
    }
  }

  // 切换过滤条件时重置页码
  query.page = '1'
  
  router.push({ query })
}

// 修改：计算当前激活状态
const activeTab = computed(() => {
  const statusParam = route.query.status
  if (statusParam === 'pending') {
    return 'pending'
  } else if (statusParam === 'in_progress') {
    return 'in_progress'
  } else if (statusParam === 'picked') {
  return 'picked'
  } else if (statusParam === 'packed') {
  return 'packed'
  } else if (statusParam === 'delivered') {
  return 'delivered'
  } else if (statusParam === 'completed') {
    return 'completed'
  } else if (statusParam === 'closed') {
    return 'closed'
  } else {
    return 'all' // 默认值
  }
})

// 6个月的统计数据
import { useUseChartMonthOptions } from '@/composables/chart/useChartMonthOptions';
const listViewOptions = useUseChartMonthOptions(6);
const listViewSeries = ref([]);


const fetchMonthlyStatsData = async () => {
    loading.value = true;
    const data = await httpRequest('/api/warehouse/dn/monthly-stats', {
        method: 'GET',
        params: {'months': 6},
        onSuccess: async(data) => {
            // 处理数据格式转换
            for (let i = 0; i < data.length; i++) {
                data[i].name = t('common.status.' + data[i].name.replace('_', '-').toLowerCase());
            }
            listViewSeries.value = data;
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

// 统计数据
const statsData = ref([]);
const fetchStatsData = async () => {
    loading.value = true;
    const data = await httpRequest('/api/warehouse/dn/status-overview-stats', {
        method: 'GET',
        params: route.query,
        onSuccess: async(data) => {
            statsData.value = data;
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

onMounted(async() => {
    fetchData();
    fetchStatsData();
    fetchMonthlyStatsData();
});

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
        <div class="col-xxl-9 col-xl-8">

            <div class="card custom-card">
                <div class="card-header justify-content-between">
                    <div class="card-title">
                        {{ $t('dn.title') }} <span
                            class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total
                            }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2">
                            <NuxtLink to="/dn/add" class="btn btn-primary btn-wave"><i
                                    class="ri-add-line me-1 fw-semibold align-middle"></i>{{ $t('dn.operations.add') }}</NuxtLink>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('dn.form.placeholders.search')"
                                :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ $t('common.search')
                                }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div>
                        <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'all' }" href="javascript:void(0);"
                                    @click="setActiveFilter('all')">{{t('common.status.all')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'pending' }"
                                    href="javascript:void(0);" @click="setActiveFilter('pending')">{{t('common.status.pending')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'in_progress' }"
                                    href="javascript:void(0);" @click="setActiveFilter('in_progress')">{{t('common.status.in-progress')}}</a>
                            </li>
                            
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'picked' }"
                                    href="javascript:void(0);" @click="setActiveFilter('picked')">{{t('common.status.picked')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'packed' }"
                                    href="javascript:void(0);" @click="setActiveFilter('packed')">{{t('common.status.packed')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'delivered' }"
                                    href="javascript:void(0);" @click="setActiveFilter('delivered')">{{t('common.status.delivered')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'completed' }"
                                    href="javascript:void(0);" @click="setActiveFilter('completed')">{{t('common.status.completed')}}</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'closed' }"
                                    href="javascript:void(0);" @click="setActiveFilter('closed')">{{t('common.status.closed')}}</a>
                            </li>

                        </ul>
                    </div>

                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered">
                            <thead>
                                <tr>
                                    <th scope="col" class="">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.entities.warehouse') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.entities.recipient') }}</th>
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.type') }}</th>
                                    <th scope="col" class="d-none d-md-table-cell">{{t('common.fields.quantity')}}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('common.fields.status') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.updated') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.users.creator') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="dn in pageData?.items" class="invoice-list">
                                    <td class="">
                                        <NuxtLink :to="`/dn/detail/${dn?.id}`" class="text-default">DN-{{ dn?.id }}
                                        </NuxtLink>
                                    </td>
                                    <td class="">
                                        <NuxtLink :to="`/warehouse/${dn?.warehouse?.id}`" class="text-default">{{
                                            dn?.warehouse?.name }}
                                        </NuxtLink>
                                    </td>
                                    <td class="d-none d-md-table-cell">{{ dn?.recipient?.name }}</td>
                                    <td class="d-none d-xl-table-cell">{{ t('dn.type.'+dn?.dn_type) }}</td>
                                    <td class="d-none d-xl-table-cell">{{ $n(dn?.detail_count) }} SKUs<br>{{
                                        $n(dn?.total_quantity) }} PCS</td>
                                    <td class="d-none d-xl-table-cell">{{ t('common.status.'+dn?.status.replace('_',"-")) }}</td>

                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(dn?.updated_at) }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ dn?.creator?.user_name }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink :to="`/dn/edit/${dn?.id}`"
                                                class="btn btn-icon btn-sm btn-success-light product-btn"
                                                v-if="dn.status==='pending'"><i class="ri-edit-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="progressItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-primary-light product-btn" v-if="dn.status===
                                            'pending'" :title="t('button.process')"><i class="ri-list-check-3"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="closeItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-info-light product-btn" v-if="dn.status===
                                            'pending'" :title="t('button.close')"><i class="ri-close-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-danger-light product-btn" v-if="dn.status===
                                            'pending'"><i class="ri-delete-bin-line"></i></NuxtLink>
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
                            <Pagination :page-size=pageData?.per_page :current-page=pageData?.page
                                :total=pageData?.total :params=$route.query v-if="pageData.pages > 1"></Pagination>
                        </template>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-xxl-3 col-xl-4">
            <div class="card custom-card">
                <div class="card-body p-0">

                    <div v-for="status in statsData" :key="status.name"
                        class="p-4 border-bottom border-block-end-dashed d-flex align-items-top">
                        <!-- 动态图标容器 -->
                        <div :class="`svg-icon-background bg-${getStatusColor(status.name)}-transparent me-4`">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                :class="`svg-${getStatusColor(status.name)}`">
                                <path :d="getIconPath(status.name)" />
                            </svg>
                        </div>

                        <!-- 动态内容区域 -->
                        <div class="flex-fill">
                            <h6 class="mb-2 fs-12">
                                {{t('common.status.' + status.name.replace('_', '-'))}}
                                <span :class="`badge bg-${getStatusColor(status.name)} fw-semibold float-end`">
                                    {{ formatNumber(status.last_year) }}
                                </span>
                            </h6>

                            <div class="pb-0 mt-0">
                                <div>
                                    <h4 class="fs-18 fw-semibold mb-2">
                                        <span class="count-up" :data-count="status.last_year">
                                            {{ formatNumber(status.current_month) }}
                                        </span>
                                        <span class="text-muted float-end fs-11 fw-normal">{{t('common.statistics.last-year')}}</span>
                                    </h4>

                                    <!-- 增长率计算 -->
                                    <p class="text-muted fs-11 mb-0 lh-1">
                                        <span :class="`text-${growthColor(status)} me-1 fw-semibold`">
                                            <i
                                                :class="`ri-arrow-${growthDirection(status)}-s-line me-1 align-middle`"></i>
                                            {{ growthRate(status) }}%
                                        </span>
                                        <span>{{t('common.statistics.this-month')}}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 pb-2">
                        <p class="fs-15 fw-semibold">{{t('common.statistics.title')}} <span class="text-muted fw-normal">({{t('common.statistics.last-n-months',6)}})
                                :</span></p>
                        <apexchart height="210" type="bar" :options="listViewOptions" :series="listViewSeries">
                        </apexchart>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- End::row-1 -->

</template>

<style scoped></style>
