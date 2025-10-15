<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
const route = useRoute();
const asnId = route.params.id;

const itemData = ref(null);
const itemSortingData = ref(null);
const { t } = useI18n();
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

const fetchSortingData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/sorting/`, {
        method: 'GET',
        params: {
            asn_id: asnId
        },
        onSuccess: (data) => {
          itemSortingData.value = data;
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

onMounted(() => {
    fetchData();
    fetchSortingData();
});

const receivedASN = async () => {
    const data = await httpRequest(`/api/warehouse/asn/${asnId}/receive/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast('ASN Received', 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};
const closeASN = async () => {
    const data = await httpRequest(`/api/warehouse/asn/${asnId}/close/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast('ASN Closed', 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};
function getEarliestStartedItem(itemSortingData: any) {
  const items = itemSortingData?.items;
  if (!items || items.length === 0) return undefined;
  return items.reduce((minItem:any, currentItem:any) => 
    currentItem.sorting_time < minItem.sorting_time ? currentItem.sorting_time : minItem.sorting_time
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
                                <span class="text-primary">#ASN-{{ itemData?.id }}</span>
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
                                <NuxtLink :to="`/asn/edit/${itemData.id}`" class="btn btn-secondary btn-wave btn-sm"
                                    v-if="itemData?.status =='pending'"><i
                                        class="ri-edit-line me-1 align-middle"></i>{{t('button.edit')}}</NuxtLink>
                                <button class="btn btn-warning btn-wave btn-sm" v-if="itemData?.status =='pending'"
                                    title="Received" @click="receivedASN()"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('asn.operations.receive')}}</button>
                                <NuxtLink :to="`/sorting/?asn_id=${asnId}`" class="btn btn-warning btn-wave btn-sm"
                                    v-if="itemData?.status =='received'" title="Go Sorting"><i
                                        class="ri-checkbox-line me-1 align-middle"></i>{{t('asn.operations.sorting')}}</NuxtLink>
                                <button class="btn btn-danger btn-wave btn-sm" v-if="itemData?.status =='pending'"
                                    :title="t('button.close')" @click="closeASN()"><i
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
                                    {{ t('asn.type.'+itemData?.asn_type) }}
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

        <div class="col-xl-3">
            <div class="card custom-card">
                <div class="card-header">
                    <div class="card-title">{{t('asn.fields.tracking-info')}}</div>
                </div>
                <div class="card-body">
                    <div class="order-track">
                        <div class="accordion" id="basicAccordion" v-if="itemData?.created_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicOne" aria-expanded="true" aria-controls="basicOne">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i class="fe fe-package fs-12"></i></span></div>
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
                                                <p class="mb-0">{{ $t('asn.tips.created-successfully', { creator: itemData?.creator?.user_name }) }}</p>
                                                <span class="text-muted op-5">{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="accordion" id="basicAccordion1" v-if="itemData?.received_at">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicTwo" aria-expanded="true" aria-controls="basicTwo">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="fe fe-package fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.received')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(itemData?.received_at) }}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicTwo" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion1">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11">
                                                <p class="mb-0">{{ $t('asn.tips.received-successfully') }}</p>

                                                <span class="text-muted op-5">{{ $dayjs(itemData?.received_at,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="accordion" id="basicAccordion2" v-if="itemSortingData?.items.length > 0">
                            <div class="accordion-item border-0 bg-transparent">
                                <div class="accordion-header" id="headingTwo"><a class="px-0 pt-0"
                                        href="javascript:void(0)" role="button" data-bs-toggle="collapse"
                                        data-bs-target="#basicThree" aria-expanded="true" aria-controls="basicThree">
                                        <div class="d-flex mb-0">
                                            <div class="me-2"><span
                                                    class="avatar avatar-md avatar-rounded bg-primary-transparent text-primary border"><i
                                                        class="fe fe-package fs-12"></i></span></div>
                                            <div class="flex-fill">
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">{{t('common.status.sorted')}}</p><span
                                                    class="mb-1 d-block fs-12 text-undefined">{{ $dayjs(getEarliestStartedItem(itemSortingData))}}</span>
                                            </div>
                                        </div>
                                    </a></div>
                                <div id="basicThree" class="accordion-collapse show collapse border-top-0"
                                    aria-labelledby="headingTwo" data-bs-parent="#basicAccordion2">
                                    <div class="accordion-body pt-0 ps-5">
                                        <div class="fs-11">
                                            <div class="fs-11 mb-3"  v-for="(item, index) in itemSortingData?.items" :key="index">
                                                
                                                <p class="mb-0">{{ $t('asn.tips.sorting-operation-message',{sortedQuantity:item.total_sorted_quantity,damagedQuantity:item.total_damage_quantity,allQuantity:item.total_sorted_quantity+item.total_damage_quantity,expectedQuantity:item.expected_quantity,creator:itemData?.creator?.user_name}) }}</p>
                                                <span class="text-muted op-5">{{ $dayjs(item.sorting_time,'YYYY-MM-DD HH:mm:ss') }}</span>
                                            </div>
                                            
                                        </div>
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
                                                <p class="fw-semibold mb-0 fs-14 pb-1 text-dark">Closed</p><span
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
