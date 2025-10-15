<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
const route = useRoute();
const dnId = route.params.id;

const itemData = ref(null);
const itemPickingData = ref(null);
const itemPackingData = ref(null);
const { t } = useI18n();
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


const closeDN = async () => {
    const data = await httpRequest(`/api/warehouse/dn/${dnId}/close/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast('DN Closed', 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};
function getEarliestPickItem(itemPickingData: any) {
  const items = itemPickingData?.items;
  if (!items || items.length === 0) return undefined;
  return items.reduce((minItem:any, currentItem:any) => 
    currentItem.picking_time < minItem.picking_time ? currentItem.picking_time : minItem.picking_time
  );
}

function getEarliestPackItem(itemPackingData: any) {
  const items = itemPackingData?.items;
  if (!items || items.length === 0) return undefined;
  return items.reduce((minItem:any, currentItem:any) => 
    currentItem.packing_time < minItem.packing_time ? currentItem.packing_time : minItem.packing_time
  );
}
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
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'pending'">
                                    expected_arrival_date:{{ itemData?.expected_arrival_date }}
                                </span>
                                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'received'">
                                    actual_arrival_date:{{ $dayjs(itemData?.received_at,'YYYY-MM-DD HH:mm:ss') }}
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
                                    v-if="itemData?.status =='pending'"><i
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
                                        
                                <button class="btn btn-danger btn-wave btn-sm" v-if="itemData?.status =='pending'"
                                    :title="t('button.close')" @click="closeDN()"><i
                                        class="ri-close-line me-1 align-middle"></i>{{ t('button.close') }}</button>
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
                                DN Details
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
                                            <div class="me-2"><span class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i class="fe fe-package fs-12"></i></span></div>
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
                                                        class="fe fe-package fs-12"></i></span></div>
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
                                                {{ itemData?.operator }}
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
                                                        class="fe fe-package fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.picked')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(getEarliestPickItem(itemPickingData))}}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicThree" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion2">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11 mb-3"  v-for="(item, index) in itemPickingData?.items" :key="index">
                                                <p class="mb-0">{{ $t('dn.tips.picking-operation-message',{pickedQuantity:item.total_picked_quantity,expectedQuantity:item.expected_quantity,creator:itemData?.creator?.user_name}) }}</p>
                                                
                                                <span class="text-muted op-5">{{ $dayjs(item.picking_time,'YYYY-MM-DD HH:mm:ss') }}</span>
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
                                                        class="fe fe-package fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.packed')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(getEarliestPackItem(itemPackingData))}}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicThree" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion2">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11 mb-3"  v-for="(item, index) in itemPackingData?.items" :key="index">
                                                <p class="mb-0">{{ $t('dn.tips.packing-operation-message',{packedQuantity:item.total_packed_quantity,creator:itemData?.creator?.user_name}) }}</p>
                                                 <span class="text-muted op-5">{{ $dayjs(item.packing_time,'YYYY-MM-DD HH:mm:ss') }}</span>
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
                                                        class="fe fe-package fs-12"></i></span></div>
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
                                                        class="fe fe-package fs-12"></i></span></div>
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
                                                        class="fe fe-package fs-12"></i></span></div>
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

</template>
<style scoped></style>
