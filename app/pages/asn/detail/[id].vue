<script lang="ts" setup>
/**
 * 入库单详情：上面是入库流程（AsnInboundFlow：创建 / 在途 / 收货 / 分拣 / 上架 / 完成，每一步的状态、实际时刻、来源和操作，
 * 在途一步可刷新承运商跟踪、打开查询页），下面是商品明细与入库单自己的操作（打印 / 编辑 / 收货 / 分拣 / 关闭 / 取消），
 * 右边是入库单资料。流程里做了操作（收货、刷新跟踪）页面重读入库单；页面做了操作流程重读。
 */
import type { InboundFlow } from '~/composables/asn/inboundFlow'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const asnId = String(route.params.id);

const itemData = ref<any>(null);
const { t } = useI18n();
// 按权限显示操作按钮（鉴权仍以后端为准）
const staffStore = useStaffStore();
const { bizErrorMessage } = useBizError();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.ASN'),
  list: [t('nav.warehouse'), t('nav.ASN')]
}));

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/asn/${asnId}`, {
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

onMounted(() => {
    fetchData();
});

// ------------------ 入库流程（页头的阶段取流程接口的） ----------------------
const flowRef = ref<{ reload: () => Promise<void> } | null>(null);
const flowInfo = ref<InboundFlow | null>(null);
/** 流程里做了操作（收货、刷新跟踪）：入库单的状态、数量随之变化 */
const onFlowChanged = () => {
    fetchData();
};

const receivedASN = async () => {
    const data = await httpRequest(`/api/warehouse/asn/${asnId}/receive/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.success'), 'success')
        },
        onError: (error) => {
            showToast(bizErrorMessage(error), 'error')
        }
    })
    flowRef.value?.reload();
    return data;   
};
const closeASN = async () => {
    const data = await httpRequest(`/api/warehouse/asn/${asnId}/close/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.success'), 'success')
        },
        onError: (error) => {
            showToast(bizErrorMessage(error), 'error')
        }
    })
    flowRef.value?.reload();
    return data;   
};
// 取消ASN（已签收、分拣尚未开始）：后端回滚签收库存、停用分拣任务并关闭单据；待处理的 ASN 用「关闭」
const canceling = ref(false);
const cancelASN = async () => {
    if (canceling.value) return;
    const confirmed = await showConfirm(
        t('asn.tips.cancel-confirm-title'),
        t('asn.tips.cancel-confirm', { id: asnId }),
        t('asn.operations.cancel'),
        t('button.dont-cancel'),
    );
    if (!confirmed) return;
    canceling.value = true;
    let done = false;
    let conflict = false;
    await httpRequest(`/api/warehouse/asn/${asnId}/cancel/`, {
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
    // 成功或状态已变（409）：重新读取单据与流程
    if (done || conflict) {
        await Promise.all([fetchData(), flowRef.value?.reload()]);
    }
    canceling.value = false;
};
</script>
<template>
    <PageHeader :propData="dataToPass" />
    <!-- Start::row-1 -->
    <div class="row">
        <div class="col-xxl-8 col-xl-7">
            <!-- 入库流程（主区域） -->
            <AsnInboundFlow ref="flowRef" :asn-id="asnId" @loaded="flowInfo = $event" @changed="onFlowChanged" />
            <div class="row">
                <div class="col-xl-12">
                    <div class="card custom-card">
                        <div class="card-header d-flex justify-content-between">
                            <div class="card-title d-flex flex-wrap align-items-center gap-2">
                                <span class="text-primary">#ASN-{{ itemData?.id }}</span>
                                <span class="fs-13 text-muted fw-normal" v-if="itemData?.order_number">{{ itemData.order_number }}</span>
                                <InboundStageBadge :stage="flowInfo?.stage" />
                            </div>
                            <div>

                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'pending'">
                                    {{t('common.dates.expected-arrival')}}:{{ itemData?.expected_arrival_date }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'received'">
                                    {{t('common.dates.actual-arrival')}}:{{ $dayjs(itemData?.received_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'completed'">
                                    {{t('common.dates.completed')}}:{{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'closed'">
                                    {{t('common.dates.closed')}}:{{ $dayjs(itemData?.closed_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>

                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th scope="col">{{t('common.fields.items')}}({{ itemData?.detail_count }})</th>
                                            <th scope="col">{{t('common.fields.quantity')}}</th>
                                            <th scope="col">{{t('common.quantities.actual')}}</th>
                                            <th scope="col">{{t('common.quantities.sorted')}}</th>
                                            <th scope="col">{{t('common.quantities.damaged')}}</th>
                                            <th scope="col">{{t('goods.fields.weight')}}(kg)</th>
                                            <th scope="col">{{t('goods.fields.volume')}}(m³)</th>

                                            <th scope="col">{{t('common.fields.remark')}}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="item in itemData?.details">
                                            <td>
                                                <div class="d-flex align-items-center">
                                                    <div class="me-2 lh-1">
                                                        <span class="avatar avatar-xxl me-2">
                                                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                                                                <img :src="item?.goods?.thumbnail_url" alt=""
                                                                    v-if="item?.goods?.thumbnail_url">
                                                                <img src="/images/goods/default.png" alt="" v-else>
                                                            </NuxtLink>
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p class="mb-0 fw-semibold">
                                                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`"
                                                                class="text-wrap">{{ item?.goods?.name }}
                                                            </NuxtLink>
                                                        </p>
                                                        <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                                                        <p class="mb-0 fs-11 text-muted">{{ item?.goods?.brand }}</p>
                                                        <p class="mb-0 fs-11 text-muted">{{ item?.goods?.category }}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{{ item.quantity}}</td>
                                            <td>{{ item.actual_quantity}}</td>
                                            <td>{{ item.sorted_quantity}}</td>
                                            <td>{{ item.damage_quantity}}</td>
                                            <td>{{ item.weight}}</td>
                                            <td>{{ item.volume}}</td>
                                            <td>{{ item.remark}}</td>
                                        </tr>

                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-items')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-actual')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_actual_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-sorted')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_sorted_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-damage')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_damage_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-weight')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_weight }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="5"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-volume')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_volume }}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="card-footer border-top-0">
                            <div class="btn-list float-end">
                                <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/asn/print/${asnId}`"><i
                                        class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink>
                                <NuxtLink :to="`/asn/edit/${itemData?.id}`" class="btn btn-secondary btn-wave btn-sm"
                                    v-if="(itemData?.status =='pending') && staffStore.hasPermission('asn_edit')"><i
                                        class="ri-edit-line me-1 align-middle"></i>{{t('button.edit')}}</NuxtLink>
                                <button class="btn btn-warning btn-wave btn-sm" v-if="(itemData?.status =='pending') && staffStore.hasPermission('asn_edit')"
                                    title="Received" @click="receivedASN()"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('asn.operations.receive')}}</button>
                                <NuxtLink :to="`/sorting/?asn_id=${asnId}`" class="btn btn-warning btn-wave btn-sm"
                                    v-if="itemData?.status =='received'" title="Go Sorting"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('asn.operations.sorting')}}</NuxtLink>
                                <button class="btn btn-danger btn-wave btn-sm" v-if="(itemData?.status =='pending') && staffStore.hasPermission('asn_edit')"
                                    :title="t('button.close')" @click="closeASN()"><i
                                        class="ri-close-line me-1 align-middle"></i>{{ t('button.close') }}</button>
                                <button type="button" class="btn btn-danger btn-wave btn-sm" v-if="(itemData?.status =='received') && staffStore.hasPermission('asn_edit')"
                                    :title="t('asn.operations.cancel')" :disabled="canceling" @click="cancelASN()">
                                    <span v-if="canceling" class="spinner-border spinner-border-sm me-1"></span>
                                    <i v-else class="ri-arrow-go-back-line me-1 align-middle"></i>{{ t('asn.operations.cancel') }}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-xxl-4 col-xl-5">
            <div class="row">
                <div class="col-xl-12">
                    <div class="card custom-card">
                        <div class="card-header">
                            <div class="card-title">
                                {{t('asn.fields.details')}}
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="mt-2 text-center border-bottom border-block-end-dashed">
                                <Barcode :value="`ASN-${asnId}`" />
                            </div>

                            <div class="p-3 border-bottom border-block-end-dashed">
                                <div class="mb-3">
                                    <span class="fs-14 fw-semibold">{{t('common.fields.summary')}}</span>
                                </div>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('asn.fields.type')}} :</span>
                                    {{ itemData?.asn_type ? t('asn.type.'+itemData.asn_type) : '' }}
                                </p>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('common.fields.status')}} :</span>
                                    {{ itemData?.status ? t('common.status.'+itemData.status.replace('_',"-")) : '' }}
                                </p>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('common.users.creator')}} :</span>
                                    {{ itemData?.creator?.user_name }}
                                </p>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('common.dates.created')}} :</span>
                                    {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                                </p>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('common.dates.updated')}} :</span>
                                    {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                                </p>
                            </div>

                            <div class="p-3 border-bottom border-block-end-dashed">
                                <div class="d-flex align-items-center justify-content-between mb-3">
                                    <span class="fs-14 fw-semibold">{{t('common.fields.delivery-info')}} :</span>

                                </div>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.supplier')}} :
                                    </span>{{ itemData?.supplier?.name }}
                                </p>

                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.carrier')}} :
                                    </span>{{ itemData?.carrier?.name }}
                                </p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.fields.tracking-number')}} :
                                    </span>{{ itemData?.tracking_number}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('asn.fields.expected-arrival-date')}}
                                        :
                                    </span>{{ itemData?.expected_arrival_date}}
                                </p>
                                <p class="mb-0 text-muted"><span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :
                                    </span>{{ itemData?.warehouse?.name}}
                                </p>
                            </div>
                            <div class="p-3 border-bottom border-block-end-dashed">
                                <div class="mb-3">
                                    <span class="fs-14 fw-semibold">{{t('common.fields.remark')}} :</span>
                                </div>
                                <p class="mb-2 text-muted">
                                    {{ itemData?.remark }}
                                </p>

                            </div>


                        </div>

                    </div>
                </div>
            </div>
        </div>

    </div>
    <!--End::row-1 -->

</template>
<style scoped></style>
