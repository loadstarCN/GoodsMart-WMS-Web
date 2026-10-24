<script lang="ts" setup>
/**
 * 出库单详情：发货流程的主页。
 * - 页头：单号、订单号、状态、国内 / 跨境（目的国）、承运商、当前发货阶段，以及打印 / 编辑 / 关闭 / 取消
 * - 主区域：发货流程（DnShippingFlow full）——每一步的状态、实际时刻、来源和操作都在这里；
 *   跨境件的报关单证（CI / PL、报关问题、报关数据明细）在流程的「报关单证」一步里
 * - 下面是商品明细，右边是出库单资料（收件人、地址、计划发货日等）
 */
import { countryName } from '~/data/countries'
import type { ShippingFlow } from '~/composables/shipping/shippingFlow'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const dnId = String(route.params.id);

const itemData = ref<any>(null);
const { t, locale } = useI18n();
// 按权限显示操作按钮（鉴权仍以后端为准）
const staffStore = useStaffStore();
const { bizErrorMessage } = useBizError();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.DN'),
  list: [t('nav.warehouse'), t('nav.DN')]
}));

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/dn/${dnId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
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
});

// ------------------ 发货流程（页头的阶段、承运商、国内 / 跨境取流程接口的） ----------------------
const flowRef = ref<{ reload: () => Promise<void> } | null>(null);
const flowInfo = ref<ShippingFlow | null>(null);
const routeBadge = computed(() => {
  const r = flowInfo.value?.route;
  if (!r) return null;
  if (!r.international) return { cls: 'bg-secondary-transparent', icon: 'ri-map-pin-line', text: t('shipping.route.domestic') };
  const code = r.destination_country ? String(r.destination_country).toUpperCase() : '';
  const country = code ? `${code} ${countryName(code, locale.value)}` : '—';
  return { cls: 'bg-info-transparent', icon: 'ri-earth-line', text: t('shipping.route.international', { country }) };
});
/** 流程里做了操作（如完成发货、签收）：DN 的状态、数量随之变化 */
const onFlowChanged = () => {
    fetchData();
};

const closeDN = async () => {
    const data = await httpRequest(`/api/warehouse/dn/${dnId}/close/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.success'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    if (data) flowRef.value?.reload();
    return data;
};
// 取消DN（处理中 / 已拣货 / 已打包未发货）：后端释放预占库存、停用相关任务并关闭单据，
// 已拣 / 已打包的货退回待上架（需要重新上架）；待处理的 DN 用「关闭」；已发货 / 已完成不能取消（16052）
const canceling = ref(false);
const canCancel = computed(() => ['in_progress', 'picked', 'packed'].includes(String(itemData.value?.status || '')));
const cancelDN = async () => {
    if (canceling.value) return;
    // 已拣 / 已打包：确认框说明货会退回待上架
    const picked = itemData.value?.status === 'picked' || itemData.value?.status === 'packed';
    const confirmed = await showConfirm(
        t('dn.tips.cancel-confirm-title'),
        t(picked ? 'dn.tips.cancel-confirm-picked' : 'dn.tips.cancel-confirm', { id: dnId }),
        t('dn.operations.cancel'),
        t('button.dont-cancel'),
    );
    if (!confirmed) return;
    canceling.value = true;
    let done = false;
    let conflict = false;
    await httpRequest(`/api/warehouse/dn/${dnId}/cancel/`, {
        method: 'PUT',
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            // 16052 状态已变 / 16053 拣货已开始 / 16110 有未结束的在线运单（要先在发货流程的「运单」一步取消运单）
            conflict = error.status === 409;
            if (error.code === 16110) {
                showAlert(t('dn.tips.cancel-confirm-title'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    if (done) showToast(t('action-results.success'), 'success')
    // 成功或状态已变（409）：重新读取单据与发货流程（已拣 / 已打包的取消后任务一并停用）
    if (done || conflict) {
        await Promise.all([fetchData(), flowRef.value?.reload()]);
    }
    canceling.value = false;
};
</script>
<template>
    <PageHeader :propData="dataToPass" />

    <!-- 页头：单号、状态、国内 / 跨境、承运商、发货阶段 -->
    <div class="card custom-card">
        <div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <span class="fs-18 fw-semibold text-primary">#DN-{{ dnId }}</span>
                    <span class="fs-14 text-muted" v-if="itemData?.order_number">{{ t('dn.fields.order-no') }} {{ itemData.order_number }}</span>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <span class="badge bg-primary" v-if="itemData?.status">{{ t('common.status.' + itemData.status.replace('_', '-')) }}</span>
                    <ShippingStageBadge :stage="flowInfo?.stage" />
                    <span class="badge" :class="routeBadge.cls" v-if="routeBadge"><i class="me-1" :class="routeBadge.icon"></i>{{ routeBadge.text }}</span>
                    <span class="badge bg-warning-transparent" v-if="flowInfo?.route?.requires_customs">
                        <i class="ri-file-shield-2-line me-1"></i>{{ t('shipping.route.customs') }}
                    </span>
                    <span class="badge bg-light text-default" v-if="flowInfo?.carrier || itemData?.carrier">
                        <i class="ri-truck-line me-1"></i>{{ flowInfo?.carrier?.name || itemData?.carrier?.name }}
                    </span>
                </div>
            </div>
            <div class="btn-list" v-if="itemData">
                <NuxtLink class="btn btn-primary-light btn-wave btn-sm" :to="`/dn/print/${dnId}`"><i
                        class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink>
                <NuxtLink :to="`/dn/edit/${itemData.id}`" class="btn btn-secondary btn-wave btn-sm"
                    v-if="(itemData?.status =='pending') && staffStore.hasPermission('dn_edit')"><i
                        class="ri-edit-line me-1 align-middle"></i>{{t('button.edit')}}</NuxtLink>
                <button class="btn btn-danger btn-wave btn-sm" v-if="(itemData?.status =='pending') && staffStore.hasPermission('dn_edit')"
                    :title="t('button.close')" @click="closeDN()"><i
                        class="ri-close-line me-1 align-middle"></i>{{ t('button.close') }}</button>
                <button type="button" class="btn btn-danger btn-wave btn-sm"
                    v-if="(canCancel) && staffStore.hasPermission('dn_edit')"
                    :title="t('dn.operations.cancel')" :disabled="canceling" @click="cancelDN()">
                    <span v-if="canceling" class="spinner-border spinner-border-sm me-1"></span>
                    <i v-else class="ri-arrow-go-back-line me-1 align-middle"></i>{{ t('dn.operations.cancel') }}</button>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-xxl-8 col-xl-7">
            <!-- 发货流程（主区域） -->
            <DnShippingFlow ref="flowRef" :dn-id="dnId" mode="full" :warehouse-id="itemData?.warehouse_id ?? null"
                @loaded="flowInfo = $event" @changed="onFlowChanged" />

            <!-- 商品明细 -->
            <div class="card custom-card">
                <div class="card-header">
                    <div class="card-title fs-14">{{t('common.fields.items')}} ({{ itemData?.detail_count ?? 0 }})</div>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-sm mb-0 fs-13">
                            <thead>
                                <tr>
                                    <th scope="col">{{t('common.entities.goods')}}</th>
                                    <th scope="col" class="text-end">{{t('common.fields.quantity')}}</th>
                                    <th scope="col" class="text-end">{{t('common.quantities.picked')}}</th>
                                    <th scope="col" class="text-end">{{t('common.quantities.packed')}}</th>
                                    <th scope="col" class="text-end">{{t('common.quantities.delivered')}}</th>
                                    <th scope="col">{{t('common.fields.remark')}}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="item in itemData?.details" :key="item.id ?? item.goods_id">
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <span class="avatar avatar-md me-2">
                                                <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                                                    <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                                                    <img src="/images/goods/default.png" alt="" v-else>
                                                </NuxtLink>
                                            </span>
                                            <div>
                                                <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap fw-semibold">{{ item?.goods?.name }}</NuxtLink>
                                                <div class="fs-11 text-muted">{{ item?.goods?.code }}<template v-if="item?.goods?.brand"> · {{ item.goods.brand }}</template></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="text-end">{{ item.quantity }}</td>
                                    <td class="text-end">{{ item.picked_quantity }}</td>
                                    <td class="text-end">{{ item.packed_quantity }}</td>
                                    <td class="text-end">{{ item.delivered_quantity }}</td>
                                    <td class="text-wrap">{{ item.remark }}</td>
                                </tr>
                                <tr class="fw-semibold" v-if="itemData">
                                    <td>{{ t('shipping.dn.totals') }}</td>
                                    <td class="text-end">{{ itemData?.total_quantity }}</td>
                                    <td class="text-end">{{ itemData?.total_picked_quantity }}</td>
                                    <td class="text-end">{{ itemData?.total_packed_quantity }}</td>
                                    <td class="text-end">{{ itemData?.total_delivered_quantity }}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- 出库单资料 -->
        <div class="col-xxl-4 col-xl-5">
            <div class="card custom-card">
                <div class="card-header">
                    <div class="card-title fs-14">{{t('dn.fields.details')}}</div>
                </div>
                <div class="card-body p-0">
                    <div class="mt-2 text-center border-bottom border-block-end-dashed">
                        <Barcode :value="`DN-${dnId}`" />
                    </div>

                    <div class="p-3 border-bottom border-block-end-dashed fs-13">
                        <p class="mb-2 text-muted">
                            <span class="fw-semibold text-default">{{t('dn.fields.type')}} :</span>
                            {{ itemData?.dn_type ? t('dn.type.'+itemData.dn_type) : '' }}
                        </p>
                        <p class="mb-2 text-muted">
                            <span class="fw-semibold text-default">{{t('common.users.creator')}} :</span>
                            {{ itemData?.creator?.user_name }}
                        </p>
                        <p class="mb-2 text-muted">
                            <span class="fw-semibold text-default">{{t('common.dates.created')}} :</span>
                            {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                        </p>
                        <p class="mb-0 text-muted">
                            <span class="fw-semibold text-default">{{t('common.dates.updated')}} :</span>
                            {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                        </p>
                    </div>

                    <div class="p-3 border-bottom border-block-end-dashed fs-13">
                        <div class="mb-2">
                            <span class="fs-14 fw-semibold">{{t('common.fields.delivery-info')}}</span>
                        </div>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.carrier')}} :</span> {{ itemData?.carrier?.name }}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.recipient')}} :</span> {{ itemData?.recipient?.name }}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.shipping-address')}} :</span> {{ itemData?.shipping_address}}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.scheduled-date')}} :</span> {{ itemData?.expected_shipping_date}}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.order-no')}} :</span> {{ itemData?.order_number}}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.transportation')}} :</span> {{ itemData?.transportation_mode ? t('dn.transportation.'+itemData.transportation_mode) : '' }}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.packing-info')}} :</span> {{ itemData?.packaging_info}}</p>
                        <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.special-handling')}} :</span> {{ itemData?.special_handling}}</p>
                        <p class="mb-0 text-muted"><span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span> {{ itemData?.warehouse?.name}}</p>
                    </div>
                    <div class="p-3 fs-13" v-if="itemData?.remark">
                        <div class="mb-2">
                            <span class="fs-14 fw-semibold">{{t('common.fields.remark')}}</span>
                        </div>
                        <p class="mb-0 text-muted text-wrap">{{ itemData?.remark }}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<style scoped></style>
