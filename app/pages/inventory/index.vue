<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
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
    await fetchData();
});

async function search() {
    await router.push({ query: { ...route.query, keyword: keyword.value.trim(),page:1 } });
}
onMounted(async() => {
    fetchData();
});


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
                    <div class="table-responsive">
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
                                                        :to="`/warehouse/${inventory.warehouse?.id}`"
                                                        class="text-default text-wrap">{{ inventory.warehouse?.name }}
                                                    </NuxtLink>
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="d-none d-xxl-table-cell">
                                        <NuxtLink :to="`/warehouse/${inventory.warehouse?.id}`"
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
                                        <span class="text-danger fs-12"
                                            v-if="inventory.low_stock_threshold > 0  && inventory.total_stock < inventory.low_stock_threshold">({{
                                            $t('inventory.thresholds.low-stock') }})<i
                                                class="fa-solid fa-triangle-exclamation"></i></span>
                                        <span class="text-danger fs-12"
                                            v-if="inventory.high_stock_threshold > 0  && inventory.total_stock > inventory.high_stock_threshold">({{
                                            $t('inventory.thresholds.high-stock') }})<i
                                                class="fa-solid fa-triangle-exclamation"></i></span>
                                    </td>
                                    <td class="bg-success-transparent">{{ inventory.asn_stock }}</td>
                                    <td class="bg-success-transparent">{{ inventory.received_stock }}</td>
                                    <td class="bg-success-transparent">{{ inventory.sorted_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.onhand_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.locked_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.damage_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.return_stock }}</td>
                                    <td class="bg-danger-transparent">{{ inventory.available_stock_for_sale }}</td>
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
