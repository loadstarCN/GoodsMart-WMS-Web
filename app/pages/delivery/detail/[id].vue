<script lang="ts" setup>
import { dnTransportationModesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

let loading = ref(true);
const route = useRoute();
const taskId = route.params.id;

const itemData = ref(null);
const activeTab = ref('details');
const { t } = useI18n();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.delivery'),
  list: [t('nav.warehouse'), t('nav.delivery')]
}));
const staffStore = useStaffStore()


// 配置化选项集合
const selectOptions = reactive({
  transportation_modes: dnTransportationModesOptions,
})


const errors = ref({
  tracking_number: null,
  carrier: null,
  transportation_mode: null,
  signed_at: null,
});

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          itemData.value.currency= staffStore.staffInfo?.company?.default_currency || 'JPY';         
          selectedCarrier.value = itemData.value?.carrier_id
            ? itemData.value?.carrier
            : null;
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


const processTask = async () => {
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};



const completeTask = async () => {
  errors.value = {
    carrier: itemData.value?.carrier_id ? null : 'Carrier cannot be empty',
    transportation_mode: itemData.value?.transportation_mode ? null : 'Transportation mode cannot be empty',
    tracking_number: itemData.value?.tracking_number ? null : 'Tracking number cannot be empty',
  };

  if (Object.values(errors.value).some(v => v)) return

  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}/complete/`, {
        method: 'PUT',
        body: {
          shipping_cost: itemData.value.shipping_cost,
          carrier_id: itemData.value.carrier_id,
          transportation_mode: itemData.value.transportation_mode,
          tracking_number: itemData.value.tracking_number,
          remark: itemData.value.remark,
        },
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const signTask = async () => {
  errors.value = {
    signed_at: itemData.value?.signed_at ? null : '签收时间不能为空',
  };
  if (Object.values(errors.value).some(v => v)) return

  if (itemData.value.signed_at) {
    itemData.value.signed_at = formatDateTimeWithoutTimezone(itemData.value.signed_at);
  }

  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}/sign/`, {
        method: 'PUT',
        body: {
          signed_at: itemData.value.signed_at,
        },
        onSuccess: (data) => {
            itemData.value = data;
            showToast('Task signed', 'success')
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

function completeFn(item: any) {

  // 使用封装的确认对话框
  showConfirm(
    t('action-results.complete-confirm-title'),
    t('action-results.complete-confirm'),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行完成任务
      completeTask()
    }
  });
}



// 处理承运商选择
const isLoading = ref(false);
const selectedCarrier = ref(null);
const carrierSelectedOptions = ref([]);


const fetchCarrierData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/carrier/', {
        method: 'GET',
        params: {all: true,name: name},
        onSuccess: async(data) => {
          carrierSelectedOptions.value = data.items;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
          isLoading.value = false;
        }
    })
    return data;   
};


watch(
  () => selectedCarrier.value,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.carrier_id = newVal.id;  // 将对象 ID 同步到表单
    } else {
      if (itemData.value?.carrier_id) {
        itemData.value.carrier_id = null;       // 清空选择时重置
      }
    }
  },
  { immediate: true }  // 初始化时立即触发
);

onMounted(async() => {
  await fetchData();
});

</script>
<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row" v-if="!loading">
    <div class="col-xl-12">
      <div class="row">
        <div class="col-xl-12">
          <div class="card custom-card">
            <div class="card-header">
              <div class="card-title">
                <span class="text-primary">#DEL-{{ itemData?.id }}</span>
                <span class="badge bg-primary ms-2">{{ t('common.status.'+itemData?.status.replace('_',"-")) }}</span>
              </div>
            </div>
            <div class="card-body row">
              <div class="col-xl-6">
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">DN :</span>
                  <NuxtLink :to="`/dn/detail/${itemData?.dn_id}`">#DN-{{ itemData?.dn_id }}</NuxtLink>
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.entities.warehouse')}} :</span>
                  <NuxtLink :to="`/warehouse/detail/${itemData?.dn?.warehouse_id}`">{{ itemData?.dn?.warehouse?.name
                    }}</NuxtLink>
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
                <p class="mb-2 text-muted" v-if="itemData?.dn?.expected_shipping_date">
                  <span class="fw-semibold text-default">{{t('dn.fields.scheduled-date')}} :</span>
                  {{ $dayjs(itemData?.dn?.expected_shipping_date,'YYYY-MM-DD') }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.packaging_info">
                  <span class="fw-semibold text-default">packaging_info :</span>
                  {{ itemData?.dn?.packaging_info }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.special_handling">
                  <span class="fw-semibold text-default">special_handling :</span>
                  {{ itemData?.dn?.special_handling }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.remark">
                  <span class="fw-semibold text-default">{{t('common.fields.remark')}} :</span>
                  {{ itemData?.dn?.remark }}
                </p>
              </div>
              <div class="col-xl-6 text-end">
                <Barcode :value="`DEL-${taskId}`" />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
    <div class="col-xl-12">
      <div class="row">
        <div class="col-xl-12">
          <div class="card custom-card">
            <div class="card-header d-flex justify-content-between">
              <div class="card-title">
                <span class="text-primary">{{t('delivery.fields.detail-info')}}</span>
              </div>
              <div>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'pending'">
                  {{t('common.dates.created')}}{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'in_progress'">
                  {{t('common.dates.started')}}:{{ $dayjs(itemData?.started_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'completed'">
                  {{t('common.dates.completed')}}:{{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'signed'">
                  {{t('common.dates.signed')}}:{{ $dayjs(itemData?.signed_at,'YYYY-MM-DD HH:mm:ss') }}
                </span>

              </div>
            </div>
            <div class="card-body">
              
              <div class="row gy-3">
                <div class="col-xl-12">
                  <p class="mb-2 text-muted">
                    <span class="fw-semibold text-default">{{t('dn.fields.shipping-address')}} :</span>
                    {{ itemData?.shipping_address }}
                  </p>
                  <p class="mb-2 text-muted">
                    <span class="fw-semibold text-default">{{t('common.entities.recipient')}} :</span>
                    {{ itemData?.recipient?.name }}
                  </p>
                  <p class="mb-2 text-muted">
                    <span class="fw-semibold text-default">{{t('common.fields.phone')}} :</span>
                    {{ itemData?.recipient?.phone }}
                  </p>
                </div>
                <div class="col-xl-6"  v-if="itemData?.status != 'pending'">
                  <div class="row gy-3">
                    <div class="col-xl-6">
                      <label for="product-price" class="form-label">{{t('common.fields.shipping-cost')}} ({{ itemData?.currency }})</label>
                      <input v-maska:[] type="text" class="form-control number-format" id="product-shipping_cost"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" placeholder="shipping_cost"
                        v-model="itemData.shipping_cost" :disabled="itemData?.status != 'in_progress'" />
                    </div>
                    <div class="col-xl-6">
                      <label class="form-label">{{t('common.entities.carrier')}} <abbr title="required" aria-hidden="true"
                          class="text-danger">*</abbr></label>
                      <div class="flex-nowrap input-group-custom">
                        <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedCarrier"
                          :options="carrierSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                          :internal-search="false" label="name" track-by="id" :options-limit="100"
                          @search-change="fetchCarrierData"  :disabled="itemData?.status != 'in_progress'" />
                      </div>
                      <div v-if="errors.carrier" class="invalid-feedback d-block">{{ errors.carrier }}</div>
                    </div>

                    <div class="col-xl-6">
                      <div class="form-group mb-3">
                        <label class="form-label">{{t('dn.fields.transportation')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <div class="flex-nowrap input-group-custom">
                          <VueMultiselect id="dn_transportation_mode" :show-labels="false"
                            :options="selectOptions.transportation_modes" :multiple="false"
                            v-model="itemData.transportation_mode" :disabled="itemData?.status != 'in_progress'">
                          </VueMultiselect>
                        </div>
                        <div v-if="errors.transportation_mode" class="invalid-feedback d-block">{{
                          errors.transportation_mode }}</div>
                      </div>
                    </div>
                    <div class="col-xl-6">
                      <div class="form-group mb-3">
                        <label class="form-label">{{t('common.fields.tracking-number')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="service-charges" :placeholder="t('common.placeholders.tracking-number')"
                          v-model="itemData.tracking_number" :disabled="itemData?.status != 'in_progress'">
                        <div v-if="errors.tracking_number" class="invalid-feedback d-block">{{ errors.tracking_number }}
                        </div>
                      </div>
                    </div>
                    <div class="col-xl-12">
                      <label class="form-label">{{t('common.fields.remark')}}</label>
                      <textarea class="form-control" id="text-area" rows="5" v-model="itemData.remark" :disabled="itemData?.status != 'in_progress'"></textarea>
                    </div>

                  </div>

                </div>
                <div class="col-xl-6" v-if="itemData?.status == 'completed' || itemData?.status == 'signed'">
                  <div class="row gy-3">
                    <div class="col-xl-12" v-if="itemData?.status == 'completed'">
                      <label class="form-label">{{t('common.dates.signed')}} <abbr title="required" aria-hidden="true"
                          class="text-danger">*</abbr></label>
                      <div class="input-group flex-nowrap input-group-custom">
                        <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                        <Datepicker id="expected-signed_at" :placeholder="t('delivery.form.placeholders.signed-time')" class="form-control"
                          autoApply  v-model="itemData.signed_at" />
                      </div>
                      <div v-if="errors.signed_at" class="invalid-feedback d-block">{{
                        errors.signed_at }}</div>
                    </div>
                    <div class="col-xl-12" v-if="itemData?.status == 'signed'">
                      <label class="form-label">{{t('common.dates.signed')}}</label>
                      <div class="input-group flex-nowrap input-group-custom">
                        {{ $dayjs(itemData?.signed_at,'YYYY-MM-DD HH:mm:ss')  }}
                      </div>
                      
                    </div>
                  </div>
                </div>


              </div>
            </div>
            <div class="card-footer border-top-0">
              <div class="btn-list float-end">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/delivery/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  :title="t('button.process')" @click="processTask()"><i class="ri-checkbox-line me-1 align-middle"></i>{{t('button.process')}}
                </NuxtLink>

                <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='in_progress'" :title="t('button.complete')"
                  @click="completeFn()" ><i class="ri-save-line me-1 align-middle"></i>{{t('button.complete')}}</button>
                  <button class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status =='completed'" :title="t('dn.operations.sign')"
                  @click="signTask()" ><i class="ri-save-line me-1 align-middle"></i>{{t('dn.operations.sign')}}</button>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

  <div class="row" v-if="!loading">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="">
            <ul class="nav nav-pills nav-style-3" role="tablist">

              <li class="nav-item">
                <a class="nav-link active" data-bs-toggle="tab" role="tab" aria-current="page" href="#details"
                  aria-selected="true">{{t('delivery.fields.items')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" data-bs-toggle="tab" role="tab" aria-current="page" href="#logs"
                  aria-selected="true">{{t('common.fields.task-logs')}}</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="card-body">
          <div class="row tab-content">

            <div class="tab-pane text-muted show active" id="details" role="tabpanel">


              <div class="table-responsive">
                <table class="table text-nowrap table-bordered table-hover">
                  <thead>
                    <tr>
                      <th scope="col">{{t('common.entities.goods')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{t('common.fields.quantity')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{t('common.quantities.picked')}}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{t('common.quantities.packed')}}</th>
                    </tr>

                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.dn?.details" class="invoice-list">
                      <td>
                        <div class="d-flex align-items-center">
                          <div>
                            <p class="mb-0 fw-semibold">
                              <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name
                                }}
                              </NuxtLink>
                            </p>
                            <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                          </div>
                        </div>
                      </td>
                      <td>{{ item.quantity}}<span class="text-danger ms-2"
                          v-if="item.quantity!=item.picked_quantity">({{ item.picked_quantity-item.quantity}})</span>
                      </td>
                      <td class="d-none d-lg-table-cell">{{ item?.picked_quantity }}</td>
                      <td class="d-none d-lg-table-cell">{{ item?.packed_quantity }}</td>

                    </tr>

                  </tbody>
                </table>
                <div class="text-center p-5 border border-top-0" v-if="itemData?.task_details?.length <=0">{{t('common.status.nothing-show')}}</div>
              </div>
            </div>
            <div class="tab-pane text-muted" id="logs" role="tabpanel">
              <div class="table-responsive">
                <table class="table text-nowrap table-bordered table-hover">
                  <thead>
                    <tr>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.task-id') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.old-status') }}</th>
                      <th scope="col" class="d-none d-md-table-cell">{{ t('common.fields.new-status') }}</th>
                      <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.changed') }}</th>
                      <th scope="col">{{ t('common.users.operator') }}</th>

                    </tr>

                  </thead>
                  <tbody>
                    <tr v-for="item in itemData?.status_logs" class="invoice-list">
                      <td>{{ item?.task_id }}</td>
                      <td>{{t('common.status.'+item?.old_status.replace('_',"-"))}}</td>
                      <td>{{t('common.status.'+item?.new_status.replace('_',"-"))}}</td>
                      <td class="d-none d-md-table-cell">{{ $dayjs(item?.changed_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                      <td class="d-none d-xl-table-cell">{{ item?.operator?.user_name }}</td>
                    </tr>

                  </tbody>
                </table>
                <div class="text-center p-5 border border-top-0" v-if="itemData?.status_logs?.length <=0">{{t('common.status.nothing-show')}}</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

</template>
<style scoped></style>
