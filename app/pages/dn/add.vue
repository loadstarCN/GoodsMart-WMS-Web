<script lang="ts" setup>
import { useInventorySearch } from '~/composables/goods/useInventorySearch';
import { dnTypesOptions,dnTransportationModesOptions } from '~/data/selectOptions'
import {
  addressFieldLabel,
  cleanShipTo,
  formatAddressOneLine,
  hasStructuredAddress,
  shipToFromRecipient,
} from '~/composables/address/structuredAddress'
import type { ServiceOption } from '~/composables/shipping/carrierFile'
import {
  loadCarrierServiceOptions,
  optionKeyOfError,
  optionsPayload,
  optionsToForm,
} from '~/composables/dn/shippingOptionsForm'
import { useShippingAddressLine } from '~/composables/dn/shippingAddressLine'

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t, te } = useI18n();
// 下拉显示发货类型 / 运输方式的译名（选项值仍是 shipping、express 等代码）
const { translateOption } = useOptionLabel();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.DN'),
  list: [t('nav.warehouse'), t('nav.DN')]
}));

const warehouseStore = useWarehouseStore()
const router = useRouter()
const { bizErrorMessage } = useBizError()

// 创建响应式表单引用
const dnItem = ref<Record<string, any>>({
  warehouse_id: null,
  recipient_id: null,
  carrier_id: null,
  dn_type: "shipping",
  transportation_mode: "express",
  order_number: null,
  shipping_address: null,
  expected_shipping_date: null,
  packaging_info: null,
  special_handling: null,
  remark: null,
  details: []
})

// 配置化选项集合
const selectOptions = reactive({
  dn_types: dnTypesOptions,
  transportation_modes: dnTransportationModesOptions,
  warehouses: [] as any[]
})

const errors = ref<Record<string, any>>({
  dn_type: null,
  wareshouse: null,
  recipient: null,
  shipping_address: null,
  expected_shipping_date: null,
  details:null,
  quantity: null,
});

//处理仓库选择
const selectWareshouse = ref<any>(null);

const shouldDisableWarehouseSelect = computed(() => {
  return selectOptions.warehouses.length === 1;
});

watch(
  () => warehouseStore.currentWarehouse,
  (newVal:any) => {
    if (newVal) {
      selectWareshouse.value = newVal
      selectOptions.warehouses = [warehouseStore.currentWarehouse]
    }
  },
  { immediate: true } // 立即执行以处理初始值
);

watch(
  () => selectWareshouse.value,  // 监听选中的仓库对象
  (newVal:any) => {
    if (newVal) {
      dnItem.value.warehouse_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.wareshouse = null; // 清除错误信息
    } else {
      dnItem.value.warehouse_id = null;       // 清空选择时重置
    }
    dnItem.value.details = []; 
  },
  { immediate: true }  // 初始化时立即触发
);

// 处理收件人选择
const isLoading = ref(false);
const selectedRecipient = ref<any>(null);
const recipientSelectedOptions = ref<any[]>([]);

const fetchRecipientData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/recipient/', {
        method: 'GET',
        params: {all: true,name: name},
        onSuccess: async(data) => {
          recipientSelectedOptions.value = data.items;
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
  () => selectedRecipient.value,  // 监听选中的收货人对象
  (newVal:any) => {
    if (newVal) {
      dnItem.value.recipient_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.recipient = null; // 清除错误信息
      applyRecipient(newVal.id);              // 收件地址按收货方的地址填写
    } else {
      dnItem.value.recipient_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

// ------------------ 收件地址（ship_to，后端 doc/shipping-flow.md §6.2） ----------------------
/**
 * 收件地址：结构化的 ship_to（DnShipToFields）+ 单行地址 shipping_address（页面上另一栏，空着或与排版一致时跟着
 * 结构化字段自动生成，见 composables/dn/shippingAddressLine.ts）。选收货方后按收货方的地址填写，可以按本单修改。
 * 提交：填了结构化地址时带 ship_to（快照）；没填时不带（后端从收货方的结构化字段拷贝，收货方也没有时只用单行地址）。
 */
const shipTo = ref<Record<string, any>>({})
const shipToStructured = computed(() => hasStructuredAddress(shipTo.value))
const shippingAddress = computed<string | null>({
  get: () => dnItem.value.shipping_address ?? null,
  set: (value: string | null) => { dnItem.value.shipping_address = value },
})
const {
  auto: addressAuto,
  differs: addressDiffers,
  formatted: addressFormatted,
  reset: resetAddressLine,
  onInput: onAddressInput,
  useFormatted: useFormattedAddress,
} = useShippingAddressLine(shipTo, shippingAddress)

let recipientSeq = 0
const applyRecipient = async (recipientId: number | string) => {
  const seq = ++recipientSeq
  const data = await httpRequest<any>(`/api/warehouse/recipient/${recipientId}`, {
    method: 'GET',
    onError: (error) => showToast(error.message, 'error'),
  })
  if (seq !== recipientSeq || !data) return  // 期间又换了收货方
  const address = shipToFromRecipient(data)
  shipTo.value = address
  // 有结构化地址时单行地址按它生成（与后端一致）；没有时用收货方的单行地址（旧数据）
  shippingAddress.value = hasStructuredAddress(address) ? formatAddressOneLine(address, 'local') : (data.address || null)
  resetAddressLine()
  errors.value.shipping_address = null
}

// ------------------ 运单服务选项（shipping_options，§6.4） ----------------------
/** 所选承运商声明的选项（GET /carrier/<id> 的 service_options）；没有承运商 / 没有声明时不显示 */
const optionSchema = ref<ServiceOption[]>([])
const optionForm = ref<Record<string, string>>({})
const optionErrors = ref<Record<string, string>>({})
const optionsLoading = ref(false)
let carrierSeq = 0
watch(
  () => dnItem.value.carrier_id,
  async (carrierId: any) => {
    const seq = ++carrierSeq
    optionErrors.value = {}
    if (!carrierId) {
      optionSchema.value = []
      optionsLoading.value = false
      return
    }
    optionsLoading.value = true
    const schema = await loadCarrierServiceOptions(carrierId)
    if (seq !== carrierSeq) return  // 期间又换了承运商
    optionSchema.value = schema
    // 换承运商时同名的选项保留已填的值
    optionForm.value = optionsToForm(schema, null, optionForm.value)
    optionsLoading.value = false
  },
);

// 处理承运商选择
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
  () => selectedCarrier.value,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      dnItem.value.carrier_id = newVal.id;  // 将对象 ID 同步到表单
    } else {
      dnItem.value.carrier_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

onMounted(async () => {
  // 确保仓库数据已加载
  if (warehouseStore.warehouses.length === 0) {
    await warehouseStore.fetchWarehouses(); // 等待异步加载完成
  }

  // 处理当前仓库
  if (warehouseStore.currentWarehouse) {
    selectWareshouse.value = warehouseStore.currentWarehouse;
    selectOptions.warehouses = [warehouseStore.currentWarehouse];
  } 
  // 处理无当前仓库但有仓库数据的情况
  else if (warehouseStore.warehouses.length > 0) {
    selectOptions.warehouses = warehouseStore.warehouses;
    
    // 只有一个仓库时自动选择
    if (warehouseStore.warehouses.length === 1) {
      selectWareshouse.value = warehouseStore.warehouses[0];
    }
  }
  
  // 完全移除所有 asnItem.value.warehouse_id 的手动设置
  // 因为 watch 监听器会自动处理这个同步
});


// ------------------ 提交保存 ----------------------
// 防重复提交：请求期间禁用按钮；成功后跳转离开，不再解锁（连点两次会生成两张 DN、重复预占库存）
const submitting = ref(false)
const addDN = async () => {
  if (submitting.value) return
  const addressText = String(dnItem.value.shipping_address ?? '').trim()
  errors.value = {
    dn_type: !dnItem.value.dn_type ? t('common.validation.type-required') : null,
    wareshouse: !dnItem.value.warehouse_id ? t('common.validation.warehouse-required') : null,
    recipient: !dnItem.value.recipient_id ? t('common.validation.recipient-required') : null,
    // 后端要求单行地址或结构化地址（ship_to）之一
    shipping_address: !addressText && !shipToStructured.value ? t('dn.ship-to.required') : null,
    expected_shipping_date: !dnItem.value.expected_shipping_date ? t('common.validation.expected-shipping-date-required') : null,
    details: dnItem.value.details.length === 0 ? t('common.validation.goods-item-required') : null
  }

  // 服务选项：金额要是 0 以上的数字
  const optionResult = optionsPayload(optionSchema.value, optionForm.value)
  optionErrors.value = Object.fromEntries(optionResult.invalid.map((key: string) => [key, t('shipping.options.invalid-money')]))

  if (Object.values(errors.value).some(v => v) || optionResult.invalid.length) return

  // 有明细数量超出可用量：不提交（该行下方已提示）
  const exceeded: any = dnItem.value.details.find((item: any) => exceedsMax(item))
  if (exceeded) {
    showToast(t('common.validation.quantity-exceeds-available', { max: exceeded.max_qty }), 'error')
    return
  }

  if (dnItem.value.expected_shipping_date) {
    dnItem.value.expected_shipping_date = safeFormatDate(dnItem.value.expected_shipping_date);
  }

  const body: Record<string, any> = { ...dnItem.value, shipping_address: addressText || null }
  // 填了结构化地址才带 ship_to；不带时后端从收货方的结构化字段拷贝（带 null 则不拷贝）
  if (shipToStructured.value) body.ship_to = cleanShipTo(shipTo.value)
  // 只带填了的选项；一个都没填时不带
  if (optionResult.options) body.shipping_options = optionResult.options

  submitting.value = true
  await httpRequest('/api/warehouse/dn/', {
    method: 'POST',
    // 用表单里选的仓库作为请求的仓库（页头选「全部仓库」时也能正确建单）
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(dnItem.value.warehouse_id) },
    body,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/dn/')
    },
    onError: (error) => {
      submitting.value = false
      // 服务选项不合法（16139，field = shipping_options.<key>）：标在该项下面
      const optionKey = error.code === 16139 ? optionKeyOfError(error.field) : null
      if (optionKey) optionErrors.value = { [optionKey]: t('shipping.options.invalid-field', { message: error.message || '—' }) }
      // 收件地址的字段不对（14019 文本超长 / 14020 国家代码，field = ship_to.xxx）：指明是哪一项
      if ((error.code === 14019 || error.code === 14020) && String(error.field || '').startsWith('ship_to')) {
        showToast(t('dn.ship-to.invalid-field', {
          field: addressFieldLabel(error.field, shipTo.value.country, t, te), message: error.message || '—',
        }), 'error')
        return
      }
      // 库存不足（16032）等按业务码显示原因
      showToast(bizErrorMessage(error), 'error')
    }
  })

}

// ------------------ 添加商品 ----------------------

/**
 * 商品可下单的上限 = 可售可用量（onhand - locked - DN 预占），与后端校验一致；
 * 不能用 available_stock：它含残损 / 退货库存，按它下单会被后端以库存不足（16032）拒绝
 */
const availableForSale = (inventory: any): number => Math.max(0, Number(inventory?.available_stock_for_sale) || 0)

/** 数量超出上限（上限未知时不判断） */
const exceedsMax = (target: any) =>
  !!target && typeof target.max_qty === 'number' && Number(target.quantity) > target.max_qty

// 整合所有搜索相关状态
// 组件中调用
const { state: goodsSearch, fetchInventory, resetSelection,resetState } = useInventorySearch();
const handleSearch = () => {
  if (goodsSearch.code.trim()) {
    // 库存按仓库查：还没选仓库时先提示选仓库（否则 selectWareshouse.value 为 null 直接报错）
    const warehouse: any = selectWareshouse.value;
    if (!warehouse?.id) {
      errors.value.wareshouse = t('common.validation.warehouse-required');
      showToast(t('common.validation.warehouse-required'), 'error');
      return;
    }
    is_next.value = false;
    errors.value.quantity = null;
    fetchInventory(warehouse.id);
    resetSelection();
  }
}

watch(
  () => goodsSearch.selected.goods_id,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      const selectedItem = goodsSearch.results.find((item:any) => item.goods_id == newVal);

      if (selectedItem) {
        goodsSearch.selected.max_qty = availableForSale(selectedItem);
      }
    } else {
      goodsSearch.selected.max_qty = null; // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

const clampValue = (target: any) => {
  if (!target) return;
  // 超出上限时不再改写成上限：上限为 0 时会先压成 0、再被下面改成 1；
  // 改为在输入框下提示超出可用量（exceedsMax），添加 / 提交时拦截
  if (target.quantity < 1) {
    target.quantity = 1;
  }
}

const is_next = ref(false);
const nextAddDNItem = () => {
  if (dnItem.value.details.some((item:any) => item.goods_id == goodsSearch.selected.goods_id)) {
    showToast(t('common.validation.goods-exists'), 'error');
    return;
  }
  is_next.value = true;
  const foundItem = goodsSearch.results.find((item: any) => item.goods_id == goodsSearch.selected.goods_id);
  if (foundItem) {
    goodsSearch.selected.goods = foundItem.goods;
  }
}

const addDNItem = () => {
  if (!goodsSearch.selected.quantity) {
    errors.value.quantity = t('common.validation.quantity-required');
    return;
  }
  if (exceedsMax(goodsSearch.selected)) {
    errors.value.quantity = t('common.validation.quantity-exceeds-available', { max: goodsSearch.selected.max_qty });
    return;
  }
  dnItem.value.details.push(goodsSearch.selected)
  resetState();
  is_next.value = false;
  errors.value.quantity = null;

}

//-------------------- 编辑表单项 ----------------------
const deleteItem = (detail:any) => {
  const index = dnItem.value.details.indexOf(detail);
  if (index > -1) {
    dnItem.value.details.splice(index, 1);
  }
}

const selectItem = ref<Record<string, any>>({});
const tempRemark = ref('');

const editRemark = (item:any) => {
  selectItem.value = item;
  tempRemark.value = item.remark;
}

const saveRemark = () => {
  selectItem.value.remark = tempRemark.value;
}

</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row">
    <div class="col-xxl-9">
      <div class="card custom-card" id="cart-container-delete">
        <div class="card-header justify-content-between">
          <div class="card-title">
            {{ t('dn.fields.items') }} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr><span
              class="badge rounded-pill bg-success ms-2" v-if="dnItem?.details?.length>0">{{
              dnItem?.details?.length}}</span>

          </div>
          <div class="d-flex">
            <button class="btn btn-sm btn-primary btn-wave waves-light" data-bs-toggle="offcanvas"
            data-bs-target="#offcanvasRight" aria-controls="offcanvasRight">
              <i class="ri-add-line fw-semibold align-middle me-1" ></i> {{t('goods.operations.add')}}
            </button>
          </div>

        </div>
        <div class="card-body">

          <div class="table-responsive">
            <table class="table table-bordered text-nowrap">
              <thead>
                <tr>
                  <th>{{t('common.entities.goods')}}</th>
                  <th>{{ t('common.fields.quantity') }} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr></th>
                  <th class="d-none d-xl-table-cell">{{t('common.fields.remark')}}</th>
                  <th>{{ t('common.fields.action') }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="detail in dnItem?.details">
                  <td>
                    <div class="d-flex align-items-center">
                      <div class="me-2 lh-1">
                        <span class="avatar avatar-xxl me-2">

                          <NuxtLink :to="`/goods/detail/${detail?.goods_id}`" target="_blank">
                            <img :src="detail.goods?.thumbnail_url" alt=""
                              v-if="detail.goods?.thumbnail_url">
                            <img src="/images/goods/default.png" alt="" v-else>
                          </NuxtLink>
                        </span>
                      </div>
                      <div>
                        <p class="mb-0 fw-semibold">
                          <NuxtLink :to="`/goods/detail/${detail?.goods_id}`" class="text-wrap" target="_blank">{{
                            detail.goods?.name }}</NuxtLink>
                        </p>
                        <p class="mb-0 fs-11 text-muted">{{ detail.goods?.code }}</p>
                      </div>

                    </div>
                    <div class="d-xl-none mt-2">
                      <div class="text-wrap">
                        {{ detail.remark }}
                        <NuxtLink to="" data-bs-toggle="modal" data-bs-target="#editRemarkModal"><i
                            class="ri-edit-line ms-2"></i></NuxtLink>
                      </div>
                    </div>
                  </td>
                  <td class="product-quantity-container">
                    <div class="rounded flex-nowrap">
                      <input v-maska:[] type="number" class="form-control number-format" id="product-quantity"
                        data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('common.placeholders.quantity')"
                        v-model="detail.quantity" min="1" step="1" @change="clampValue(detail)">
                      <label for="product-quantity" class="form-label mt-1 fs-12 op-5 text-muted mb-0">{{t('common.quantities.max')}}:{{
                        detail.max_qty }}</label>
                      <div v-if="exceedsMax(detail)" class="invalid-feedback d-block">{{
                        t('common.validation.quantity-exceeds-available', { max: detail.max_qty }) }}</div>
                    </div>
                  </td>

                  <td class="d-none d-xl-table-cell">
                    <div class=" text-wrap">
                      {{ detail.remark }}<span class="text-muted fs-12">
                        <NuxtLink to="" data-bs-toggle="modal" data-bs-target="#editRemarkModal"
                          @click="editRemark(detail)"><i class="ri-edit-line ms-2"></i></NuxtLink>
                      </span>
                    </div>


                  </td>
                  <td>
                    <button class="btn btn-icon btn-danger btn-delete" @click="deleteItem(detail)">
                      <i class="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-5 border border-top-0" v-if="dnItem?.details?.length==0">{{t('common.status.nothing-show')}}</div>
          </div>
          <div v-if="errors.details" class="invalid-feedback d-block">{{ errors.details }}</div>
        </div>
      </div>

      <!-- 收件地址：选收货方后按收货方的地址填写，可以按本单修改 -->
      <div class="card custom-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ri-map-pin-line me-1"></i>{{ t('dn.ship-to.title') }} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr>
          </div>
        </div>
        <div class="card-body">
          <p class="fs-12 text-muted mb-3">{{ t('dn.ship-to.tip') }}</p>
          <DnShipToFields v-model="shipTo" id-prefix="dn-ship-to" />

          <!-- 单行地址：空着或与上面的排版一致时跟着结构化字段自动生成；手工改过的不覆盖 -->
          <div class="mt-3">
            <label for="dn-shipping-address" class="form-label">{{ t('dn.fields.shipping-address') }}</label>
            <input type="text" class="form-control" id="dn-shipping-address" maxlength="255"
              :placeholder="t('dn.form.placeholders.shipping-address')" :value="dnItem.shipping_address ?? ''"
              @input="onAddressInput(($event.target as HTMLInputElement).value)">
            <div class="form-text" :class="{ 'text-warning': addressDiffers && !addressAuto && !!String(dnItem.shipping_address ?? '').trim() }">
              <template v-if="addressAuto && addressFormatted">{{ t('address.legacy-auto') }}</template>
              <template v-else-if="addressDiffers && String(dnItem.shipping_address ?? '').trim()">{{ t('address.legacy-differs') }}</template>
              <template v-else-if="!shipToStructured">{{ t('dn.ship-to.unstructured-hint') }}</template>
              <template v-else>{{ t('address.legacy-hint') }}</template>
              <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline fs-12" v-if="addressDiffers && !addressAuto"
                @click="useFormattedAddress">{{ t('address.use-formatted') }}</button>
            </div>
            <div v-if="errors.shipping_address" class="invalid-feedback d-block">{{ errors.shipping_address }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="col-xxl-3">
      <div class="card custom-card">
        <div class="card-header">
          <div class="card-title">
            {{t('common.fields.base-info')}}
          </div>
        </div>
        <div class="card-body p-0">
          <div class="p-3 border-bottom border-block-end-dashed">

            <div class="form-group mb-3">
              <label class="form-label">{{t('dn.fields.type')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="dn-type" :show-labels="false" :options="selectOptions.dn_types"
                  :custom-label="(v: string) => translateOption(v, 'dn.type')"
                  :multiple="false" v-model="dnItem.dn_type"></VueMultiselect>
              </div>
              <div v-if="errors.dn_type" class="invalid-feedback d-block">{{ errors.dn_type }}</div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('common.entities.warehouse')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="dn-warehouse" :show-labels="false" :options="selectOptions.warehouses"
                  :multiple="false" v-model="selectWareshouse" label="name" track-by="id"
                  :disabled="shouldDisableWarehouseSelect"></VueMultiselect>
              </div>
              <div v-if="errors.wareshouse" class="invalid-feedback d-block">{{ errors.wareshouse }}</div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('dn.fields.scheduled-date')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="input-group flex-nowrap input-group-custom">
                <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                <Datepicker id="expected-arrival-date" :placeholder="t('dn.form.placeholders.scheduled-date')" class="form-control"
                  autoApply :enable-time-picker="false" v-model="dnItem.expected_shipping_date" />
              </div>
              <div v-if="errors.expected_shipping_date" class="invalid-feedback d-block">{{
                errors.expected_shipping_date }}</div>
            </div>

            <div class="mb-3">
              <label class="form-label">{{t('common.entities.recipient')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedRecipient"
                  :options="recipientSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                  :internal-search="false" label="name" track-by="id" :options-limit="100"
                  @search-change="fetchRecipientData" />
              </div>
              <div v-if="errors.recipient" class="invalid-feedback d-block">{{ errors.recipient }}</div>

            </div>

            <div class="mb-3">
              <label class="form-label">{{t('common.entities.carrier')}}</label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedCarrier"
                  :options="carrierSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                  :internal-search="false" label="name" track-by="id" :options-limit="100"
                  @search-change="fetchCarrierData" />
              </div>
              <div class="form-text fs-12" v-if="!dnItem.carrier_id">{{ t('dn.shipping-options.no-carrier') }}</div>
            </div>

            <!-- 运单服务选项：只在所选承运商声明了选项时显示 -->
            <div class="mb-3" v-if="dnItem.carrier_id && (optionsLoading || optionSchema.length)">
              <label class="form-label">{{ t('dn.shipping-options.title') }}</label>
              <div class="d-flex justify-content-center" v-if="optionsLoading">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                  <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
                </div>
              </div>
              <template v-else>
                <p class="fs-12 text-muted mb-2">{{ t('dn.shipping-options.hint') }}</p>
                <ShippingOptionsFields v-model="optionForm" :schema="optionSchema" id-prefix="dn-option" :errors="optionErrors" />
              </template>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('dn.fields.transportation')}}</label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="dn_transportation_mode" :show-labels="false"
                  :options="selectOptions.transportation_modes" :multiple="false" v-model="dnItem.transportation_mode"
                  :custom-label="(v: string) => translateOption(v, 'dn.transportation')">
                </VueMultiselect>
                
              </div>
            </div>



          </div>

          <div class="p-3 border-bottom border-block-end-dashed">
            <div class="mb-3">
              <label class="form-label">{{t('dn.fields.order-no')}}</label>
              <input type="text" class="form-control" id="service-charges" :placeholder="t('dn.form.placeholders.order-no')"
                v-model="dnItem.order_number">
            </div>
            <div class="mb-3">
              <label for="text-area" class="form-label">{{t('dn.fields.packing-info')}}</label>
              <textarea class="form-control" id="text-area" rows="2" v-model="dnItem.packaging_info"></textarea>
            </div>
            <div class="mb-3">
              <label for="text-area" class="form-label">{{t('dn.fields.special-handling')}}</label>
              <textarea class="form-control" id="text-area" rows="2" v-model="dnItem.special_handling"></textarea>
            </div>
            <div class="">
              <label for="text-area" class="form-label">{{t('common.fields.remark')}}</label>
              <textarea class="form-control" id="text-area" rows="3" v-model="dnItem.remark"></textarea>
            </div>
          </div>

          <div class="p-3 d-grid">
            <button type="button" class="btn btn-primary btn-wave mb-2" :disabled="submitting" @click="addDN()">
              <span v-if="submitting" class="spinner-border spinner-border-sm me-1"></span>{{t('dn.operations.add')}}
            </button>

            <NuxtLink to="/dn" class="btn btn-light btn-wave">
              {{t('dn.operations.back-to-list')}}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- End::row-1 -->
  <!-- Start::offcanvas -->
  <div class="offcanvas offcanvas-end" tabindex="-1" id="offcanvasRight" aria-labelledby="offcanvasBottomLabel">
    <div class="offcanvas-header">
      <h5 class="offcanvas-title" id="offcanvasRightLabel1">{{t('common.operations.add-item')}}</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <div class="col-12" v-if="!selectWareshouse">
        <div class="form-group mb-3">
          <label class="form-label">{{t('common.entities.warehouse')}} <abbr title="required" aria-hidden="true"
              class="text-danger">*</abbr></label>
          <div class="flex-nowrap input-group-custom">
            <VueMultiselect id="dn-warehouse" :show-labels="false" :options="selectOptions.warehouses" :multiple="false"
              v-model="selectWareshouse" label="name" track-by="id" :disabled="shouldDisableWarehouseSelect">
            </VueMultiselect>
          </div>
          <div v-if="errors.wareshouse" class="invalid-feedback d-block">{{ errors.wareshouse }}</div>
        </div>
      </div>
      <div class="col-12" v-else>
        <div class="border-bottom border-block-end-dashed">
          <div class="input-group mb-3">
            <input type="text" class="form-control" :placeholder="t('common.placeholders.goods-code')"  aria-label="Goods Code"
              aria-describedby="button-addon2" v-model="goodsSearch.code" @keyup.enter="handleSearch()">
            <button class="btn btn-primary" type="button" id="button-addon2" @click="handleSearch()"><i
                class="ri-search-line"></i></button>
          </div>
        </div>
        <div class="border-bottom border-block-end-dashed mb-3" v-if="!is_next">
          <div class="row d-flex justify-content-center mb-3" v-if="goodsSearch.loading">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
            </div>
          </div>
          <div v-if="goodsSearch.total>5" class="alert alert-warning alert-dismissible fade show mb-3" role="alert">
            <span>{{t('action-results.more-items-found',goodsSearch.total)}}</span>
          </div>
          <ul class="list-group list-group-flush mb-3">
            <li class="list-group-item" v-for="(item, index) in goodsSearch.results" :key="index">
              <div class="d-flex align-items-center">
                <input class="form-check-input me-2" type="radio" :value="item.goods?.id" name="list-radio"
                  v-model="goodsSearch.selected.goods_id" :disabled="availableForSale(item) <= 0" />
                <div class="ms-2">
                  <span class="avatar avatar-md me-2">
                    <NuxtLink :to="`/goods/detail/${item.goods?.id}`" target="_blank">
                      <img :src="item.goods?.thumbnail_url" alt="" v-if="item.goods?.thumbnail_url">
                      <img src="/images/goods/default.png" alt="" v-else>
                    </NuxtLink>
                  </span>
                </div>
                <div class="flex-fill">
                  <p class="fw-semibold mb-0">{{ item.goods?.name }}</p>
                  <span class="fs-12 text-muted">{{ item.goods?.code }}</span>
                  <p class="fw-semibold mb-0"><span class="badge rounded-pill bg-success me-2"
                      :class="availableForSale(item)>0?'bg-success':'bg-warning'">{{ availableForSale(item) }}</span>@{{
                    item.warehouse?.name }}</p>

                </div>
              </div>
            </li>

          </ul>

          <div v-if="goodsSearch.results?.length==0" class="alert alert-warning alert-dismissible fade show mb-3"
            role="alert">
            <span>{{t('error.no-found-data')}}</span>
          </div>

        </div>

        <div class="border-bottom border-block-end-dashed mb-3" v-else>
          <div class="rounded flex-nowrap mb-3">
            <label class="form-label">{{t('common.fields.quantity')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label><span class="text-danger fs-10 ms-2">({{t('common.quantities.max')}}:{{
              goodsSearch.selected.max_qty }})</span>
            <input v-maska:[] type="number" class="form-control number-format" id="product-quantity" data-maska="0"
              data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('common.placeholders.quantity')" min="1" step="1"
              v-model="goodsSearch.selected.quantity" :max="goodsSearch.selected.max_qty ?? undefined"
              @change="clampValue(goodsSearch.selected)" />
            <div v-if="errors.quantity" class="invalid-feedback d-block">{{ errors.quantity }}</div>
          </div>

          <div class="rounded flex-nowrap mb-3">
            <label class="form-label">{{t('common.fields.remark')}}</label>
            <textarea class="form-control" id="text-area" rows="5" v-model="goodsSearch.selected.remark"></textarea>
          </div>
        </div>

        <div class="d-grid" v-if="goodsSearch.selected.goods_id">
          <NuxtLink to="javascript:void(0);" class="btn btn-secondary btn-wave mb-2" @click="nextAddDNItem()"
            v-if="!is_next">
            {{t('button.next')}}
          </NuxtLink>
          <NuxtLink to="javascript:void(0);" class="btn btn-primary btn-wave mb-2" @click="addDNItem()" v-else>
            {{t('common.operations.add-item')}}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!-- End::offcanvas -->
  <!-- Start::Modal -->
  <div class="modal fade" id="editRemarkModal" tabindex="-1" aria-labelledby="editRemarkModalLabel" aria-hidden="true">
    <div class="modal-dialog  modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{t('common.operations.edit-remark')}}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <textarea class="form-control" id="text-area" rows="5" v-model="tempRemark"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal" @click="saveRemark()">{{t('button.save')}}</button>
        </div>
      </div>
    </div>
  </div>
  <!-- End::Modal -->
</template>

<style scoped>
/* Add any specific styles here */
</style>