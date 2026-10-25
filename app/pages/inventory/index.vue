<script lang="ts" setup>
import { pendingPutaway } from '~/composables/inventory/putawayStock'

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.inventory'),
  list: [t('nav.warehouse'), t('nav.inventory')]
}));

const router = useRouter();
let route = useRoute();
let loading = ref(true);
let keyword = ref("");
let pageData = ref<PaginationData | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/inventory/', {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
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
    await Promise.all([fetchData(), fetchPendingSummary()]);
});

async function search() {
    await router.push({ query: { ...route.query, keyword: keyword.value.trim(),page:1 } });
}
onMounted(async() => {
    fetchData();
    fetchPendingSummary();
});

// ------------------ 待上架（分拣完成、还没上到库位：sorted_stock > 0） ----------------------
// 列表参数 pending_putaway=1 只返回有待上架的库存，每行带 pending_since（最早一件待上架的进入时刻，推算不出时没有）。
// 页签徽标（件数）与页签内的汇总读 GET /inventory/pending-putaway/summary：范围同列表（页头仓库走请求头，company_id 同列表），
// 不按搜索词筛
const pendingTab = computed(() => route.query.pending_putaway === '1');

interface PendingPutawaySummary {
    warehouse_id: number | null
    /** 有待上架的库存行数 */
    inventory_count: number
    /** 商品种数 */
    goods_count: number
    /** 待上架合计（件）= 良品 + 破损 */
    total_quantity: number
    damaged_quantity: number
    good_quantity: number
    /** 超期的天数（后端默认 3） */
    overdue_days: number
    /** 进入待上架超过 overdue_days 天的件数（先进先上估算） */
    overdue_quantity: number
    overdue_inventory_count: number
    /** 最早一件待上架的进入时刻（UTC）；没有待上架 / 推算不出时 null */
    oldest_pending_since: string | null
}
const pendingSummary = ref<PendingPutawaySummary | null>(null);

const fetchPendingSummary = async () => {
    await httpRequest<PendingPutawaySummary>('/api/warehouse/inventory/pending-putaway/summary', {
        method: 'GET',
        params: { company_id: route.query.company_id || undefined },
        onSuccess: (data) => {
            pendingSummary.value = data;
        },
        onError: () => {
            pendingSummary.value = null;
        },
    });
};

/** 页签徽标：待上架件数 */
const pendingCount = computed(() => Number(pendingSummary.value?.total_quantity) || 0);
const overdueQuantity = computed(() => Number(pendingSummary.value?.overdue_quantity) || 0);

const setPendingTab = (pending: boolean) => {
    const query: Record<string, any> = { ...route.query, page: '1' };
    if (pending) query.pending_putaway = '1';
    else delete query.pending_putaway;
    router.push({ query });
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 待上架页签的行：拆成良品 / 破损；days = 停留了几整天（没有 pending_since 时 null），
 * overdue = 停留超过汇总的 overdue_days 天（同后端的超期口径）
 */
const pendingRows = computed(() => {
    const now = Date.now();
    const overdueDays = pendingSummary.value ? Number(pendingSummary.value.overdue_days) : NaN;
    return (pageData.value?.items || []).map((inv: any) => {
        const since = inv?.pending_since ? parseDateTime(inv.pending_since) : null;
        const elapsed = since ? Math.max(0, now - since.getTime()) : null;
        return {
            inv,
            pending: pendingPutaway(inv)!,
            days: elapsed === null ? null : Math.floor(elapsed / DAY_MS),
            overdue: elapsed !== null && Number.isFinite(overdueDays) && elapsed > overdueDays * DAY_MS,
        };
    });
});

/** 进入商品详情并打开上架弹窗 */
const putawayLink = (inv: any) => ({
    path: `/goods/detail/${inv.goods?.id ?? inv.goods_id}`,
    query: { tab: 'putaway', putaway: 'open' },
});


/** 低于补货阈值：阈值不是 -1（未设置）且可售库存 < 阈值（同后端 check_stock_thresholds） */
const thresholdSet = (value: unknown) => value !== null && value !== undefined && Number(value) !== -1;
const belowLowThreshold = (inv: any) =>
    thresholdSet(inv?.low_stock_threshold) && Number(inv?.available_stock_for_sale) < Number(inv.low_stock_threshold);
/** 高于积压阈值：阈值不是 -1 且可售库存 > 阈值 */
const aboveHighThreshold = (inv: any) =>
    thresholdSet(inv?.high_stock_threshold) && Number(inv?.available_stock_for_sale) > Number(inv.high_stock_threshold);

// 根据子项计算的总库存，用于显示数据有问题提示
function calculateTotalStock(inventory: any) {
    if (!inventory) return 0;
    // 计算总库存
    return (
        inventory.onhand_stock +
        inventory.damage_stock +
        inventory.return_stock +
        inventory.received_stock +
        inventory.sorted_stock + 
        inventory.picked_stock +
        inventory.packed_stock
    );
}

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
                        {{ $t('inventory.title') }} <span
                            class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ pageData?.total
                            }}</span>
                    </div>
                    <div class="d-flex">
                        <div class="d-flex" role="search">
                            <input class="form-control me-2" type="search" :placeholder="t('common.search-placeholder')"
                                :aria-label="t('common.search')" v-model="keyword" style="width: auto;">
                            <button class="btn btn-light" type="submit" @click="search">{{ $t('common.search')
                                }}</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <ul class="nav nav-pills nav-style-3 mb-3" role="tablist">
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: !pendingTab }" href="javascript:void(0);" @click="setPendingTab(false)">{{ t('inventory.tabs.all') }}</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: pendingTab }" href="javascript:void(0);" @click="setPendingTab(true)">
                                {{ t('inventory.tabs.pending-putaway') }}
                                <span class="badge bg-warning ms-1" v-if="pendingCount" :title="t('inventory.pending.badge-title', { count: pendingCount })">{{ $n(pendingCount) }}</span>
                            </a>
                        </li>
                    </ul>

                    <!-- 待上架：上方一行汇总；每行拆良品 / 破损、停留天数，可直接去上架 -->
                    <template v-if="pendingTab">
                        <div class="alert alert-warning-transparent fs-13 py-2 d-flex flex-wrap align-items-center column-gap-3 row-gap-1" v-if="pendingSummary && pendingCount > 0">
                            <span><i class="ri-error-warning-line me-1"></i>{{ t('inventory.pending.summary.goods', { n: $n(Number(pendingSummary.goods_count) || 0) }) }}</span>
                            <span>{{ t('inventory.pending.summary.quantity', {
                                total: $n(pendingCount),
                                good: $n(Number(pendingSummary.good_quantity) || 0),
                                damaged: $n(Number(pendingSummary.damaged_quantity) || 0),
                            }) }}</span>
                            <span :class="overdueQuantity > 0 ? 'text-danger fw-semibold' : 'text-muted'">
                                <i class="ri-time-line me-1" v-if="overdueQuantity > 0"></i>{{ t('inventory.pending.summary.overdue', { days: pendingSummary.overdue_days, n: $n(overdueQuantity) }) }}
                            </span>
                            <span class="text-muted" v-if="pendingSummary.oldest_pending_since">{{ t('inventory.pending.summary.oldest', { time: $dayjs(pendingSummary.oldest_pending_since, 'YYYY-MM-DD HH:mm', pendingSummary) }) }}</span>
                        </div>
                        <div class="table-responsive">
                            <table class="table text-nowrap table-bordered">
                                <thead>
                                    <tr>
                                        <th scope="col">{{ $t('common.entities.goods') }}</th>
                                        <th scope="col" class="d-none d-md-table-cell">{{ $t('common.entities.warehouse') }}</th>
                                        <th scope="col" class="text-end">{{ t('inventory.pending.total') }}</th>
                                        <th scope="col" class="text-end">{{ t('inventory.pending.good') }}</th>
                                        <th scope="col" class="text-end">{{ t('inventory.pending.damaged') }}</th>
                                        <th scope="col" class="text-end">{{ t('inventory.pending.dwell') }}</th>
                                        <th scope="col">{{ t('common.fields.action') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="row in pendingRows" :key="`${row.inv.goods_id}-${row.inv.warehouse_id}`">
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="me-2 lh-1">
                                                    <span class="avatar avatar-md me-2">
                                                        <img :src="row.inv.goods?.thumbnail_url" alt="" v-if="row.inv.goods?.thumbnail_url">
                                                        <img src="/images/goods/default.png" alt="" v-else>
                                                    </span>
                                                </div>
                                                <div>
                                                    <p class="mb-0 fw-semibold">
                                                        <NuxtLink :to="`/goods/detail/${row.inv.goods?.id}`" class="text-wrap">{{ row.inv.goods?.name }}</NuxtLink>
                                                    </p>
                                                    <p class="mb-0 fs-11 text-muted">{{ row.inv.goods?.code }}</p>
                                                    <p class="mb-0 fs-11 text-muted d-md-none">@{{ row.inv.warehouse?.name }}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="d-none d-md-table-cell">{{ row.inv.warehouse?.name }}</td>
                                        <td class="text-end fw-semibold text-warning">{{ $n(row.pending.total) }}</td>
                                        <td class="text-end">{{ $n(row.pending.good) }}</td>
                                        <td class="text-end">
                                            <span :class="row.pending.damaged > 0 ? 'text-danger fw-semibold' : 'text-muted'">{{ $n(row.pending.damaged) }}</span>
                                        </td>
                                        <td class="text-end">
                                            <span v-if="row.days !== null" :class="{ 'text-danger fw-semibold': row.overdue }"
                                                :title="t('inventory.pending.dwell-since', { time: $dayjs(row.inv.pending_since, 'YYYY-MM-DD HH:mm', row.inv) })">
                                                {{ row.days > 0 ? t('inventory.pending.dwell-days', { n: $n(row.days) }, row.days) : t('inventory.pending.dwell-under-day') }}
                                            </span>
                                            <span class="text-muted" v-else>—</span>
                                        </td>
                                        <td>
                                            <NuxtLink :to="putawayLink(row.inv)" class="btn btn-sm btn-primary-light">
                                                <i class="ri-inbox-archive-line me-1"></i>{{ t('common.inventory-ops.putaway') }}
                                            </NuxtLink>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <div class="text-center p-5 border border-top-0" v-if="pendingRows.length == 0">{{ t('inventory.pending.empty') }}</div>
                        </div>
                    </template>

                    <div class="table-responsive" v-else>
                        <table class="table text-nowrap table-bordered">
                            <thead>
                                <tr>
                                    <th scope="col">{{ $t('common.entities.goods') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{ $t('common.entities.warehouse')
                                        }}</th>
                                    <th scope="col">{{ $t('inventory.fields.total') }}
                                        <HelpIcon :title="$t('inventory.tooltips.total')" /></th>
                                    <th scope="col">{{ $t('inventory.fields.asn') }}
                                        <HelpIcon :title="$t('inventory.tooltips.asn')" />
                                    </th>
                                    <th scope="col">{{ $t('inventory.fields.received') }}
                                        <HelpIcon :title="$t('inventory.tooltips.received')" />
                                    </th>
                                    <th scope="col">{{ $t('inventory.fields.sorted') }}</th>
                                    <th scope="col">{{$t('inventory.fields.onhand') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.locked') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.damage') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.return') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.sale') }}<HelpIcon :title="$t('inventory.tooltips.sale')" /></th>
                                    <th scope="col">{{ $t('inventory.fields.available') }}<HelpIcon :title="$t('inventory.tooltips.available')" /></th>
                                    <th scope="col">{{ $t('inventory.fields.dn') }}
                                        <HelpIcon :title="$t('inventory.tooltips.dn')" />
                                    </th>
                                    <th scope="col">{{ $t('inventory.fields.picked') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.packed') }}</th>
                                    <th scope="col">{{ $t('inventory.fields.delivered') }}</th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{
                                        $t('inventory.thresholds.low') }}
                                        <HelpIcon :title="$t('inventory.tooltips.low-threshold')" />
                                    </th>
                                    <th scope="col" class="d-none d-xxl-table-cell">{{
                                        $t('inventory.thresholds.high') }}
                                        <HelpIcon :title="$t('inventory.tooltips.high-threshold')" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="inventory in pageData?.items" class="invoice-list">
                                    <!-- {{ inventory }} -->
                                    <td>
                                        <!-- {{ inventory.goods }} -->
                                        <div class="d-flex align-items-center">
                                            <div class="me-2 lh-1">
                                                <span class="avatar avatar-xxl me-2">
                                                    <NuxtLink :to="`/goods/detail/${inventory.goods?.id}`">
                                                        <img :src="inventory.goods?.thumbnail_url" alt=""
                                                            v-if="inventory.goods?.thumbnail_url">
                                                        <img src="/images/goods/default.png" alt="" v-else>
                                                    </NuxtLink>
                                                </span>
                                            </div>
                                            <div>
                                                <p class="mb-0 fw-semibold">
                                                    <NuxtLink :to="`/goods/detail/${inventory.goods?.id}`"
                                                        class="text-wrap">{{ inventory.goods?.name }}</NuxtLink>
                                                </p>
                                                <p class="mb-0 fs-11 text-muted">{{ inventory.goods?.code }}</p>
                                                <p class="mb-0 fs-11 text-muted d-xxl-none">@<NuxtLink
                                                        :to="`/warehouse/detail/${inventory.warehouse?.id}`"
                                                        class="text-default text-wrap">{{ inventory.warehouse?.name }}
                                                    </NuxtLink>
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">
                                        <NuxtLink :to="`/warehouse/detail/${inventory.warehouse?.id}`"
                                            class="text-default text-wrap">{{
                                            inventory.warehouse?.name }}
                                        </NuxtLink>
                                    </td>
                                    <td class="bg-primary-transparent">
                                        {{ inventory.total_stock }}
                                        <!-- <span v-if="calculateTotalStock(inventory) !== inventory.total_stock"
                                            class="text-danger fs-12">
                                            ({{ inventory.total_stock-calculateTotalStock(inventory) }})
                                            <i class="fa-solid fa-triangle-exclamation"></i>
                                        </span> -->
                                    </td>
                                    <td class="bg-success-transparent">{{ inventory.asn_stock }}</td>
                                    <td class="bg-success-transparent">{{ inventory.received_stock }}</td>
                                    <td class="bg-success-transparent">
                                        {{ inventory.sorted_stock }}
                                        <div class="fs-11 text-danger" v-if="Number(inventory.sorted_damage_stock) > 0">{{ t('inventory.pending.damaged-part', { n: inventory.sorted_damage_stock }) }}</div>
                                    </td>
                                    <td class="bg-danger-transparent">{{ inventory.onhand_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.locked_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.damage_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.return_stock }}</td>
                                    <!-- 库存预警与后端一致（inventory/services.py check_stock_thresholds）：按可售库存比阈值，阈值 -1 = 不预警 -->
                                    <td class="bg-danger-transparent">
                                        {{ inventory.available_stock_for_sale }}
                                        <span class="text-danger fs-12" v-if="belowLowThreshold(inventory)">({{
                                            $t('inventory.thresholds.low-stock') }})<i
                                                class="fa-solid fa-triangle-exclamation"></i></span>
                                        <span class="text-danger fs-12" v-if="aboveHighThreshold(inventory)">({{
                                            $t('inventory.thresholds.high-stock') }})<i
                                                class="fa-solid fa-triangle-exclamation"></i></span>
                                    </td>
                                        <td class="bg-danger-transparent">{{ inventory.available_stock }}</td>
                                    <td class="bg-info-transparent">{{ inventory.dn_stock }}</td>
                                    <td class="bg-info-transparent">{{ inventory.picked_stock }}</td>
                                    <td class="bg-info-transparent">{{ inventory.packed_stock }}</td>
                                    <td class="bg-info-transparent">{{ inventory.delivered_stock }}</td>
                                    <td class="bg-warning-transparent d-none d-xxl-table-cell">{{
                                        inventory.low_stock_threshold }}</td>
                                    <td class="bg-warning-transparent d-none d-xxl-table-cell">{{
                                        inventory.high_stock_threshold }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="text-center p-5 border border-top-0" v-if="pageData?.items?.length==0">{{
                            t('common.status.nothing-show')}}</div>
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
    </div>
    <!-- End::row-1 -->
</template>

<style scoped></style>
