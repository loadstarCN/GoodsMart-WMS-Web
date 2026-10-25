<script lang="ts" setup>
/**
 * 配送任务详情：任务资料（运费、承运商、运输方式、备注）在本页填；运单号、揽收、完成发货、跟踪、签收都在下面的发货流程（compact）里办，
 * 完成发货时把本页的运费 / 承运商 / 运输方式 / 备注一起提交（completeExtras）。
 * 承运商选了就保存到任务（PUT tracking 只带 carrier_id）：流程的「运单」一步按任务上的承运商决定怎么建运单。
 */
import { dnTransportationModesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const taskId = String(route.params.id);

const itemData = ref<any>(null);
const activeTab = ref('details');
const { t } = useI18n();
const { bizErrorMessage } = useBizError();
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


const errors = ref<Record<string, any>>({
  carrier: null,
  transportation_mode: null,
});
/** 发货流程（compact） */
const flowRef = ref<{ reload: () => Promise<void> } | null>(null);
/** 任务上已保存的承运商：选择框改了才保存 */
const savedCarrierId = ref<number | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          itemData.value.currency= staffStore.staffInfo?.company?.default_currency || 'JPY';         
          savedCarrierId.value = itemData.value?.carrier_id ?? null;
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
            flowRef.value?.reload();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;
};

// 运费输入框（v-maska 文本框）的值转成提交值：空 → null（后端视为不改），否则转数字
const toShippingCost = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : Number(text);
};

/** 任务还没发货（pending / in_progress）：能改承运商、运费、运输方式、备注（完成发货时一起提交） */
const taskEditable = computed(() => ['pending', 'in_progress'].includes(String(itemData.value?.status || '')));

/**
 * 发货流程「完成发货」时一起提交的本页字段；承运商、运输方式没填 → 标出来并返回 null（不提交）。
 * 运单号不在这里：在流程的「运单」一步保存（完成发货时后端沿用已存的运单号）
 */
const completeExtras = (): Record<string, any> | null => {
  errors.value = {
    carrier: itemData.value?.carrier_id ? null : t('delivery.validation.carrier-required'),
    transportation_mode: itemData.value?.transportation_mode ? null : t('delivery.validation.transportation-required'),
  };
  if (Object.values(errors.value).some(v => v)) {
    showToast(t('delivery.tips.complete-fields-missing'), 'warning');
    return null;
  }
  return {
    // 输入框是文本框：空 = 不改已存运费（null），其余按数字提交（后端只收数字 / 数字字符串）
    shipping_cost: toShippingCost(itemData.value.shipping_cost),
    carrier_id: itemData.value.carrier_id,
    transportation_mode: itemData.value.transportation_mode,
    remark: itemData.value.remark,
  };
};


// 处理承运商选择
const isLoading = ref(false);
const selectedCarrier = ref<any>(null);
const carrierSelectedOptions = ref<any[]>([]);


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
  () => selectedCarrier.value,  // 监听选中的承运商对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.carrier_id = newVal.id;  // 将对象 ID 同步到表单
      // 承运商决定了运单怎么建（在线对接 / 手工）、揽收和跟踪方式：选了就保存，发货流程随之刷新
      if (taskEditable.value && newVal.id !== savedCarrierId.value) saveCarrier(newVal);
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

// ------------------ 发货流程（compact） ----------------------
/** 保存承运商 / 运单号时要弹窗说明的业务码：自动运单锁定（16078）/ 结果不明（16079）/ 与 CI 不一致（16080 / 16092）/ 不是当前任务（16091） */
const SHIPPING_BLOCK_CODES = [16078, 16079, 16080, 16091, 16092];

/**
 * 选了承运商就保存（PUT tracking 只带 carrier_id）：发货流程按任务上的承运商判断怎么建运单。
 * 有效在线运单期间不能换（16078）等：弹窗说明，选择框改回原来的承运商
 */
const savingCarrier = ref(false);
const saveCarrier = async (carrier: any) => {
  if (savingCarrier.value) return;
  savingCarrier.value = true;
  const previous = itemData.value?.carrier ?? null;
  await httpRequest<any>(`/api/warehouse/delivery/${taskId}/tracking`, {
    method: 'PUT',
    body: { carrier_id: carrier.id },
    onSuccess: (data) => {
      savedCarrierId.value = data?.carrier_id ?? carrier.id;
      itemData.value.carrier = data?.carrier ?? carrier;
      errors.value.carrier = null;
      flowRef.value?.reload();
    },
    onError: (error) => {
      if (SHIPPING_BLOCK_CODES.includes(Number(error.code))) {
        showAlert(t('delivery.tips.tracking-blocked-title'), bizErrorMessage(error), 'error');
      } else {
        showToast(bizErrorMessage(error), 'error');
      }
      selectedCarrier.value = previous;
    },
    onFinally: () => {
      savingCarrier.value = false;
    },
  });
};

/**
 * 发货流程里做了操作（存运单号、建 / 取消运单、完成发货、签收……）：任务状态变了就整页重读；
 * 否则只同步运单号与承运商，画面上其余输入（运费、运输方式、备注等）保持不动
 */
const syncFromTask = async () => {
  await httpRequest<any>(`/api/warehouse/delivery/${taskId}`, {
    method: 'GET',
    onSuccess: (data) => {
      if (!itemData.value) return;
      if (data?.status && data.status !== itemData.value.status) {
        fetchData();
        return;
      }
      itemData.value.tracking_number = data?.tracking_number ?? null;
      if (data?.carrier_id) {
        itemData.value.carrier_id = data.carrier_id;
        itemData.value.carrier = data.carrier;
        savedCarrierId.value = data.carrier_id;
        selectedCarrier.value = data.carrier;
      }
    },
  });
};

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
                  <span class="fw-semibold text-default">{{ t('dn.entity') }} :</span>
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
                  {{ $dayjs(itemData?.created_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
                </p>
                <p class="mb-2 text-muted">
                  <span class="fw-semibold text-default">{{t('common.dates.updated')}} :</span>
                  {{ $dayjs(itemData?.updated_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.expected_shipping_date">
                  <span class="fw-semibold text-default">{{t('dn.fields.scheduled-date')}} :</span>
                  {{ $dayjs(itemData?.dn?.expected_shipping_date, 'YYYY-MM-DD', itemData) }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.packaging_info">
                  <span class="fw-semibold text-default">{{ t('dn.fields.packing-info') }} :</span>
                  {{ itemData?.dn?.packaging_info }}
                </p>
                <p class="mb-2 text-muted" v-if="itemData?.dn?.special_handling">
                  <span class="fw-semibold text-default">{{ t('dn.fields.special-handling') }} :</span>
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
                  {{t('common.dates.created')}}:{{ $dayjs(itemData?.created_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'in_progress'">
                  {{t('common.dates.started')}}:{{ $dayjs(itemData?.started_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'completed'">
                  {{t('common.dates.completed')}}:{{ $dayjs(itemData?.completed_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
                </span>
                <span class="badge bg-primary-transparent" v-if="itemData?.status == 'signed'">
                  {{t('common.dates.signed')}}:{{ $dayjs(itemData?.signed_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}
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
                <div class="col-xl-6">
                  <div class="row gy-3">
                    <div class="col-xl-6">
                      <label for="product-price" class="form-label">{{t('common.fields.shipping-cost')}} ({{ itemData?.currency }})</label>
                      <input v-maska:[] type="text" class="form-control number-format" id="product-shipping_cost"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('delivery.form.placeholders.shipping-cost')"
                        v-model="itemData.shipping_cost" :disabled="!taskEditable" />
                    </div>
                    <div class="col-xl-6">
                      <label class="form-label">{{t('common.entities.carrier')}} <abbr :title="t('common.tips.required')" aria-hidden="true"
                          class="text-danger">*</abbr></label>
                      <div class="flex-nowrap input-group-custom">
                        <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedCarrier"
                          :options="carrierSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                          :internal-search="false" label="name" track-by="id" :options-limit="100"
                          @search-change="fetchCarrierData"  :disabled="!taskEditable || savingCarrier" />
                      </div>
                      <div v-if="errors.carrier" class="invalid-feedback d-block">{{ errors.carrier }}</div>
                    </div>

                    <div class="col-xl-6">
                      <div class="form-group mb-3">
                        <label class="form-label">{{t('dn.fields.transportation')}} <abbr :title="t('common.tips.required')" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <div class="flex-nowrap input-group-custom">
                          <VueMultiselect id="dn_transportation_mode" :show-labels="false"
                            :options="selectOptions.transportation_modes" :multiple="false"
                            v-model="itemData.transportation_mode" :disabled="!taskEditable">
                          </VueMultiselect>
                        </div>
                        <div v-if="errors.transportation_mode" class="invalid-feedback d-block">{{
                          errors.transportation_mode }}</div>
                      </div>
                    </div>
                    <div class="col-xl-6">
                      <div class="form-group mb-3">
                        <label class="form-label">{{t('common.fields.tracking-number')}}</label>
                        <div class="form-control-plaintext py-1">
                          <span class="font-monospace fw-semibold" v-if="itemData?.tracking_number">{{ itemData.tracking_number }}</span>
                          <span class="text-muted" v-else>—</span>
                        </div>
                        <div class="form-text">{{ t('delivery.tips.tracking-in-flow') }}</div>
                      </div>
                    </div>
                    <div class="col-xl-12">
                      <label class="form-label">{{t('common.fields.remark')}}</label>
                      <textarea class="form-control" id="text-area" rows="5" v-model="itemData.remark" :disabled="!taskEditable"></textarea>
                    </div>

                  </div>

                </div>
                <div class="col-xl-6" v-if="itemData?.status == 'completed' || itemData?.status == 'signed'">
                  <div class="row gy-3">
                    <div class="col-xl-12" v-if="itemData?.completed_at">
                      <label class="form-label">{{t('common.dates.completed')}}</label>
                      <div>{{ $dayjs(itemData?.completed_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}</div>
                    </div>
                    <div class="col-xl-12" v-if="itemData?.status == 'signed'">
                      <label class="form-label">{{t('common.dates.signed')}}</label>
                      <div>{{ $dayjs(itemData?.signed_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}</div>
                    </div>
                  </div>
                </div>


              </div>
            </div>
            <div class="card-footer border-top-0 d-flex flex-wrap align-items-center justify-content-end gap-2">
              <span class="fs-12 text-muted" v-if="taskEditable">{{ t('delivery.tips.complete-in-flow') }}</span>
              <div class="btn-list">
                <!-- <NuxtLink class="btn btn-primary btn-wave btn-sm" :to="`/delivery/print/${taskId}`"><i
                    class="ri-printer-line me-1 align-middle"></i>{{t('button.print')}}</NuxtLink> -->

                <NuxtLink class="btn btn-secondary btn-wave btn-sm" v-if="itemData?.status==='pending'"
                  :title="t('button.process')" @click="processTask()"><i class="ri-checkbox-line me-1 align-middle"></i>{{t('button.process')}}
                </NuxtLink>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

  <!-- 发货流程（compact）：运单号、揽收、完成发货、跟踪、签收都在这里办；完成发货时带上本页的运费 / 承运商 / 运输方式 / 备注 -->
  <!-- 用 itemData 而非 loading 判断：刷新任务数据时不卸载 -->
  <div class="row" v-if="itemData && itemData.dn_id">
    <div class="col-xl-12">
      <DnShippingFlow ref="flowRef" :dn-id="itemData.dn_id" mode="compact" :warehouse-id="itemData?.dn?.warehouse_id ?? null"
        :complete-extras="completeExtras" @changed="syncFromTask" />
    </div>
  </div>

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
                      <td class="d-none d-md-table-cell">{{ $dayjs(item?.changed_at, 'YYYY-MM-DD HH:mm:ss', itemData) }}</td>
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
