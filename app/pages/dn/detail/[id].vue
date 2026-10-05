<script lang="ts" setup>
import { latestTaskTimelineTime, taskTimelineTime } from '~/utils/date'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const dnId = route.params.id;

const itemData = ref(null);
const itemPickingData = ref(null);
const itemPackingData = ref(null);
const { t } = useI18n();
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

const fetchPickingData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/picking/`, {
        method: 'GET',
        params: {
            dn_id: dnId
        },
        onSuccess: (data) => {
          itemPickingData.value = data;
          // 将tags字符串转换为数组
          // itemData.value.tags = convert_tags_to_array(data.tags)
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


const fetchPackingData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/packing/`, {
        method: 'GET',
        params: {
            dn_id: dnId
        },
        onSuccess: (data) => {
          itemPackingData.value = data;
          // 将tags字符串转换为数组
          // itemData.value.tags = convert_tags_to_array(data.tags)
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
   fetchPickingData();
   fetchPackingData();
});

// 海外出荷（带报关快照）的 DN 显示单证卡片
const isExport = computed(() => !!(itemData.value?.is_export || itemData.value?.customs));


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
            // 16052 状态已变 / 16053 拣货已开始 / 16110 有未结束的 FedEx 自动运单（要先在单证卡片取消运单）
            conflict = error.status === 409;
            if (error.code === 16110) {
                showAlert(t('dn.tips.cancel-confirm-title'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    if (done) showToast(t('action-results.success'), 'success')
    // 成功或状态已变（409）：重新读取单据与拣货 / 打包任务（已拣 / 已打包的取消后任务一并停用）
    if (done || conflict) {
        await Promise.all([fetchData(), fetchPickingData(), fetchPackingData()]);
    }
    canceling.value = false;
};
// 时间线「已拣货 / 已打包」的时间：取任务列表项里有的 completed_at / updated_at（列表项没有 picking_time / packing_time）
const pickingTimelineTime = computed(() => latestTaskTimelineTime(itemPickingData.value?.items));
const packingTimelineTime = computed(() => latestTaskTimelineTime(itemPackingData.value?.items));
</script>
<template>
    <PageHeader :propData="dataToPass" />
    <!-- Start::row-1 -->
    <div class="row">
        <div class="col-xl-6">
            <div class="row">
                <div class="col-xl-12">
                    <div class="card custom-card">
                        <div class="card-header d-flex justify-content-between">
                            <div class="card-title">
                                <span class="text-primary">#DN-{{ itemData?.id }}</span>
                            </div>
                            <div>
                                <!-- DN 的字段：计划发货日 / 开始处理 / 拣货完成 / 打包完成 / 发货时间（不是 ASN 的到货日期） -->
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'pending'">
                                    {{t('dn.fields.scheduled-date')}}:{{ itemData?.expected_shipping_date }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'in_progress' && itemData?.started_at">
                                    {{t('common.dates.started')}}:{{ $dayjs(itemData?.started_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'picked' && itemData?.picked_at">
                                    {{t('common.dates.picked')}}:{{ $dayjs(itemData?.picked_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'packed' && itemData?.packed_at">
                                    {{t('common.dates.packed')}}:{{ $dayjs(itemData?.packed_at,'YYYY-MM-DD HH:mm:ss') }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'delivered' && itemData?.delivered_at">
                                    {{t('common.dates.delivered')}}:{{ $dayjs(itemData?.delivered_at,'YYYY-MM-DD HH:mm:ss') }}
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
                                            <th scope="col">{{t('common.quantities.picked')}}</th>
                                            <th scope="col">{{t('common.quantities.packed')}}</th>
                                            <th scope="col">{{t('common.quantities.delivered')}}</th>
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
                                            <td>{{ item.picked_quantity}}</td>
                                            <td>{{ item.packed_quantity}}</td>
                                            <td>{{ item.delivered_quantity}}</td>
                                            <td>{{ item.remark}}</td>
                                        </tr>

                                        <tr>
                                            <td colspan="3"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-items')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="3"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-picked')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_picked_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="3"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-packed')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_packed_quantity }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colspan="3"></td>
                                            <td colspan="2">
                                                <div class="fw-semibold">{{t('common.quantities.total-delivered')}} :</div>
                                            </td>
                                            <td>
                                                {{ itemData?.total_delivered_quantity }}
                                            </td>
                                        </tr>
                                       
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="card-footer border-top-0">
                            <div class="btn-list float-end">
                                <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/dn/print/${dnId}`"><i
                                        class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink>
                                <NuxtLink :to="`/dn/edit/${itemData.id}`" class="btn btn-secondary btn-wave btn-sm"
                                    v-if="(itemData?.status =='pending') && staffStore.hasPermission('dn_edit')"><i
                                        class="ri-edit-line me-1 align-middle"></i>{{t('button.edit')}}</NuxtLink>
                                <NuxtLink :to="`/picking/?dn_id=${dnId}`" class="btn btn-warning btn-wave btn-sm"
                                    v-if="itemData?.status =='in_progress'" :title="t('dn.operations.picking')"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('dn.operations.picking')}}</NuxtLink>
                                <NuxtLink :to="`/packing/?dn_id=${dnId}`" class="btn btn-warning btn-wave btn-sm"
                                    v-if="itemData?.status =='picked'" :title="t('dn.operations.packing')"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('dn.operations.packing')}}</NuxtLink>
                                <NuxtLink :to="`/delivery/?dn_id=${dnId}`" class="btn btn-warning btn-wave btn-sm"
                                    v-if="itemData?.status =='packed'" :title="t('dn.operations.delivery')"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('dn.operations.delivery')}}</NuxtLink>
                                        
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
                </div>
            </div>
        </div>
        <div class="col-xl-3">
            <div class="row">
                <div class="col-xl-12">
                    <div class="card custom-card">
                        <div class="card-header">
                            <div class="card-title">
                                {{t('dn.fields.details')}}
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="mt-2 text-center border-bottom border-block-end-dashed">
                                <Barcode :value="`DN-${dnId}`" />
                            </div>

                            <div class="p-3 border-bottom border-block-end-dashed">
                                <div class="mb-3">
                                    <span class="fs-14 fw-semibold">{{t('common.fields.summary')}}</span>
                                </div>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('dn.fields.type')}}</span>
                                    {{ t('dn.type.'+itemData?.dn_type) }}
                                    <a href="#customs-documents" class="badge bg-info-transparent ms-1" v-if="isExport">
                                        <i class="ri-earth-line me-1"></i>{{ t('customs.export-badge') }}
                                    </a>
                                </p>
                                <p class="mb-2 text-muted">
                                    <span class="fw-semibold text-default">{{t('common.fields.status')}} :</span>
                                    {{ t('common.status.'+itemData?.status.replace('_',"-")) }}
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
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.carrier')}} :</span>{{ itemData?.carrier?.name }}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('common.entities.recipient')}} :</span>{{ itemData?.recipient?.name }}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.shipping-address')}} :</span>{{ itemData?.shipping_address}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.scheduled-date')}}:</span>{{ itemData?.expected_shipping_date}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.order-no')}}:</span>{{ itemData?.order_number}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.transportation')}}:</span>{{t('dn.transportation.'+itemData?.transportation_mode)}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.packing-info')}}:</span>{{ itemData?.packaging_info}}</p>
                                <p class="mb-2 text-muted"><span class="fw-semibold text-default">{{t('dn.fields.special-handling')}}:</span>{{ itemData?.special_handling}}</p>
                                <p class="mb-0 text-muted"><span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span>{{ itemData?.warehouse?.name}}</p>
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

        <div class="col-xl-3">
            <div class="card custom-card">
                <div class="card-header">
                    <div class="card-title">{{t('dn.fields.tracking-info')}}</div>
                </div>
                <div class="card-body">
                    <div class="order-track">
                        <div class="accordion" id="basicAccordion" v-if="itemData?.created_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicOne" aria-expanded="true" aria-controls="basicOne">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.created')}}</p><span class="mb-1 d-block fs-11 text-success">{{ $dayjs(itemData?.created_at) }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicOne" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11">
                                                <p class="mb-0">{{ $t('dn.tips.created-successfully', { creator: itemData?.creator?.user_name }) }}</p>
                                                <span class="text-muted op-5">{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="accordion" id="basicAccordion1" v-if="itemData?.started_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicTwo" aria-expanded="true" aria-controls="basicTwo">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.started')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(itemData?.started_at) }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicTwo" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion1">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11">
                                                <p class="mb-0">{{ $t('dn.tips.started-successfully') }}</p>
                                                <span class="text-muted op-5">{{ $dayjs(itemData?.started_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="accordion" id="basicAccordion2" v-if="itemPickingData?.items.length > 0">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicThree" aria-expanded="true" aria-controls="basicThree">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.picked')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ pickingTimelineTime ? $dayjs(pickingTimelineTime, 'YYYY-MM-DD HH:mm:ss') : '' }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicThree" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion2">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11 mb-3"  v-for="(item, index) in itemPickingData?.items" :key="index">
                                                <p class="mb-0">{{ $t('dn.tips.picking-operation-message',{pickedQuantity:item.total_picked_quantity,expectedQuantity:item.expected_quantity,creator:itemData?.creator?.user_name}) }}</p>
                                                
                                                <span class="text-muted op-5" v-if="taskTimelineTime(item)">{{ $dayjs(taskTimelineTime(item),'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                            
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="accordion" id="basicAccordion2" v-if="itemPackingData?.items.length > 0">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicThree" aria-expanded="true" aria-controls="basicThree">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.packed')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ packingTimelineTime ? $dayjs(packingTimelineTime, 'YYYY-MM-DD HH:mm:ss') : '' }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicThree" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion2">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11 mb-3"  v-for="(item, index) in itemPackingData?.items" :key="index">
                                                <!-- 列表项没有逐批的操作员：按任务的建立人显示，没有时用 DN 的建立人 -->
                                                <p class="mb-0">{{ $t('dn.tips.packing-operation-message',{packedQuantity:item.total_packed_quantity,operator:item?.creator?.user_name || itemData?.creator?.user_name || '—'}) }}</p>
                                                 <span class="text-muted op-5" v-if="taskTimelineTime(item)">{{ $dayjs(taskTimelineTime(item),'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                            
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="accordion" id="basicAccordion4" v-if="itemData?.delivered_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicFive" aria-expanded="true" aria-controls="basicFive">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.delivered')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(itemData?.delivered_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicFive" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion4">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="accordion" id="basicAccordion4" v-if="itemData?.status == 'completed' && itemData?.completed_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicFive" aria-expanded="true" aria-controls="basicFive">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.completed')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicFive" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion4">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="accordion" id="basicAccordion5" v-if="itemData?.status == 'closed' && itemData?.closed_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicFive" aria-expanded="true" aria-controls="basicFive">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="ri-archive-line fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.closed')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(itemData?.closed_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicFive" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion4">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div><!--v-if-->
            </div>
        </div>
    </div>
    <!--End::row-1 -->

    <!-- 海外出荷単証 -->
    <div class="row" v-if="itemData && isExport">
        <div class="col-xl-12">
            <DnCustomsCard :dn-id="dnId" :dn-status="itemData?.status" :warehouse-id="itemData?.warehouse_id" :key="`customs-${dnId}-${itemData?.status}`" />
        </div>
    </div>

</template>
<style scoped></style>
