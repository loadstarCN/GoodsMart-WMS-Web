<script lang="ts" setup>
/**
 * 入库单列表：页签是入库的工作队列（按 inbound_stage：预计到货 / 在途 / 待收货 / 分拣 / 待上架 / 异常 / 已完成 / 已关闭），
 * 入库单状态（status）在右边的下拉里另选，两个条件可以一起用。每行显示入库阶段、承运商与运单号。
 */
import { INBOUND_STAGE_TABS } from '~/composables/asn/inboundFlow'

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t } = useI18n();
const { bizErrorMessage } = useBizError();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.ASN'),
  list: [t('nav.warehouse'), t('nav.ASN')]
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
    const data = await httpRequest<PaginationData>('/api/warehouse/asn/', {
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


// 删除ASN
const deleteItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('asn.entity') }),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/asn/${item_id}`, {
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

// 激活ASN
const activeItem = async (item_id:Number) => {    
    await httpRequest(`/api/warehouse/asn/${item_id}`, {
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

// 禁用ASN
const closeItem = async (item_id:Number) => {    
    const data = await httpRequest(`/api/warehouse/asn/${item_id}/close/`, {
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

// 取消ASN（已签收、分拣尚未开始）：后端回滚签收库存、停用分拣任务并关闭单据；待处理的 ASN 用「关闭」
const cancelingId = ref<number | null>(null);
const cancelItem = async (item_id: number) => {
    if (cancelingId.value !== null) return;
    const confirmed = await showConfirm(
        t('asn.tips.cancel-confirm-title'),
        t('asn.tips.cancel-confirm', { id: item_id }),
        t('asn.operations.cancel'),
        t('button.dont-cancel'),
    );
    if (!confirmed) return;
    cancelingId.value = item_id;
    let done = false;
    let conflict = false;
    await httpRequest(`/api/warehouse/asn/${item_id}/cancel/`, {
        method: 'PUT',
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            // 16059 状态已变 / 16060 分拣已开始
            conflict = error.status === 409;
            showToast(bizErrorMessage(error), 'error')
        }
    })
    if (done) showToast(t('action-results.success'), 'success')
    // 成功或状态已变（409）：刷新列表
    if (done || conflict) await fetchData();
    cancelingId.value = null;
}

// 签收ASN
const receiveItem = async (item_id:Number) => {    
    const data = await httpRequest(`/api/warehouse/asn/${item_id}/receive/`, {
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


// 状态下拉（入库单状态 status）：空 = 全部
const setStatusFilter = (status: string | null) => {
  const query: Record<string, any> = { ...route.query }

  // 处理状态参数
  if (!status || status === 'all') {
    delete query.status
  } else {
    query.status = status
  }

  // 切换过滤条件时重置页码
  query.page = '1'
  
  router.push({ query })
}

// 页签：入库阶段（inbound_stage）；切换时重置页码
const setStageFilter = (stage: string | null) => {
  const query: Record<string, any> = { ...route.query }
  if (!stage || stage === 'all') {
    delete query.inbound_stage
  } else {
    query.inbound_stage = stage
  }
  query.page = '1'
  router.push({ query })
}

const activeStage = computed(() => {
  const stage = String(route.query.inbound_stage || '')
  return (INBOUND_STAGE_TABS as string[]).includes(stage) ? stage : 'all'
})

// 入库单状态（下拉，与阶段页签可以一起用）
const ASN_STATUSES = ['pending', 'received', 'completed', 'closed']
const activeStatus = computed(() => {
  const status = String(route.query.status || '')
  return ASN_STATUSES.includes(status) ? status : ''
})

// 6个月的统计数据
import { useChartMonthOptions } from '@/composables/chart/useChartMonthOptions';
const listViewOptions = useChartMonthOptions(6);
const listViewSeries = ref<any[]>([]);


const fetchMonthlyStatsData = async () => {
    loading.value = true;
    const data = await httpRequest('/api/warehouse/asn/monthly-stats', {
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
const statsData = ref<any[]>([]);
const fetchStatsData = async () => {
    loading.value = true;
    const data = await httpRequest('/api/warehouse/asn/status-overview-stats', {
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
                        {{ $t('asn.title') }} <span
                            class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total
                            }}</span>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <div class="d-flex flex-wrap gap-2">
                            <NuxtLink v-if="staffStore.hasPermission('asn_edit')" to="/asn/add" class="btn btn-primary btn-wave"><i
                                    class="ri-add-line me-1 fw-semibold align-middle"></i>{{t('asn.operations.add')}}</NuxtLink>
                        </div>
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('asn.form.placeholders.search')"
                                :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ $t('common.search')
                                }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                        <ul class="nav nav-pills nav-style-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeStage === 'all' }" href="javascript:void(0);"
                                    @click="setStageFilter('all')">{{t('common.status.all')}}</a>
                            </li>
                            <li class="nav-item" v-for="stage in INBOUND_STAGE_TABS" :key="stage">
                                <a class="nav-link" :class="{ active: activeStage === stage }" href="javascript:void(0);"
                                    @click="setStageFilter(stage)">{{ t(`asn.flow.stage.${stage}`) }}</a>
                            </li>
                        </ul>
                        <select class="form-select form-select-sm w-auto" :aria-label="t('shipping.dn.status-filter')"
                            :value="activeStatus" @change="setStatusFilter(($event.target as HTMLSelectElement).value)">
                            <option value="">{{ t('shipping.dn.status-filter') }}: {{ t('common.status.all') }}</option>
                            <option v-for="status in ASN_STATUSES" :key="status" :value="status">
                                {{ t('shipping.dn.status-filter') }}: {{ t('common.status.' + status) }}
                            </option>
                        </select>
                    </div>

                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered">
                            <thead>
                                <tr>
                                    <th scope="col" class="">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.entities.warehouse') }}</th>
                                    <!-- 表头与单元格的显示断点一致（否则中等宽度时列错位） -->
                                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.entities.supplier') }}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('common.fields.type') }}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{t('common.fields.quantity')}}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('common.fields.status') }}</th>
                                    <th scope="col">{{ t('asn.flow.stage-column') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('shipping.dn.carrier-tracking') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.updated') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.users.creator') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="asn in pageData?.items" class="invoice-list">
                                    <td class="">
                                        <NuxtLink :to="`/asn/detail/${asn?.id}`" class="text-default">ASN-{{ asn?.id }}
                                        </NuxtLink>
                                    </td>
                                    <td class="">
                                        <NuxtLink :to="`/warehouse/detail/${asn?.warehouse?.id}`" class="text-default">{{
                                            asn?.warehouse?.name }}
                                        </NuxtLink>
                                    </td>
                                    <td class="d-none d-md-table-cell">{{ asn?.supplier?.name }}</td>
                                    <td class="d-none d-xl-table-cell">{{ t('asn.type.'+asn?.asn_type) }}</td>
                                    <td class="d-none d-xl-table-cell">{{ t('common.units.sku-count', { n: $n(asn?.detail_count ?? 0) }, Number(asn?.detail_count) || 0) }}<br>{{
                                        t('common.units.pcs-count', { n: $n(asn?.total_quantity ?? 0) }, Number(asn?.total_quantity) || 0) }}</td>
                                    <td class="d-none d-xl-table-cell">{{ t('common.status.'+asn?.status.replace('_',"-")) }}</td>
                                    <td><InboundStageBadge :stage="asn?.inbound_stage" /></td>
                                    <td class="d-none d-lg-table-cell">
                                        <div v-if="asn?.carrier?.name">{{ asn.carrier.name }}</div>
                                        <div class="font-monospace fs-12 text-muted" v-if="asn?.tracking_number">{{ asn.tracking_number }}</div>
                                        <span class="text-muted" v-if="!asn?.carrier?.name && !asn?.tracking_number">—</span>
                                    </td>

                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(asn?.updated_at, undefined, asn) }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ asn?.creator?.user_name }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink :to="`/asn/edit/${asn?.id}`" class="btn btn-icon btn-sm btn-success-light product-btn" v-if="(asn.status==='pending') && staffStore.hasPermission('asn_edit')"><i class="ri-edit-line"></i></NuxtLink>
                                            <NuxtLink  href="javascript:void(0);" class="btn btn-icon btn-sm btn-primary-light product-btn" v-if="(asn.status==='pending') && staffStore.hasPermission('asn_receive', 'asn_edit')" :title="t('asn.operations.receive')" @click="receiveItem(asn.id)"><i  class="ri-checkbox-line"></i></NuxtLink>
                                            <NuxtLink :to="`/sorting/?asn_id=${asn.id}`" class="btn btn-icon btn-sm btn-primary-light product-btn" v-if="asn.status==='received'" :title="t('asn.operations.sorting')"><i class="ri-list-check-3"></i></NuxtLink>
                                            <button type="button" class="btn btn-icon btn-sm btn-danger-light product-btn" v-if="(asn.status==='received') && staffStore.hasPermission('asn_edit')"
                                                :title="t('asn.operations.cancel')" :disabled="cancelingId !== null" @click="cancelItem(asn.id)">
                                                <span v-if="cancelingId === asn.id" class="spinner-border spinner-border-sm"></span>
                                                <i v-else class="ri-arrow-go-back-line"></i>
                                            </button>
                                            <NuxtLink href="javascript:void(0);" @click="closeItem(asn.id)" class="btn btn-icon btn-sm btn-info-light product-btn" v-if="(asn.status==='pending') && staffStore.hasPermission('asn_edit')" :title="t('button.close')"><i class="ri-close-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(asn.id)" class="btn btn-icon btn-sm btn-danger-light product-btn" v-if="(asn.status==='pending') && staffStore.hasPermission('asn_delete')"><i class="ri-delete-bin-line"></i></NuxtLink>
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
