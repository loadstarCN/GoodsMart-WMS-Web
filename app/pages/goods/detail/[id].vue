<script lang="ts" setup>
import {removalReasonsOptions}  from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});



let loading = ref(true);
const router = useRouter();
let route = useRoute();
const productId = route.params.id;

const itemData = ref(null);
const tabData = ref(null);

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}));

const errors = ref({
  location: null,
  quantity: null,
  reason: null,
  from_location: null,
  to_location: null,
});

// 处理库位选择
const isLoading = ref(false);
const selectedLocation = ref(null);
const locationSelectedOptions = ref([]);
const quantity = ref(null);
const maxQuantity = ref(null);
const remark = ref(null);
const reason = ref(null);

const selectedFromLocation = ref(null);
const selectedToLocation = ref(null);
const locationFromSelectedOptions = ref([]);
const locationToSelectedOptions = ref([]);

const fetchLocationData = async (code: string, targetRef: Ref<any[]>) => {
  if (!code) return;
  isLoading.value = true;
  
  const data = await httpRequest<PaginationData>('/api/warehouse/location/', {
    method: 'GET',
    params: { all: true, code },
    onSuccess: (data) => targetRef.value = data.items,
    onError: (error) => showToast(error.message, 'error'),
    onFinally: () => isLoading.value = false
  });

  return data;
};

const fetchLocation = (code: string) => 
  fetchLocationData(code, locationSelectedOptions);

const fetchToLocation = (code: string) => 
  fetchLocationData(code, locationToSelectedOptions);

const nameWithTypeAndWarehouse = (({ code,location_type,warehouse_name }: any) => {
  return `[${warehouse_name} | ${t('common.locations.'+location_type)}] ${code}`
})

const putawayFn = () => {
  selectedLocation.value = null;
}

const createPutaway = async () => {
  errors.value = {
    location: null,
    quantity: null,
  };
  if (!selectedLocation.value) {
    errors.value.location = t('goods.validation.location.required');
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('goods.validation.quantity-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/putaway/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: selectedLocation.value.id, goods_id: productId, quantity: quantity.value, remark: remark.value},
      onSuccess: async() => {        
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-putaway')}), 'success')
        await fetchTabData();      
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

const removalFn = (item: any) => {
  selectedLocation.value = item.location;
  maxQuantity.value = item.quantity;
}

const createRemoval = async () => {
  errors.value = {
    location: null,
    quantity: null,
  };
  if (!selectedLocation.value) {
    errors.value.location = t('goods.validation.location.required');
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('goods.validation.quantity-required');
    return;
  }
  if (!reason.value) {
    errors.value.quantity = t('goods.validation.reason-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/removal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: selectedLocation.value.id, goods_id: productId, quantity: quantity.value, reason:reason.value, remark: remark.value},
      onSuccess: async() => {        
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        reason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('removalModal');
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-removal')}), 'success')
        await fetchTabData();      
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

const transferFn = (item: any) => {
  selectedFromLocation.value = item.location;
  maxQuantity.value = item.quantity;
}

const createTransfer = async () => {
  errors.value = {
    from_location: null,
    to_location: null,
    quantity: null,
  };
  if (!selectedFromLocation.value) {
    errors.value.from_location = t('goods.validation.location.required');
    return;
  }
  if (!selectedToLocation.value) {
    errors.value.to_location = t('goods.validation.location.required');
    return;
  }
  if (selectedFromLocation.value.id === selectedToLocation.value.id) {
    errors.value.to_location = t('goods.validation.location.not-same');
    return;
  }
  if (selectedFromLocation.value.warehouse_id !== selectedToLocation.value.warehouse_id) {
    errors.value.to_location = t('goods.validation.location.same-warehouse');
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('goods.validation.quantity-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/transfer/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {from_location_id: selectedFromLocation.value.id, to_location_id:selectedToLocation.value.id, goods_id: productId, quantity: quantity.value, remark: remark.value},
      onSuccess: async() => {        
        selectedFromLocation.value = null;
        selectedToLocation.value = null;
        quantity.value = null;
        remark.value = null;
        // 调用公共方法关闭模态框
        // closeModal('transferModal');
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-transfer')}), 'success')
        await fetchTabData();      
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

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/goods/${productId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          // 将tags字符串转换为数组
          itemData.value.tags = convert_tags_to_array(data.tags)
        },
        onError: (error) => {
            if (error.status === 404) {
                // 如果商品不存在，跳转到商品列表页面
                showError({ statusCode: 404, message: t('action-results.not-found',{entity:t('common.entities.goods'),identifier:productId}) });
            }else {
                showToast(error.message, 'error')
            }            
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};


const fetchTabData = async () => {
    let url = '';
    switch (activeTab.value) {
        case 'storage':
            url = '/api/warehouse/goods/locations/'
            break;
        case 'putaway':
            url = '/api/warehouse/putaway/'
            break;
        case 'removal':
            url = '/api/warehouse/removal/'
            break;
        case 'adjustment':
            url = '/api/warehouse/adjustment/details/search/'
            break;
        case 'transfer':
            url = '/api/warehouse/transfer/'
            break;
        case 'cyclecount':
            url = '/api/warehouse/cyclecount/details/search/'
            break;
        default:
            url = '/api/warehouse/goods/locations/'
            break;
    }
    loading.value = true;
    const data = await httpRequest(url, {
        method: 'GET',
        params: {...route.query, goods_id: productId},
        onSuccess: (data) => {
          tabData.value = data;
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


const activeTab = computed(() => {
  return route.query.tab || "storage"
})
// 处理标签切换
const setActiveFilter = (tab: string | null) => {
  const query: Record<string, any> = { ...route.query }

  // 处理状态参数
  if (tab === null) {
    delete query.tab
  } else {
    query.tab = tab
  }

  // 切换过滤条件时重置页码
  query.page = '1'
  
  router.push({ query })
}

watch(() => route.query, async () => {
    // await fetchData();
    await fetchTabData();
});

onMounted(async() => {
  await fetchData();
  await fetchTabData();
});


</script>
<template>
  <PageHeader :propData="dataToPass" />
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>
  <div class="row" v-else>
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="row gx-5">
            <div class="col-xxl-3 col-xl-12">
              <div class="row flex-column justify-content-center align-items-center">
                <div class="col-xxl-12 col-xl-6 col-lg-6 col-md-6 col-sm-12 mb-md-5 mb-3">
                  <img :src="itemData?.image_url" class="img-fluid rounded" :alt="itemData?.name"
                    v-if="itemData?.image_url" />
                  <img src="/images/goods/default.png" class="img-fluid rounded" :alt="itemData?.name" v-else>
                </div>
              </div>
            </div>
            <div class="col-xxl-9 col-xl-12">
              <div class="row gx-5">
                <div class="col-xl-8 mt-xxl-0 mt-3">
                  <div>
                    <p class="mb-0">{{ itemData?.code }}</p>
                    <p class="fs-18 fw-semibold mb-2">{{ itemData?.name}}</p>
                    <p class="mb-2">
                      <span v-for="(tag, index) in itemData?.tags" :key="index"
                        class="badge bg-light text-default me-2">{{ tag }}</span>
                    </p>
                    <p class="fs-18 mb-4">
                      <span class="text-info fw-semibold text-muted ms-1" v-if="itemData?.category">{{ itemData?.category
                        }}</span>
                    </p>
                    <div class="row mb-4">
                      <div class="col-xxl-4 col-xl-12" v-if="itemData?.price">
                        <p class="mb-1 lh-1 fs-11 text-success fw-semibold">{{ t('goods.fields.price') }}</p>
                        <p class="mb-1"><span class="h5">{{ $currency(itemData?.price, {currencyType:
                            itemData?.currency,displayMode : 'code'}) }}</span><span
                            class="ms-3 badge bg-danger-transparent" v-if="itemData?.discount_price">{{
                            Math.round(itemData?.discount_price/itemData?.price*100) }}% {{ t('goods.fields.off') }}</span></p>
                        <p class="mb-0 text-muted fs-12" v-if="itemData?.discount_price">{{ t('goods.fields.discount-price') }}​-{{
                          $currency(itemData?.discount_price,
                          {currencyType: itemData?.currency,displayMode : 'code'}) }}</p>
                      </div>

                      <div class="col-xxl-4 col-xl-12" v-if="itemData?.brand">
                        <p class="mb-2 fs-15 fw-semibold">{{ t('goods.fields.brand') }}</p>
                        <p class="text-wrap mb-0">{{itemData.brand}}
                        </p>
                      </div>
                      <div class="col-xxl-4 col-xl-12" v-if="itemData?.manufacturer">
                        <p class="mb-2 fs-15 fw-semibold">{{ t('goods.fields.manufacturer') }}</p>
                        <p class="text-wrap mb-0">{{itemData.manufacturer}}
                        </p>
                      </div>
                    </div>

                    <div class="mb-4" v-if="itemData?.description">
                      <p class="fs-15 fw-semibold mb-1">{{ t('goods.fields.description') }}</p>
                      <p class="text-muted mb-0" v-html="itemData.description">
                      </p>
                    </div>

                    <div class="mb-4">
                      <p class="fs-15 fw-semibold mb-2">{{ t('goods.fields.specification') }}</p>
                      <div class="row">
                        <div class="col-xl-6">
                          <ul class="mb-0">
                            <li class="text-muted mb-2" v-if="itemData?.unit">
                              {{ t('goods.fields.unit') }}: {{ itemData.unit }}
                            </li>
                            <li class="text-muted" v-if="itemData?.weight">
                              {{ t('goods.fields.weight') }}: {{ itemData.weight }} kg
                            </li>
                          </ul>
                        </div>
                        <div class="col-xl-6">
                          <ul class="mb-0">
                            <li class="text-muted mb-2" v-if="itemData?.length">
                              {{ t('goods.fields.length') }}: {{ itemData.length }} mm
                            </li>
                            <li class="text-muted mb-2" v-if="itemData?.width">
                              {{ t('goods.fields.width') }}: {{ itemData.width }} mm
                            </li>
                            <li class="text-muted mb-2" v-if="itemData?.height">
                              {{ t('goods.fields.height') }}: {{ itemData.height }} mm
                            </li>

                          </ul>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-xl-4 mt-xxl-0 mt-3">
                  <div class="mb-4 text-center mt-3">
                    <Barcode :value="itemData?.code" />
                  </div>
                  <div class="mb-4">
                    <div class="row">
                      <div class="col-xl-12">
                        <div class="table-responsive">
                          <table class="table table-bordered text-nowrap">
                            <tbody>
                              <tr v-if="itemData?.production_date">
                                <th scope="row" class="fw-semibold">
                                  {{ t('goods.fields.product-date') }}
                                </th>
                                <td>
                                  {{ itemData?.production_date }}
                                </td>
                              </tr>
                              <tr v-if="itemData?.extra_data">
                                <th scope="row" class="fw-semibold">
                                  {{ t('goods.fields.expiry-date') }}
                                </th>
                                <td>
                                  {{ itemData?.expiration_date }}
                                </td>
                              </tr>
                              <tr>
                                <th scope="row" class="fw-semibold">
                                  {{ t('common.users.creator') }}
                                </th>
                                <td>
                                  {{ itemData?.creator.user_name }}
                                </td>
                              </tr>
                              <tr>
                                <th scope="row" class="fw-semibold">
                                  {{ t('common.dates.created') }}
                                </th>
                                <td>
                                  {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                                </td>
                              </tr>
                              <tr>
                                <th scope="row" class="fw-semibold">
                                  {{ t('common.dates.updated') }}
                                </th>
                                <td>
                                  {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                                </td>
                              </tr>

                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="mb-5">
                    <div class="d-grid">
                      <NuxtLink :to="`/goods/edit/${productId}`" class="btn btn-primary mb-2">{{ t('goods.operations.edit') }}</NuxtLink>
                      <NuxtLink :to="`/inventory?goods_id=${productId}`" class="btn btn-secondary mb-2">{{ t('goods.operations.view-inventory') }}</NuxtLink>
                    </div>
                  </div>
                </div>
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
                <a class="nav-link" :class="{ active: activeTab === 'storage' }" href="javascript:void(0);"
                  @click="setActiveFilter('storage')">{{ t('common.inventory-ops.storage') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'putaway' }" href="javascript:void(0);"
                  @click="setActiveFilter('putaway')">{{ t('common.inventory-ops.putaway') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'removal' }" href="javascript:void(0);"
                  @click="setActiveFilter('removal')">{{ t('common.inventory-ops.removal') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'adjustment' }" href="javascript:void(0);"
                  @click="setActiveFilter('adjustment')">{{ t('common.inventory-ops.adjustment') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'transfer' }" href="javascript:void(0);"
                  @click="setActiveFilter('transfer')">{{ t('common.inventory-ops.transfer') }}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'cyclecount' }" href="javascript:void(0);"
                  @click="setActiveFilter('cyclecount')">{{ t('common.inventory-ops.cycle-count') }}</a>
              </li>
            </ul>
          </div>
          <div class="d-flex">
            <button class="btn btn-sm btn-primary btn-wave waves-light" data-bs-toggle="modal"
              data-bs-target="#putawayModal" v-if="activeTab === 'putaway' || activeTab === 'storage'" @click="putawayFn()">
              <i class="ri-add-line fw-semibold align-middle me-1"></i> {{ t('goods.operations.create-putaway') }}
            </button>

          </div>
        </div>

        <div class="card-body">
          <div class="row gx-5">

            <div class="table-responsive">
              <table class="table text-nowrap table-bordered table-hover">
                <thead>
                  <tr v-if="activeTab === 'storage'">
                    <th scope="col">{{ t('common.entities.location') }}</th>
                    <th scope="col">{{ t('common.fields.quantity') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.type') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.created') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.updated') }}</th>
                    <th scope="col">{{ t('common.fields.action') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'putaway'">
                    <th scope="col">{{ t('common.entities.location') }}</th>
                    <th scope="col">{{ t('common.fields.quantity') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.putaway') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.remark') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'removal'">
                    <th scope="col">{{ t('common.entities.location') }}</th>
                    <th scope="col">{{ t('common.fields.quantity') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.reason') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.removal') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.remark') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'adjustment'">
                    <th scope="col">{{ t('common.entities.location') }}</th>
                    <th scope="col">{{ t('common.inventory-ops.adjustment') }}</th>
                    <th scope="col">{{ t('common.quantities.system') }}</th>
                    <th scope="col">{{ t('common.quantities.actual') }}</th>
                    <th scope="col">{{ t('common.quantities.adjusted') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.approved') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.completed') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.approver') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.reason') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'transfer'">
                    <th scope="col">{{ t('common.locations.from') }}</th>
                    <th scope="col">{{ t('common.locations.to') }}</th>
                    <th scope="col">{{ t('common.fields.quantity') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.transfer') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.fields.remark') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'cyclecount'">
                    <th scope="col">{{ t('common.entities.location') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.entities.task') }}</th>
                    <th scope="col">{{ t('common.quantities.actual') }}</th>
                    <th scope="col">{{ t('common.fields.difference') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.completed') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.updated') }}</th>
                  </tr>
                </thead>
                <tbody>

                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'storage'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.location?.id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.location) }}
                      </NuxtLink>
                    </td>
                    <td>
                      {{ item?.quantity }}
                    </td>
                    <td class="d-none d-lg-table-cell">{{t('common.locations.'+item?.location?.location_type)}}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.created_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ $dayjs(item?.updated_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td>
                      <button class="btn btn-sm btn-warning btn-wave waves-light me-2" data-bs-toggle="modal"
                        data-bs-target="#removalModal" @click="removalFn(item)" :title="t('common.inventory-ops.removal')">
                        <i class="ri-arrow-down-line"></i>
                      </button>
                      <button class="btn btn-sm btn-info btn-wave waves-light" data-bs-toggle="modal"
                        data-bs-target="#transferModal" @click="transferFn(item)" :title="t('common.inventory-ops.transfer')">
                        <i class="ri-arrow-right-line"></i>
                      </button>
                    </td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'putaway'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.location_id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.location) }}
                      </NuxtLink>
                    </td>
                    <td>↑{{ item?.quantity }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.putaway_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'removal'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.location_id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.location) }}
                      </NuxtLink>
                    </td>
                    <td>↓{{ item?.quantity }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.reason }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.removal_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'adjustment'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.location?.id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.location) }}
                      </NuxtLink>
                    </td>
                    <td><NuxtLink :to="`/adjustment/detail/${item?.adjustment_id}`" target="_blank">ADJ-{{ item?.adjustment_id }}</NuxtLink></td>
                    <td>{{ item?.system_quantity }}</td>
                    <td>{{ item?.actual_quantity }}</td>
                    <td>{{ item?.adjustment_quantity }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.adjustment?.approved_at,'YYYY-MM-DD HH:mm:ss') }}
                    </td>
                    <td class="d-none d-xl-table-cell">{{ $dayjs(item?.adjustment?.completed_at,'YYYY-MM-DD HH:mm:ss')
                      }}</td>
                    <td>{{ item?.approver?.user_name }}</td>
                    <td>{{ item?.operator?.user_name }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.adjustment?.adjustment_reason }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'transfer'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.from_location_id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.from_location) }}</NuxtLink>
                    </td>
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.to_location_id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.to_location) }}
                      </NuxtLink>
                    </td>
                    <td>→{{ item?.quantity }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.transfer_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'cyclecount'">
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.location?.id}`" target="_blank">{{ nameWithTypeAndWarehouse(item?.location) }}
                      </NuxtLink>
                    </td>
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/cyclecount/${item?.task_id}`" target="_blank">CC-{{ item?.task_id }}</NuxtLink>
                    </td>
                    <td>{{ item?.actual_quantity }}</td>
                    <td>{{ item?.difference }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator?.user_name }}</td>
                    <td class="d-none d-xl-table-cell">{{ $dayjs(item?.updated_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.completed_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="text-center p-5 border border-top-0" v-if="tabData?.items?.length <=0">{{ t('common.status.nothing-show')}}</div>
            </div>

          </div>
        </div>
        <div class="card-footer border-top-0">
          <div class="d-flex align-items-center justify-content-between flex-wrap">
            <template v-if="tabData">
              <Pagination :page-size=tabData?.per_page :current-page=tabData?.page :total=tabData?.total
                :params=$route.query v-if="tabData.pages > 1"></Pagination>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>


  <div class="modal fade" id="putawayModal" tabindex="-1" aria-labelledby="putawayModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{ t('goods.operations.create-putaway')}}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">{{ t('common.entities.location')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedLocation"
                :options="locationSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                :internal-search="false" :custom-label="nameWithTypeAndWarehouse" label="code" track-by="id"
                :options-limit="100" @search-change="fetchLocation" />
            </div>
            <div v-if="errors.location" class="invalid-feedback d-block">{{ errors.location }}</div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.quantity')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <input type="number" class="form-control" v-model="quantity" :placeholder="t('common.placeholders.quantity')" />
              <div v-if="errors.quantity" class="invalid-feedback d-block">{{ errors.quantity }}</div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.remark')}}</label>
            <div class="flex-nowrap input-group-custom">
              <textarea class="form-control" v-model="remark" :placeholder="t('common.placeholders.remark')"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" @click="createPutaway">{{ t('button.submit') }}</button>
        </div>
      </div>
    </div>
  </div>


  <div class="modal fade" id="removalModal" tabindex="-1" aria-labelledby="removalModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{ t('goods.operations.create-removal')}} </h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
              <label class="form-label">{{ t('common.entities.location')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom"  v-if="selectedLocation" >
                {{ nameWithTypeAndWarehouse(selectedLocation) }}
              </div>
            </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.quantity')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <input type="number" class="form-control" v-model="quantity" :placeholder="t('goods.form.placeholders.quantity')" :max="maxQuantity" :min="1" />
              <div v-if="errors.quantity" class="invalid-feedback d-block">{{ errors.quantity }}</div>
            </div>
          </div>
          <div class="mb-3">
            <label for="removal-reason" class="form-label">{{ t('common.fields.reason')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <VueMultiselect id="removal-reason" :show-labels="false" :options="removalReasonsOptions" :multiple="false"
              v-model="reason">
            </VueMultiselect>
            <div v-if="errors.reason" class="invalid-feedback d-block">{{ errors.reason }}</div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.remark')}}</label>
            <div class="flex-nowrap input-group-custom">
              <textarea class="form-control" v-model="remark" :placeholder="t('goods.form.placeholders.remark')"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" @click="createRemoval">{{ t('button.submit') }}</button>
        </div>
      </div>
    </div>
  </div>


  <div class="modal fade" :class="{ show: showModal, 'd-block': showModal }" id="transferModal" tabindex="-1" aria-labelledby="transferModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{ t('goods.operations.create-transfer') }}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
              <label class="form-label">{{ t('common.locations.from') }} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom"  v-if="selectedFromLocation" >
                {{ nameWithTypeAndWarehouse(selectedFromLocation) }}
            </div>
            </div>

            
          <div class="mb-3">
            <label class="form-label">{{ t('common.locations.to') }} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedToLocation"
                :options="locationToSelectedOptions" :placeholder="t('common.search-placeholder')" 
                :loading="isLoading"
                :internal-search="false" :custom-label="nameWithTypeAndWarehouse" label="code" track-by="id"
                :options-limit="100" @search-change="fetchToLocation" />
            </div>
            <div v-if="errors.to_location" class="invalid-feedback d-block">{{ errors.to_location }}</div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.quantity')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <input type="number" class="form-control" v-model="quantity" :placeholder="t('common.placeholders.quantity')" />
              <div v-if="errors.quantity" class="invalid-feedback d-block">{{ errors.quantity }}</div>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.remark')}}</label>
            <div class="flex-nowrap input-group-custom">
              <textarea class="form-control" v-model="remark" :placeholder="t('goods.form.placeholders.remark')"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('button.close') }}</button>
          <button type="button" class="btn btn-primary" @click="createTransfer">{{ t('button.submit') }}</button>
        </div>
      </div>
    </div>
  </div>

</template>
<style>

</style>