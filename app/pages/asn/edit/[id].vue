<script lang="ts" setup>
import { useGoodsSearch } from '~/composables/goods/useGoodsSearch';
import { asnTypesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.ASN'),
  list: [t('nav.warehouse'), t('nav.ASN')]
}));

const warehouseStore = useWarehouseStore()
const router = useRouter()
const route = useRoute();
const asnId = route.params.id;
let loading = ref(true);

// 创建响应式表单引用
const asnItem = ref({
  supplier_id: null,
  tracking_number: null,
  carrier_id: null,
  asn_type: "inbound",
  expected_arrival_date: null,
  remark: null,
  warehouse_id: null,
  details: []
})

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/asn/${asnId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: async(data) => {
          asnItem.value = data;
          if (asnItem.value.status != 'pending'){
            await router.push('/asn/')
          }
        },
        onError: async(error) => {
            showToast(error.message, 'error')
            // 如果是404错误，跳转回到列表页
            if (error.status === 404) {
              await router.push('/asn/')
            }
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};

// 配置化选项集合
const selectOptions = reactive({
  asn_types: asnTypesOptions,
  warehouses:[]
})

const errors = ref({
  asn_type: null,
  wareshouse: null,
  supplier: null,
  details:null,
  quantity: null,
});

//处理仓库选择
const selectWareshouse = ref(null);

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
      asnItem.value.warehouse_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.wareshouse = null; // 清除错误信息
    } else {
      asnItem.value.warehouse_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

// 处理供应商选择
const isLoading = ref(false);
const selectedSupplier = ref(null);
const supplierSelectedOptions = ref([]);

const fetchSupplierData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/supplier/', {
        method: 'GET',
        params: {all: true,name: name},
        onSuccess: async(data) => {
          supplierSelectedOptions.value = data.items;
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
  () => selectedSupplier.value,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      asnItem.value.supplier_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.supplier = null; // 清除错误信息
    } else {
      asnItem.value.supplier_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

// 处理承运商选择
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
      asnItem.value.carrier_id = newVal.id;  // 将对象 ID 同步到表单
    } else {
      asnItem.value.carrier_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

onMounted(async() => {
  await fetchData();
  if (asnItem.value.warehouse) {
    selectWareshouse.value = asnItem.value.warehouse;
    selectOptions.warehouses = [asnItem.value.warehouse]
  }

  // 获取供应商列表
  if(asnItem.value.supplier) {
    await fetchSupplierData(asnItem.value.supplier.name);
    selectedSupplier.value = asnItem.value.supplier;
  }
  // 获取承运商列表
  if (asnItem.value.carrier) {
    await fetchCarrierData(asnItem.value.carrier.name);
    selectedCarrier.value = asnItem.value.carrier;
  }
  
})


// ------------------ 提交保存 ----------------------
const editASN = async () => {
  errors.value = {
    asn_type: !asnItem.value.asn_type ? t('common.validation.type-required') : null,
    wareshouse: !asnItem.value.warehouse_id ? t('common.validation.warehouse-required') : null,
    supplier: !asnItem.value.supplier_id ? t('common.validation.supplier-required') : null,
    details: asnItem.value.details.length === 0 ? t('common.validation.goods-item-required') : null
  }

  if (Object.values(errors.value).some(v => v)) return

  if (asnItem.value.expected_arrival_date) {
    asnItem.value.expected_arrival_date = safeFormatDate(asnItem.value.expected_arrival_date);
  }

  await httpRequest(`/api/warehouse/asn/${asnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: asnItem.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/asn/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })

}

// ------------------ 添加商品 ----------------------

// 整合所有搜索相关状态
// 组件中调用
const { state: goodsSearch, fetchGoods, resetSelection,resetState } = useGoodsSearch();
const handleSearch = () => {
  if (goodsSearch.code.trim()) {
    is_next.value = false;
    errors.value.quantity = null;
    fetchGoods();
    resetSelection();
  }
}

const is_next = ref(false);
const nextAddASNItem = () => {
  if (asnItem.value.details.some((item:any) => item.goods_id == goodsSearch.selected.goods_id)) {
    showToast(t('common.validation.goods-exists"'), 'error');
    return;
  }
  is_next.value = true;
  goodsSearch.selected.goods = goodsSearch.results.find((item:any) => item.id == goodsSearch.selected.goods_id);
}

const addASNItem = () => {
  if (!goodsSearch.selected.quantity) {
    errors.value.quantity = t('common.validation.quantity-required');
    return;
  }
  asnItem.value.details.push(goodsSearch.selected)
  resetState();
  is_next.value = false;
  errors.value.quantity = null;

}

//-------------------- 编辑表单项 ----------------------
const deleteItem = (detail:any) => {
  const index = asnItem.value.details.indexOf(detail);
  if (index > -1) {
    asnItem.value.details.splice(index, 1);
  }
}

const selectItem = ref({});
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
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>
   <!-- End::row-1 -->
  
  <!-- Start::row-1 -->
  <div class="row" v-if="asnItem?.status === 'pending' && !loading">
    <div class="col-xxl-9">
      <div class="card custom-card" id="cart-container-delete">
        <div class="card-header justify-content-between">
          <div class="card-title">
            {{t('asn.fields.items')}} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr><span
              class="badge rounded-pill bg-success ms-2" v-if="asnItem?.details?.length>0">{{
              asnItem?.details?.length}}</span>

          </div>
          <div class="d-flex">
            <button class="btn btn-sm btn-primary btn-wave waves-light" data-bs-toggle="offcanvas"
              data-bs-target="#offcanvasRight" aria-controls="offcanvasRight">
              <i class="ri-add-line fw-semibold align-middle me-1"></i> {{t('goods.operations.add')}}
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
                  <th>{{ t('goods.fields.weight') }} (kg)</th>
                  <th>{{ t('goods.fields.volume') }} (m³)</th>
                  <th class="d-none d-xl-table-cell">{{t('common.fields.remark')}}</th>
                  <th>{{ t('common.fields.action') }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="detail in asnItem?.details">
                  <td>
                    <div class="d-flex align-items-center">
                      <div class="me-2 lh-1">
                        <span class="avatar avatar-xxl me-2">
                          <NuxtLink :to="`/goods/detail/${detail?.goods?.id}`" target="_blank">
                            <img :src="detail?.goods?.thumbnail_url" alt="" v-if="detail?.goods?.thumbnail_url">
                            <img src="/images/goods/default.png" alt="" v-else>
                          </NuxtLink>
                        </span>
                      </div>
                      <div>
                        <p class="mb-0 fw-semibold">
                          <NuxtLink :to="`/goods/detail/${detail?.goods?.id}`" class="text-wrap" target="_blank">{{
                            detail?.goods?.name }}</NuxtLink>
                        </p>
                        <p class="mb-0 fs-11 text-muted">{{ detail?.goods?.code }}</p>
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
                        v-model="detail.quantity" min="1" step="1">
                    </div>
                  </td>
                  <td>
                    <div class="rounded flex-nowrap">
                      <input v-maska:[] type="text" class="form-control number-format" id="product-weight"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('goods.form.placeholders.weight')"
                        v-model="detail.weight">
                    </div>
                  </td>
                  <td>
                    <div class="rounded flex-nowrap">
                      <input v-maska:[] type="text" class="form-control number-format" id="product-volume"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('goods.form.placeholders.volume')"
                        v-model="detail.volume">
                    </div>
                  </td>
                  <td class="d-none d-xl-table-cell">
                    <div class=" text-wrap">
                      {{ detail.remark }}<span class="text-muted fs-12">
                        <NuxtLink to="" data-bs-toggle="modal" data-bs-target="#editRemarkModal" @click="editRemark(detail)"><i
                            class="ri-edit-line ms-2"></i></NuxtLink>
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
            <div class="text-center p-5 border border-top-0" v-if="asnItem?.details?.length==0">{{t('common.status.nothing-show')}}</div>
          </div>
          <div v-if="errors.details" class="invalid-feedback d-block">{{ errors.details }}</div>
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
              <label class="form-label">{{t('asn.fields.type')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="product-category" :show-labels="false" :options="selectOptions.asn_types"
                  :multiple="false" v-model="asnItem.asn_type"></VueMultiselect>
              </div>
              <div v-if="errors.asn_type" class="invalid-feedback d-block">{{ errors.asn_type }}</div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('common.entities.warehouse')}} <abbr title="required" aria-hidden="true"
                  class="text-default">({{t('common.tips.readonly')}})</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="asn-warehouse" :show-labels="false" :options="selectOptions.warehouses"
                  :multiple="false" v-model="selectWareshouse" label="name" track-by="id"
                  :disabled="shouldDisableWarehouseSelect"></VueMultiselect>
              </div>
              <div v-if="errors.wareshouse" class="invalid-feedback d-block">{{ errors.wareshouse }}</div>
            </div>

            <div class="mb-3">
              <label class="form-label">{{t('common.entities.supplier')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedSupplier"
                  :options="supplierSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                  :internal-search="false" label="name" track-by="id" :options-limit="100"
                  @search-change="fetchSupplierData" />
              </div>
              <div v-if="errors.supplier" class="invalid-feedback d-block">{{ errors.supplier }}</div>

            </div>

            <div class="mb-3">
              <label class="form-label">{{t('common.entities.carrier')}}</label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedCarrier"
                  :options="carrierSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                  :internal-search="false" label="name" track-by="id" :options-limit="100"
                  @search-change="fetchCarrierData" />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">{{t('common.fields.tracking-number')}}</label>
              <input type="text" class="form-control" id="service-charges" :placeholder="t('common.placeholders.tracking-number')" v-model="asnItem.tracking_number">
            </div>

            <div class="form-group">
              <label class="form-label">{{t('asn.fields.expected-arrival-date')}}</label>
              <div class="input-group flex-nowrap input-group-custom">
                <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                <Datepicker id="expected-arrival-date" :placeholder="t('asn.form.placeholders.expected-arrival-date')" class="form-control"
                  autoApply :enable-time-picker="false"  v-model="asnItem.expected_arrival_date" />
              </div>
            </div>
          </div>

          <div class="p-3 border-bottom border-block-end-dashed">
            <div class="">
              <label for="text-area" class="form-label">{{t('common.fields.remark')}}</label>
              <textarea class="form-control" id="text-area" rows="4" v-model="asnItem.remark"></textarea>
            </div>
          </div>

          <div class="p-3 d-grid">
            <NuxtLink to="javascript:void(0);" class="btn btn-primary btn-wave mb-2" @click="editASN()">
              {{t('asn.operations.edit')}}
            </NuxtLink>

            <NuxtLink to="/asn" class="btn btn-light btn-wave">
              {{t('asn.operations.back-to-list')}}
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
      <div class="col-12">
            <div class="border-bottom border-block-end-dashed">
              <div class="input-group mb-3">
                <input type="text" class="form-control" :placeholder="t('common.placeholders.goods-code')"  aria-label="Goods Code"
                  aria-describedby="button-addon2" v-model="goodsSearch.code" @keyup.enter="handleSearch()">
                <button class="btn btn-primary" type="button" id="button-addon2" @click="handleSearch()"><i class="ri-search-line" ></i></button>
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
                <li class="list-group-item" v-for="(goods, index) in goodsSearch.results" :key="index">
                  <div class="d-flex align-items-center">
                    <input class="form-check-input me-2" type="radio" :value="goods.id" name="list-radio" v-model="goodsSearch.selected.goods_id" />
                    <div class="me-2">
                      <span class="avatar avatar-md me-2">
                          <NuxtLink :to="`/goods/detail/${goods?.id}`" target="_blank">
                            <img :src="goods?.thumbnail_url" alt="" v-if="goods?.thumbnail_url">
                            <img src="/images/goods/default.png" alt="" v-else>
                          </NuxtLink>
                        </span>
                    </div>
                    <div class="flex-fill">
                      <p class="fw-semibold mb-0">{{ goods.name }}</p>
                      <span class="fs-12 text-muted">{{ goods.code }}</span>
                    </div>
                  </div>
                </li>

              </ul>

              <div v-if="goodsSearch.results?.length==0" class="alert alert-warning alert-dismissible fade show mb-3" role="alert">
                <span>{{t('goods.action-results.not-found')}}</span>
              </div>

            </div>

            <div class="border-bottom border-block-end-dashed mb-3" v-else>
              <div class="rounded flex-nowrap mb-3">
                <label class="form-label">{{t('common.fields.quantity')}} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr></label>
                <input v-maska:[] type="number" class="form-control number-format" id="product-quantity"
                  data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('common.placeholders.quantity')"
                    min="1" step="1" v-model="goodsSearch.selected.quantity" />
                <div v-if="errors.quantity" class="invalid-feedback d-block">{{ errors.quantity }}</div>
              </div>
              <div class="rounded flex-nowrap mb-3">
                <label class="form-label">{{t('goods.fields.weight')}} (kg)</label>
                <input v-maska:[] type="text" class="form-control number-format" id="product-weight"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('goods.form.placeholders.weight')"
                       v-model="goodsSearch.selected.weight" />
              </div>
              <div class="rounded flex-nowrap mb-3">
                <label class="form-label">{{t('goods.fields.volume')}} (m³)</label>
                <input v-maska:[] type="text" class="form-control number-format" id="product-volume"
                        data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('goods.form.placeholders.volume')"
                        v-model="goodsSearch.selected.volume" /> 
              </div>
              <div class="rounded flex-nowrap mb-3">
                <label class="form-label">{{t('common.fields.remark')}}</label>
                <textarea class="form-control" id="text-area" rows="5" v-model="goodsSearch.selected.remark"></textarea>
              </div>
            </div>
            
            <div class="d-grid" v-if="goodsSearch.selected.goods_id">
              <NuxtLink to="javascript:void(0);" class="btn btn-secondary btn-wave mb-2" @click="nextAddASNItem()" v-if="!is_next">
                {{t('button.next')}}
              </NuxtLink>
              <NuxtLink to="javascript:void(0);" class="btn btn-primary btn-wave mb-2" @click="addASNItem()" v-else>
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