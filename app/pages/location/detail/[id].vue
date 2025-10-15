<script lang="ts" setup>
import {removalReasonsOptions}  from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});



let loading = ref(true);
const router = useRouter();
let route = useRoute();
const locationId = route.params.id;

const itemData = ref(null);
const tabData = ref(null);

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.location'),
  list: [t('nav.warehouse'), t('nav.location')]
}));

const errors = ref({
  goods: null,
  location: null,
  quantity: null,
  reason: null,
});

// 处理库位选择
const isLoading = ref(false);
const selectedGoods = ref(null);
const goodsSelectedOptions = ref([]);
const quantity = ref(null);
const maxQuantity = ref(null);
const remark = ref(null);
const reason = ref(null);

const selectedLocation = ref(null);
const locationSelectedOptions = ref([]);

const fetchLocationData = async (code: string) => {
  if (!code) return;
  isLoading.value = true;
  
  const data = await httpRequest<PaginationData>('/api/warehouse/location/', {
    method: 'GET',
    params: { all: true, code },
    onSuccess: (data) => locationSelectedOptions.value = data.items,
    onError: (error) => showToast(error.message, 'error'),
    onFinally: () => isLoading.value = false
  });

  return data;
};

const fetchGoodsData = async (code: string) => {
  if (!code) return;
  isLoading.value = true;
  
  const data = await httpRequest<PaginationData>('/api/warehouse/goods/', {
    method: 'GET',
    params: { all: true, code },
    onSuccess: (data) => goodsSelectedOptions.value = data.items,
    onError: (error) => showToast(error.message, 'error'),
    onFinally: () => isLoading.value = false
  });

  return data;
};


const nameWithTypeAndWarehouse = (({ code,location_type,warehouse_name }: any) => {
  return `[${warehouse_name} | ${t('common.locations.'+location_type)}] ${code}`
})


const nameWithCodeAndName = (({ code, name }: any) => {
  return `${code} | ${name}`
})

const putawayFn = () => {
  selectedGoods.value = null;
}

const createPutaway = async () => {
  errors.value = {
    goods: null,
    quantity: null,
  };
  if (!selectedGoods.value) {
    errors.value.goods = t('location.validation.goods.required');
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('location.validation.quantity-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/putaway/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: locationId, goods_id: selectedGoods.value.id, quantity: quantity.value, remark: remark.value},
      onSuccess: async() => {        
        selectedGoods.value = null;
        quantity.value = null;
        remark.value = null;
        showToast(t('action-results.success'), 'success')
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
  selectedGoods.value = item.goods;
  maxQuantity.value = item.quantity;
}

const createRemoval = async () => {
  errors.value = {
    location: null,
    quantity: null,
  };
  if (!selectedGoods.value) {
    errors.value.goods = t('location.validation.goods.required');
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('location.validation.quantity-required');
    return;
  }
  if (!reason.value) {
    errors.value.reason = t('location.validation.reason-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/removal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: locationId, goods_id: selectedGoods.value.id, quantity: quantity.value, reason:reason.value, remark: remark.value},
      onSuccess: async() => {        
        selectedGoods.value = null;
        quantity.value = null;
        remark.value = null;
        reason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('removalModal');
        showToast(t('action-results.success'), 'success')
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
  selectedGoods.value = item.goods;
  maxQuantity.value = item.quantity;
}

const createTransfer = async () => {
  errors.value = {
    location: null,
    goods: null,
    quantity: null,
  };
  if (!selectedGoods.value) {
    errors.value.goods = t('location.validation.goods.required');
    return;
  }
  if (!selectedLocation.value) {
    errors.value.location = 'Please select a location.';
    return;
  }
  if (selectedLocation.value.id === locationId) {
    errors.value.location = 'The two locations cannot be the same.';
    return;
  }
  if (selectedLocation.value.warehouse_id !== itemData.value.warehouse_id) {
    errors.value.location = 'The two locations must be in the same warehouse.';
    return;
  }
  if (!quantity.value) {
    errors.value.quantity = t('location.validation.quantity-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/transfer/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {from_location_id: locationId, to_location_id:selectedLocation.value.id, goods_id: selectedGoods.value.id, quantity: quantity.value, remark: remark.value},
      onSuccess: async() => {        
        selectedGoods.value = null;
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        // 调用公共方法关闭模态框
        // closeModal('transferModal');
        showToast(t('action-results.success'), 'success')
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
    const data = await httpRequest(`/api/warehouse/location/${locationId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
        },
        onError: (error) => {
            if (error.status === 404) {
                // 如果商品不存在，跳转到商品列表页面
                showError({ statusCode: 404, message: t('action-results.not-found',{entity:t('common.entities.location'),identifier:locationId}) });
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
        params: {...route.query, location_id: locationId},
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
  fetchData();
  fetchTabData();
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
                  <LocationBox :depth=itemData.depth :width=itemData.width :height=itemData.height
                    :capacity=itemData.capacity :usagePercentage=null />
                </div>
              </div>
            </div>
            <div class="col-xxl-9 col-xl-12">
              <div class="row gx-5">
                <div class="col-xl-8 mt-xxl-0 mt-3">
                  <div>
                    <p class="fs-18 fw-semibold mb-3">{{ itemData?.code}} <span
                        class="badge rounded-pill bg-info fs-10 fw-normal ms-2">{{ itemData?.location_type }}</span></p>

                    <div class="mb-4" v-if="itemData?.description">
                      <p class="fs-15 fw-semibold mb-1">{{t('location.fields.description')}} :</p>
                      <p class="text-muted mb-0" v-html="itemData.description">
                      </p>
                    </div>

                    <div class="mb-4">
                      <p class="fs-15 fw-semibold mb-2">{{t('location.fields.specification')}} :</p>
                      <div class="row">
                        <div class="col-xl-6">
                          <ul class="mb-0">
                            <li class="text-muted mb-2" v-if="itemData?.location_type">
                              {{t('location.fields.location-type')}}: {{ itemData.location_type }}
                            </li>
                            <li class="text-muted" v-if="itemData?.capacity">
                              {{t('location.fields.capacity')}}: {{ itemData.capacity }} m³
                            </li>
                          </ul>
                        </div>
                        <div class="col-xl-6">
                          <ul class="mb-0">
                            <li class="text-muted mb-2" v-if="itemData?.depth">
                              {{t('location.fields.depth')}}: {{ itemData.depth }} cm
                            </li>
                            <li class="text-muted mb-2" v-if="itemData?.width">
                              {{t('location.fields.width')}}: {{ itemData.width }} cm
                            </li>
                            <li class="text-muted mb-2" v-if="itemData?.height">
                              {{t('location.fields.height')}}: {{ itemData.height }} cm
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
                      <NuxtLink :to="`/location/edit/${locationId}`" class="btn btn-primary mb-2">{{ t('location.operations.edit') }}
                      </NuxtLink>
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
                  @click="setActiveFilter('storage')">{{t('common.inventory-ops.storage')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'putaway' }" href="javascript:void(0);"
                  @click="setActiveFilter('putaway')">{{t('common.inventory-ops.putaway')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'removal' }" href="javascript:void(0);"
                  @click="setActiveFilter('removal')">{{t('common.inventory-ops.removal')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'adjustment' }" href="javascript:void(0);"
                  @click="setActiveFilter('adjustment')">{{t('common.inventory-ops.adjustment')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'transfer' }" href="javascript:void(0);"
                  @click="setActiveFilter('transfer')">{{t('common.inventory-ops.transfer')}}</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" :class="{ active: activeTab === 'cyclecount' }" href="javascript:void(0);"
                  @click="setActiveFilter('cyclecount')">{{t('common.inventory-ops.cycle-count')}}</a>
              </li>
            </ul>
          </div>
          <div class="d-flex">
            <button class="btn btn-sm btn-primary btn-wave waves-light" data-bs-toggle="modal"
              data-bs-target="#putawayModal" v-if="activeTab === 'putaway' || activeTab === 'storage'"
              @click="putawayFn()">
              <i class="ri-add-line fw-semibold align-middle me-1"></i> {{t('goods.operations.create-putaway')}}
            </button>

          </div>
        </div>

        <div class="card-body">
          <div class="row gx-5">

            <div class="table-responsive">
              <table class="table text-nowrap table-bordered table-hover">
                <thead>
                  <tr v-if="activeTab === 'storage'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="d-none d-lg-table-cell">Type</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.created') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.updated') }}</th>
                    <th scope="col">{{ t('common.fields.action') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'putaway'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.putaway') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'removal'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{t('common.fields.reason')}}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.removal') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'adjustment'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
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
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{ t('common.locations.from') }}</th>
                    <th scope="col">{{ t('common.locations.to') }}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.transfer') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'cyclecount'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.entities.task') }}</th>
                    <th scope="col">{{ t('common.quantities.actual') }}</th>
                    <th scope="col">{{ t('common.fields.difference') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="d-none d-lg-table-cell">{{ t('common.dates.updated') }}</th>
                    <th scope="col" class="d-none d-md-table-cell">{{ t('common.dates.completed') }}</th>
                  </tr>
                </thead>
                <tbody>

                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'storage'">
                    <td class="d-none d-md-table-cell">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {{ item?.quantity }}
                    </td>
                    <td class="d-none d-lg-table-cell">{{t('common.locations.'+item?.location?.location_type)}}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.created_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ $dayjs(item?.updated_at,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td>
                      <button class="btn btn-sm btn-warning btn-wave waves-light me-2" data-bs-toggle="modal"
                        data-bs-target="#removalModal" @click="removalFn(item)" title="Removal">
                        <i class="ri-arrow-down-line"></i>
                      </button>
                      <button class="btn btn-sm btn-info btn-wave waves-light" data-bs-toggle="modal"
                        data-bs-target="#transferModal" @click="transferFn(item)" title="Transfer">
                        <i class="ri-arrow-right-line"></i>
                      </button>
                    </td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'putaway'">
                    <td class="d-none d-md-table-cell">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>↑{{ item?.quantity }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.putaway_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'removal'">
                    <td class="d-none d-md-table-cell">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>↓{{ item?.quantity }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.reason }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.removal_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'adjustment'">
                    <td class="d-none d-md-table-cell">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <NuxtLink :to="`/adjustment/${item?.adjustment_id}`" target="_blank">ADJ-{{ item?.adjustment_id }}
                      </NuxtLink>
                    </td>
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
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.from_location_id}`" target="_blank"
                        v-if="locationId != item?.from_location_id">{{
                        nameWithTypeAndWarehouse(item?.from_location) }}</NuxtLink>
                    </td>
                    <td class="d-none d-md-table-cell">
                      <NuxtLink :to="`/location/detail/${item?.to_location_id}`" target="_blank"
                        v-if="locationId != item?.to_location_id">{{
                        nameWithTypeAndWarehouse(item?.to_location) }}
                      </NuxtLink>
                    </td>
                    <td>→{{ item?.quantity }}</td>
                    <td class="d-none d-lg-table-cell">{{ item?.operator_name }}</td>
                    <td class="d-none d-md-table-cell">{{ $dayjs(item?.transfer_time,'YYYY-MM-DD HH:mm:ss') }}</td>
                    <td class="d-none d-xl-table-cell">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'cyclecount'">
                    <td class="d-none d-md-table-cell">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink :to="`/goods/detail/${item?.goods?.id}`" class="text-wrap">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
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
              <div class="text-center p-5 border border-top-0" v-if="tabData?.items?.length <=0">{{t('common.status.nothing-show')}}</div>
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
            <label class="form-label">{{ t('common.entities.goods')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedGoods"
                :options="goodsSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                :internal-search="false" :custom-label="nameWithCodeAndName" label="code" track-by="id"
                :options-limit="100" @search-change="fetchGoodsData" />
            </div>
            <div v-if="errors.goods" class="invalid-feedback d-block">{{ errors.goods }}</div>
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
          <h6 class="modal-title" id="exampleModalLabel1">{{ t('goods.operations.create-removal')}}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">{{ t('common.entities.goods')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom" v-if="selectedGoods">
              {{ nameWithCodeAndName(selectedGoods) }}
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">{{ t('common.fields.quantity')}} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <input type="number" class="form-control" v-model="quantity" :placeholder="t('goods.form.placeholders.quantity')"
                :max="maxQuantity" :min="1" />
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


  <div class="modal fade" id="transferModal" tabindex="-1" aria-labelledby="transferModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title" id="exampleModalLabel1">{{ t('goods.operations.create-transfer') }}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">{{ t('common.entities.goods') }} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom" v-if="selectedGoods">
              {{ nameWithCodeAndName(selectedGoods) }}
            </div>
          </div>


          <div class="mb-3">
            <label class="form-label">{{ t('common.locations.to') }} <abbr title="required" aria-hidden="true"
                class="text-danger">*</abbr></label>
            <div class="flex-nowrap input-group-custom">
              <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedLocation"
                :options="locationSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                :internal-search="false" :custom-label="nameWithTypeAndWarehouse" label="code" track-by="id"
                :options-limit="100" @search-change="fetchLocationData" />
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