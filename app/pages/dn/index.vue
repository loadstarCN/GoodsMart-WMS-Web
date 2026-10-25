<script lang="ts" setup>
/**
 * 出库单列表：页签是发货的工作队列（按 shipping_stage：作业中 / 待建运单 / 待导回 / 待揽收 / 待交承运商 / 运输中 / 异常 /
 * 已签收 / 已关闭），出库单状态（status）在右边的下拉里另选，两个条件可以一起用。每行显示发货阶段、承运商与运单号。
 * 「待建运单」「待导回」两个页签有文件方式的批量操作（有运单方式 = 文件的承运商时才显示）：勾选出库单 →
 * 「导出文件」（勾选的要是同一家文件方式的承运商；有问题的行整批不导出，列出逐行问题）/「导回运单号」（选承运商 + 预览 → 确认）；
 * 旁边是该承运商最近的导出 / 导入文件。
 */
import { FILE_BATCH_STAGES, SHIPPING_STAGE_TABS } from '~/composables/shipping/shippingFlow'
import {
  CARRIER_FILE_BIZ_CODES,
  exportCarrierFile,
  exportProblemRows,
  type ExportProblemRow,
  type FileCarrierOption,
} from '~/composables/shipping/carrierFile'
import type { HttpRequestError } from '~/utils/http'

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t } = useI18n();
const { bizErrorMessage } = useBizError();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.DN'),
  list: [t('nav.warehouse'), t('nav.DN')]
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
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('dn.entity') }),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/dn/${item_id}`, {
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

// 取消DN（处理中 / 已拣货 / 已打包未发货）：后端释放预占库存、停用相关任务并关闭单据，
// 已拣 / 已打包的货退回待上架（需要重新上架）；待处理的 DN 用「关闭」
const cancelingId = ref<number | null>(null);
/** 可以取消的状态（已发货 delivered / 已完成 completed 不能取消，后端 16052） */
const DN_CANCELLABLE_STATUSES = ['in_progress', 'picked', 'packed'];
const cancelItem = async (item_id: number, status?: string) => {
    if (cancelingId.value !== null) return;
    // 已拣 / 已打包：确认框说明货会退回待上架
    const picked = status === 'picked' || status === 'packed';
    const confirmed = await showConfirm(
        t('dn.tips.cancel-confirm-title'),
        t(picked ? 'dn.tips.cancel-confirm-picked' : 'dn.tips.cancel-confirm', { id: item_id }),
        t('dn.operations.cancel'),
        t('button.dont-cancel'),
    );
    if (!confirmed) return;
    cancelingId.value = item_id;
    let done = false;
    let conflict = false;
    await httpRequest(`/api/warehouse/dn/${item_id}/cancel/`, {
        method: 'PUT',
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            // 16052 状态已变 / 16053 拣货已开始 / 16110 有未结束的 FedEx 自动运单（要先在打包 / 配送任务的海外发货区取消运单）
            conflict = error.status === 409;
            if (error.code === 16110) {
                showAlert(t('dn.tips.cancel-confirm-title'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    if (done) showToast(t('action-results.success'), 'success')
    // 成功或状态已变（409）：刷新列表
    if (done || conflict) await fetchData();
    cancelingId.value = null;
}

// 页签：发货阶段（shipping_stage）；切换时重置页码
const setStageFilter = (stage: string | null) => {
  const query: Record<string, any> = { ...route.query }
  if (!stage || stage === 'all') {
    delete query.shipping_stage
  } else {
    query.shipping_stage = stage
  }
  query.page = '1'
  router.push({ query })
}

const activeStage = computed(() => {
  const stage = String(route.query.shipping_stage || '')
  return (SHIPPING_STAGE_TABS as string[]).includes(stage) ? stage : 'all'
})

// ------------------ 文件方式的批量操作（待建运单：导出；待导回：导回运单号） ----------------------
/** 运单方式 = 文件的承运商（启用中的） */
const fileCarriers = ref<FileCarrierOption[]>([])
const loadFileCarriers = async () => {
    await httpRequest<any>('/api/warehouse/carrier/', {
        method: 'GET',
        params: { all: true },
        onSuccess: (data) => {
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
            fileCarriers.value = items
                .filter((c: any) => c && c.waybill_method === 'file' && c.is_active !== false)
                .map((c: any) => ({ id: Number(c.id), name: String(c.name || c.code || c.id) }))
        },
    })
}
/** 导出 / 导回要发货的权限（与建运单相同：打包或配送的编辑权限） */
const canShipEdit = computed(() => staffStore.hasPermission('packing_edit', 'delivery_edit'))
const batchMode = computed(() => (FILE_BATCH_STAGES as string[]).includes(activeStage.value)
    && fileCarriers.value.length > 0 && canShipEdit.value)

const selectedIds = ref<number[]>([])
const pageIds = computed<number[]>(() => (pageData.value?.items || []).map((dn: any) => Number(dn.id)))
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every((id: number) => selectedIds.value.includes(id)))
const toggleAll = () => {
    selectedIds.value = allSelected.value ? [] : [...pageIds.value]
}
const selectedRows = computed<any[]>(() => (pageData.value?.items || []).filter((dn: any) => selectedIds.value.includes(Number(dn.id))))
/** 这一行的承运商：当前发货任务的（shipping.carrier_id），没有用 DN 的 */
const rowCarrierId = (dn: any): number | null => {
    const id = dn?.shipping?.carrier_id ?? dn?.carrier_id ?? dn?.carrier?.id
    return id === null || id === undefined || id === '' ? null : Number(id)
}
const rowCarrierName = (dn: any): string => String(dn?.shipping?.carrier_name || dn?.carrier?.name || '')
/** 勾选的出库单共同的文件方式承运商（不是同一家 / 不是文件方式时 null） */
const selectedFileCarrier = computed<FileCarrierOption | null>(() => {
    const ids = [...new Set(selectedRows.value.map(rowCarrierId))]
    if (ids.length !== 1 || ids[0] === null) return null
    return fileCarriers.value.find((c: FileCarrierOption) => c.id === ids[0]) || null
})
const defaultFileCarrierId = computed<number | null>(() =>
    selectedFileCarrier.value?.id ?? (fileCarriers.value.length === 1 ? fileCarriers.value[0]!.id : null))
/** 勾选的出库单都在同一个仓库时传给后端（批次按仓库记） */
const selectedWarehouseId = computed<number | null>(() => {
    const ids = [...new Set(selectedRows.value.map((dn: any) => dn?.warehouse_id ?? dn?.warehouse?.id ?? null))]
    return ids.length === 1 && ids[0] !== null && ids[0] !== undefined ? Number(ids[0]) : null
})

const exporting = ref(false)
const exportProblems = ref<ExportProblemRow[]>([])
watch(() => route.query, () => {
    selectedIds.value = []
    exportProblems.value = []
})
const exportSelected = async () => {
    if (exporting.value || !selectedRows.value.length) return
    exportProblems.value = []
    const title = t('shipping.file.batch-export-title')
    const rows = selectedRows.value
    const noCarrier = rows.filter((dn: any) => rowCarrierId(dn) === null)
    if (noCarrier.length) {
        showAlert(title, t('shipping.file.batch-no-carrier', { dns: noCarrier.map((dn: any) => `DN-${dn.id}`).join(', ') }), 'warning')
        return
    }
    const carrierIds = [...new Set(rows.map(rowCarrierId))]
    if (carrierIds.length > 1) {
        const names = [...new Set(rows.map(rowCarrierName).filter(Boolean))]
        showAlert(title, t('shipping.file.batch-mixed-carriers', { carriers: names.join(t('shipping.list-separator')) || '—' }), 'warning')
        return
    }
    const carrier = selectedFileCarrier.value
    if (!carrier) {
        showAlert(title, t('shipping.file.batch-not-file', { carrier: rowCarrierName(rows[0]) || '—' }), 'warning')
        return
    }
    exporting.value = true
    let fileName: string | null = null
    try {
        fileName = await exportCarrierFile({
            carrier_id: carrier.id,
            dn_ids: rows.map((dn: any) => Number(dn.id)),
            warehouse_id: selectedWarehouseId.value,
        })
    } catch (e) {
        const error = e as HttpRequestError
        if (error.code === CARRIER_FILE_BIZ_CODES.EXPORT_PROBLEMS) exportProblems.value = exportProblemRows(error)
        if (!exportProblems.value.length) showToast(bizErrorMessage(error), 'error')
    } finally {
        exporting.value = false
    }
    if (fileName) {
        showToast(t('shipping.file.batch-exported-toast', { count: rows.length, file: fileName }), 'success')
        selectedIds.value = []
        await fetchData()
    }
}

const importOpen = ref(false)
const onImported = async () => {
    selectedIds.value = []
    await fetchData()
}

// 出库单状态（status）筛选：下拉
const DN_STATUSES = ['pending', 'in_progress', 'picked', 'packed', 'delivered', 'completed', 'closed']
const activeStatus = computed(() => {
  const status = String(route.query.status || '')
  return DN_STATUSES.includes(status) ? status : ''
})
const setStatusFilter = (status: string) => {
  const query: Record<string, any> = { ...route.query }
  if (!status) {
    delete query.status
  } else {
    query.status = status
  }
  query.page = '1'
  router.push({ query })
}

// 6个月的统计数据
import { useChartMonthOptions } from '@/composables/chart/useChartMonthOptions';
const listViewOptions = useChartMonthOptions(6);
const listViewSeries = ref<any[]>([]);


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
const statsData = ref<any[]>([]);
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
    loadFileCarriers();
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
                            <NuxtLink v-if="staffStore.hasPermission('dn_edit')" to="/dn/add" class="btn btn-primary btn-wave"><i
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
                    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                        <ul class="nav nav-pills nav-style-3" role="tablist">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeStage === 'all' }" href="javascript:void(0);"
                                    @click="setStageFilter('all')">{{t('common.status.all')}}</a>
                            </li>
                            <li class="nav-item" v-for="stage in SHIPPING_STAGE_TABS" :key="stage">
                                <a class="nav-link" :class="{ active: activeStage === stage }" href="javascript:void(0);"
                                    @click="setStageFilter(stage)">{{ t(`shipping.stage.${stage}`) }}</a>
                            </li>
                        </ul>
                        <select class="form-select form-select-sm w-auto" :aria-label="t('shipping.dn.status-filter')"
                            :value="activeStatus" @change="setStatusFilter(($event.target as HTMLSelectElement).value)">
                            <option value="">{{ t('shipping.dn.status-filter') }}: {{ t('common.status.all') }}</option>
                            <option v-for="status in DN_STATUSES" :key="status" :value="status">
                                {{ t('shipping.dn.status-filter') }}: {{ t('common.status.' + status.replace('_', '-')) }}
                            </option>
                        </select>
                    </div>

                    <!-- 文件方式的批量操作 -->
                    <div class="dn-file-batch d-flex flex-wrap align-items-center gap-2 mb-3" v-if="batchMode">
                        <span class="fs-13 text-muted">{{ t('shipping.file.batch-selected', { count: selectedIds.length }) }}</span>
                        <button type="button" class="btn btn-sm" :class="activeStage === 'awaiting_waybill' ? 'btn-primary' : 'btn-light'"
                            :disabled="!selectedIds.length || exporting" @click="exportSelected">
                            <span v-if="exporting" class="spinner-border spinner-border-sm me-1"></span>
                            <i v-else class="ri-file-download-line me-1"></i>{{ t('shipping.file.export-csv') }}
                        </button>
                        <button type="button" class="btn btn-sm" :class="activeStage === 'awaiting_number' ? 'btn-primary' : 'btn-light'"
                            @click="importOpen = true">
                            <i class="ri-file-upload-line me-1"></i>{{ t('shipping.actions.import_numbers') }}
                        </button>
                        <CarrierFileBatches class="ms-auto" :carriers="fileCarriers" :carrier-id="selectedFileCarrier?.id ?? null"
                            :warehouse-id="selectedWarehouseId" />
                        <div class="fs-12 text-muted w-100">{{ t(activeStage === 'awaiting_number' ? 'shipping.file.batch-hint-import' : 'shipping.file.batch-hint-export') }}</div>
                    </div>
                    <CarrierExportProblems class="mb-3" :rows="exportProblems" closable v-if="exportProblems.length"
                        @close="exportProblems = []" />

                    <div class="table-responsive">
                        <table class="table text-nowrap table-bordered">
                            <thead>
                                <tr>
                                    <th scope="col" class="dn-select-col" v-if="batchMode">
                                        <input class="form-check-input" type="checkbox" :checked="allSelected" :disabled="!pageIds.length"
                                            :aria-label="t('shipping.file.select-all')" @change="toggleAll">
                                    </th>
                                    <th scope="col" class="">{{ t('common.fields.id') }}</th>
                                    <th scope="col">{{ t('common.entities.warehouse') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.entities.recipient') }}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('common.fields.type') }}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{t('common.fields.quantity')}}</th>
                                    <th scope="col" class="d-none d-xl-table-cell">{{ t('common.fields.status') }}</th>
                                    <th scope="col">{{ t('shipping.dn.stage') }}</th>
                                    <th scope="col" class="d-none d-lg-table-cell">{{ t('shipping.dn.carrier-tracking') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.dates.updated') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ t('common.users.creator') }}</th>
                                    <th scope="col">{{ t('common.fields.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="dn in pageData?.items" class="invoice-list">
                                    <td class="dn-select-col" v-if="batchMode">
                                        <input class="form-check-input" type="checkbox" :value="Number(dn.id)" v-model="selectedIds"
                                            :aria-label="`DN-${dn.id}`">
                                    </td>
                                    <td class="">
                                        <NuxtLink :to="`/dn/detail/${dn?.id}`" class="text-default">DN-{{ dn?.id }}
                                        </NuxtLink>
                                    </td>
                                    <td class="">
                                        <NuxtLink :to="`/warehouse/detail/${dn?.warehouse?.id}`" class="text-default">{{
                                            dn?.warehouse?.name }}
                                        </NuxtLink>
                                    </td>
                                    <td class="d-none d-lg-table-cell">{{ dn?.recipient?.name }}</td>
                                    <td class="d-none d-xl-table-cell">{{ t('dn.type.'+dn?.dn_type) }}</td>
                                    <td class="d-none d-xl-table-cell">{{ $n(dn?.detail_count) }} SKUs<br>{{
                                        $n(dn?.total_quantity) }} PCS</td>
                                    <td class="d-none d-xl-table-cell">{{ t('common.status.'+dn?.status.replace('_',"-")) }}</td>
                                    <td><ShippingStageBadge :stage="dn?.shipping_stage" /></td>
                                    <td class="d-none d-lg-table-cell">
                                        <div v-if="dn?.shipping?.carrier_name || dn?.carrier?.name">{{ dn?.shipping?.carrier_name || dn?.carrier?.name }}</div>
                                        <div class="font-monospace fs-12 text-muted" v-if="dn?.shipping?.tracking_number">{{ dn.shipping.tracking_number }}</div>
                                        <span class="text-muted" v-if="!dn?.shipping?.carrier_name && !dn?.carrier?.name && !dn?.shipping?.tracking_number">—</span>
                                    </td>

                                    <td class="d-none d-xxl-table-cell">{{ $dayjs(dn?.updated_at, undefined, dn) }}</td>
                                    <td class="d-none d-xxl-table-cell">{{ dn?.creator?.user_name }}</td>
                                    <td>
                                        <div class="hstack gap-2 fs-15">
                                            <NuxtLink :to="`/dn/edit/${dn?.id}`"
                                                class="btn btn-icon btn-sm btn-success-light product-btn"
                                                v-if="(dn.status==='pending') && staffStore.hasPermission('dn_edit')"><i class="ri-edit-line"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="progressItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-primary-light product-btn" v-if="(dn.status===
                                            'pending') && staffStore.hasPermission('dn_edit')" :title="t('button.process')"><i class="ri-list-check-3"></i></NuxtLink>
                                            <NuxtLink href="javascript:void(0);" @click="closeItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-info-light product-btn" v-if="(dn.status===
                                            'pending') && staffStore.hasPermission('dn_edit')" :title="t('button.close')"><i class="ri-close-line"></i></NuxtLink>
                                            <button type="button" class="btn btn-icon btn-sm btn-danger-light product-btn" v-if="(DN_CANCELLABLE_STATUSES.includes(dn.status)) && staffStore.hasPermission('dn_edit')"
                                                :title="t('dn.operations.cancel')" :disabled="cancelingId !== null" @click="cancelItem(dn.id, dn.status)">
                                                <span v-if="cancelingId === dn.id" class="spinner-border spinner-border-sm"></span>
                                                <i v-else class="ri-arrow-go-back-line"></i>
                                            </button>
                                            <NuxtLink href="javascript:void(0);" @click="deleteItem(dn.id)"
                                                class="btn btn-icon btn-sm btn-danger-light product-btn" v-if="(dn.status===
                                            'pending') && staffStore.hasPermission('dn_delete')"><i class="ri-delete-bin-line"></i></NuxtLink>
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

    <CarrierImportModal v-model:open="importOpen" :carriers="fileCarriers" :carrier-id="defaultFileCarrierId"
        :warehouse-id="selectedWarehouseId" @imported="onImported" />
</template>

<style scoped>
.dn-select-col {
    width: 2.25rem;
}
</style>
