<script lang="ts" setup>
import LocationMapPreview from '~/components/warehouse/LocationMapPreview.vue'
import LocationActivity from '~/components/inventory/LocationActivity.vue'
import {removalReasonsOptions}  from '~/data/selectOptions'
import { pendingPutaway, putawayLimit, putawayQuantityError, type PendingPutaway } from '~/composables/inventory/putawayStock'

// 定义页面元数据
definePageMeta({
});



let loading = ref(true);
const router = useRouter();
let route = useRoute();
const locationId = Number(route.params.id);
const staff = useStaffStore();
const operation = ref<'putaway'|'removal'|'transfer'|null>(null);
const modalOpen = computed({ get:()=>operation.value!==null,set:value=>{if(!value)operation.value=null} });

const itemData = ref<any>(null);
const tabData = ref<any>(null);

// 获取国际化方法
const { t } = useI18n();
// 上架 / 下架 / 移库失败按业务码显示三语文案（如移库时源库位没有该商品 16120）
const { bizErrorMessage } = useBizError();
// 库位类型 / 下架原因存代码，显示译名
const { locationTypeLabel, removalReasonLabel } = useOptionLabel();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.location'),
  list: [t('nav.warehouse'), t('nav.location')]
}));

const errors = ref<Record<string, any>>({
  goods: null,
  location: null,
  quantity: null,
  reason: null,
  transfer_reason: null,
});

// 处理库位选择
const isLoading = ref(false);
const selectedGoods = ref<any>(null);
const goodsSelectedOptions = ref<any[]>([]);
const quantity = ref<any>(null);
const maxQuantity = ref<any>(null);
const remark = ref<any>(null);
const reason = ref<any>(null);

const selectedLocation = ref<any>(null);
const locationSelectedOptions = ref<any[]>([]);
// 移库原因：从破损 / 退货库位（本库位）移回标准库位（货重新变成可售）必填，否则后端 400 15018；被后端以 15018 拦下时也显示
const transferReason = ref<any>(null);
const transferReasonRequired = computed(() =>
  ['damaged', 'return'].includes(itemData.value?.location_type)
  && selectedLocation.value?.location_type === 'standard');
const showTransferReason = computed(() => transferReasonRequired.value || !!errors.value.transfer_reason);

const fetchLocationData = async (code: string) => {
  if (!code) return;
  isLoading.value = true;

  const data = await httpRequest<PaginationData>('/api/warehouse/location/', {
    method: 'GET',
    params: { all: true, code },
    headers: warehouseHeaders(itemData.value?.warehouse_id),
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
    headers: warehouseHeaders(itemData.value?.warehouse_id),
    onSuccess: (data) => goodsSelectedOptions.value = data.items,
    onError: (error) => showToast(error.message, 'error'),
    onFinally: () => isLoading.value = false
  });

  return data;
};


const nameWithTypeAndWarehouse = (({ code,location_type,warehouse_name }: any) => {
  return `[${warehouse_name} | ${locationTypeLabel(location_type)}] ${code}`
})


const nameWithCodeAndName = (({ code, name }: any) => {
  return `${code} | ${name}`
})

// ------------------ 上架：所选商品在本仓库的待上架（良品 / 破损） ----------------------
// 本库位是标准 / 退货库位时只能上良品；读不到库存（没有库存查看权限等）时不提示、不预校验，以后端为准
const putawayInventory = ref<any | null | undefined>(undefined);
const putawayPending = computed<PendingPutaway | null>(() => {
  if (putawayInventory.value === undefined) return null;
  return pendingPutaway(putawayInventory.value) ?? { total: 0, good: 0, damaged: 0 };
});
const putawayMax = computed<number | null>(() =>
  putawayPending.value ? putawayLimit(putawayPending.value, itemData.value?.location_type) : null
);
const loadPutawayInventory = async (goodsId: number | null | undefined) => {
  putawayInventory.value = undefined;
  const warehouseId = itemData.value?.warehouse_id;
  if (!goodsId || !warehouseId) return;
  await httpRequest(`/api/warehouse/inventory/goods/${goodsId}/warehouse/${warehouseId}`, {
    method: 'GET',
    headers: warehouseHeaders(warehouseId),
    onSuccess: (data) => {
      // 选的商品在等待期间换了：丢弃旧结果
      if (selectedGoods.value?.id === goodsId) putawayInventory.value = data || null;
    },
    onError: (error) => {
      // 本仓库还没有该商品的库存记录 = 没有待上架
      if (selectedGoods.value?.id === goodsId) putawayInventory.value = error.status === 404 ? null : undefined;
    },
  });
};
// 上架弹窗打开期间才按所选商品查库存（下架 / 移库弹窗也用 selectedGoods）
const activePutaway = ref(false);
watch(() => selectedGoods.value?.id, (goodsId) => {
  if (activePutaway.value) loadPutawayInventory(goodsId);
});

const putawayFn = () => {
  activePutaway.value = true;
  selectedGoods.value = null;
  quantity.value = null;
  remark.value = null;
  errors.value.goods = null;
  errors.value.quantity = null;
  putawayInventory.value = undefined;
}

const createPutaway = async () => {
  if (loading.value) return;
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
  // 预校验待上架数量（后端同样会拦：超出待上架 15007；标准 / 退货库位超出良品 15016）
  const quantityError = putawayQuantityError(putawayPending.value, itemData.value?.location_type, Number(quantity.value));
  if (quantityError) {
    errors.value.quantity = bizErrorMessage(quantityError);
    return;
  }
  loading.value = true;
  const goodsId = selectedGoods.value.id;
  const data = await httpRequest('/api/warehouse/putaway/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...warehouseHeaders(itemData.value?.warehouse_id) },
      body: {location_id: locationId, goods_id: selectedGoods.value.id, quantity: Number(quantity.value), remark: remark.value},
      onSuccess: async() => {
        selectedGoods.value = null;
        quantity.value = null;
        remark.value = null;
        operation.value=null;
        showToast(t('action-results.success'), 'success')
        await fetchTabData();
        await loadOverview();
      },
      onError: (error) => {
          // 15016 破损品不能上到标准 / 退货库位、15007 待上架不足：标在数量下，并刷新待上架
          if (error.code === 15016 || error.code === 15007) {
            errors.value.quantity = bizErrorMessage(error);
            loadPutawayInventory(goodsId);
          }
          showToast(bizErrorMessage(error), 'error')
      },
      onFinally: () => {
          loading.value = false;
      }
  })
  return data;
};

const removalFn = (item: any) => {
  activePutaway.value = false;
  selectedGoods.value = item.goods;
  maxQuantity.value = item.quantity;
}

const createRemoval = async () => {
  if (loading.value) return;
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
      headers: { 'Content-Type': 'application/json', ...warehouseHeaders(itemData.value?.warehouse_id) },
      body: {location_id: locationId, goods_id: selectedGoods.value.id, quantity: Number(quantity.value), reason:reason.value, remark: remark.value},
      onSuccess: async() => {
        selectedGoods.value = null;
        quantity.value = null;
        remark.value = null;
        reason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('removalModal');
        operation.value=null;
        showToast(t('action-results.success'), 'success')
        await fetchTabData();
        await loadOverview();
      },
      onError: (error) => {
          showToast(bizErrorMessage(error), 'error')
      },
      onFinally: () => {
          loading.value = false;
      }
  })
  return data;
};

const transferFn = (item: any) => {
  activePutaway.value = false;
  selectedGoods.value = item.goods;
  maxQuantity.value = item.quantity;
  transferReason.value = null;
  errors.value.transfer_reason = null;
}

const createTransfer = async () => {
  if (loading.value) return;
  // 原因输入显示着时才带上 reason
  const reasonText = showTransferReason.value ? String(transferReason.value ?? '').trim() : '';
  errors.value = {
    location: null,
    goods: null,
    quantity: null,
    transfer_reason: null,
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
  if (transferReasonRequired.value && !reasonText) {
    errors.value.transfer_reason = t('location.validation.reason-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/transfer/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...warehouseHeaders(itemData.value?.warehouse_id) },
      body: {from_location_id: locationId, to_location_id:selectedLocation.value.id, goods_id: selectedGoods.value.id, quantity: Number(quantity.value), remark: remark.value, reason: reasonText || undefined},
      onSuccess: async() => {
        selectedGoods.value = null;
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        transferReason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('transferModal');
        operation.value=null;
        showToast(t('action-results.success'), 'success')
        await fetchTabData();
        await loadOverview();
      },
      onError: (error) => {
          // 15018 移回标准库位没填原因：标在原因下
          if (error.code === 15018) {
            errors.value.transfer_reason = bizErrorMessage(error);
          }
          showToast(bizErrorMessage(error), 'error')
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


let historyGeneration=0
const fetchTabData = async () => {
    const seq=++historyGeneration; if(!activeTab.value){tabData.value=null;loading.value=false;return}
    let url = '';
    switch (activeTab.value) {
        case 'all':
            url = '/api/warehouse/stock-ledger/'
            break;
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
        headers: warehouseHeaders(itemData.value?.warehouse_id),
        onSuccess: (data) => {
          if(seq===historyGeneration)tabData.value = data;
        },
        onError: (error) => {
            if(seq===historyGeneration)showToast(error.message, 'error')
        },
        onFinally: () => {
            if(seq===historyGeneration)loading.value = false;
        }
    })
    return data;
};


const activeTab = computed(() => {
  const allowed=historyTabs.value.map(row=>row.key);return allowed.includes(String(route.query.tab))?String(route.query.tab):allowed[0]||''
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
        await loadOverview();
});

onMounted(async() => {
  await fetchData();
  await fetchTabData();
        await loadOverview();
});



useHead({title:()=>itemData.value?.code||t('nav.location')})
const historyTabs=computed(()=>['all','putaway','removal','adjustment','transfer','cyclecount'].filter(key=>staff.hasPermission(key==='all'?'inventory_read':key+'_read')).map(key=>({key,label:t('location.ui.'+key)})))
const openOperation=(kind:'putaway'|'removal'|'transfer',row?:any)=>{
 quantity.value=null;remark.value=null;reason.value=null;selectedLocation.value=null;errors.value={};
 if(kind==='putaway')putawayFn();else if(kind==='removal')removalFn(row);else transferFn(row);
 operation.value=kind;
}
const selectedGoodsId=computed({get:()=>selectedGoods.value?.id??null,set:id=>{selectedGoods.value=goodsSelectedOptions.value.find(row=>row.id===id)||null}})
const selectedLocationId=computed({get:()=>selectedLocation.value?.id??null,set:id=>{selectedLocation.value=locationSelectedOptions.value.find(row=>row.id===id)||null}})
const searchGoods=async(query:string)=>{await fetchGoodsData(query);return goodsSelectedOptions.value.map(row=>({value:row.id,label:nameWithCodeAndName(row)}))}
const searchLocations=async(query:string)=>{await fetchLocationData(query);return locationSelectedOptions.value.filter(row=>row.id!==locationId).map(row=>({value:row.id,label:nameWithTypeAndWarehouse(row)}))}
const submitOperation=()=>operation.value==='putaway'?createPutaway():operation.value==='removal'?createRemoval():createTransfer()

const storagePage=ref(1)
const storageRows=ref<PaginationData|null>(null),locationSummary=ref<any>(null),latestMovement=ref<any>(null),lastCount=ref<any>(null)
let overviewGeneration=0
const loadOverview=async()=>{
 const seq=++overviewGeneration
 const headers=warehouseHeaders(itemData.value?.warehouse_id),params={location_id:locationId,per_page:50,page:storagePage.value}
 const values=await Promise.all([
  staff.hasPermission('goods_read')?httpRequest<PaginationData>('/api/warehouse/goods/locations/',{params,headers}):null,
  staff.hasPermission('inventory_read')?httpRequest<any>('/api/warehouse/inventory/by-location',{params:{location_id:locationId,include_inactive:true},headers}):null,
  staff.hasPermission('inventory_read')?httpRequest<PaginationData>('/api/warehouse/stock-ledger/',{params:{...params,page:1,per_page:1},headers}):null,
  staff.hasPermission('cyclecount_read')?httpRequest<PaginationData>('/api/warehouse/cyclecount/details/search/',{params:{...params,page:1,per_page:1,status:'completed',order_by:'completed_at'},headers}):null,
 ])
 if(seq===overviewGeneration){storageRows.value=values[0];locationSummary.value=values[1]?.items?.[0];latestMovement.value=values[2]?.items?.[0];lastCount.value=values[3]?.items?.[0]}
}
watch(storagePage,loadOverview)
onBeforeUnmount(()=>{overviewGeneration++;historyGeneration++})
const storageColumns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},{key:'quantity',label:t('common.fields.quantity'),type:'qty' as const,strong:true,keepZero:true},{key:'created_at',label:t('location.ui.putaway-time')},{key:'updated_at',label:t('location.ui.last-movement')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
</script>
<template>
 <div class="w-location-detail w-scope"><nav><NuxtLink class="w-location-back" to="/location">{{t('nav.location')}}</NuxtLink><span>/</span><span>{{itemData?.code}}</span></nav>
 <WCard v-if="itemData" class="w-location-overview"><header><div><h1>{{itemData.code}}</h1><WStatus muted :tone="itemData.is_active?'ok':'none'">{{t(itemData.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus><span>{{locationTypeLabel(itemData.location_type)}}</span></div><div><WButton icon="printer" :to="'/location/label/'+locationId">{{t('location-label.title')}}</WButton><WButton v-if="staff.hasPermission('location_edit')" :to="'/location/edit/'+locationId">{{t('button.edit')}}</WButton></div></header><div class="w-location-context"><strong>{{itemData.warehouse?.name||itemData.warehouse_name}}</strong><span>{{locationTypeLabel(itemData.location_type)}}</span></div><div class="w-location-metrics"><div><span>{{t('goods.ui.onhand')}}</span><strong>{{locationSummary?.quantity??'—'}}</strong><small>{{t('warehouse.ui.goods-count',{count:locationSummary?.goods_count??'—'})}}</small></div><div><span>{{t('location.ui.last-movement')}}</span><strong>{{latestMovement?$dayjs(latestMovement.occurred_at,'MM/DD HH:mm',itemData):'—'}}</strong><small>{{latestMovement?t('ledger.movements.'+latestMovement.movement_type):''}}</small></div><div><span>{{t('location.ui.last-count')}}</span><strong>{{lastCount?.completed_at?$dayjs(lastCount.completed_at,'MM/DD',itemData):'—'}}</strong><small>{{lastCount?.task_id?'CC-'+lastCount.task_id:''}}</small></div><div><span>{{t('location.ui.utilization')}}</span><strong>{{locationSummary?.volume_utilization!=null?Math.round(locationSummary.volume_utilization*100)+'%':'—'}}</strong><progress v-if="locationSummary?.volume_utilization!=null" :value="locationSummary.volume_utilization" max="1" /></div></div></WCard>
 <WEmptyState v-if="loading&&!itemData" :title="t('common.status.loading')" />
 <div v-if="itemData" class="w-location-detail__layout"><div class="w-location-detail__main"><WCard v-if="staff.hasPermission('goods_read')" flush><div class="w-location-section w-location-section--actions"><h2>{{t('location.ui.storage')}} <small>{{storageRows?.total}}</small></h2><WButton v-if="staff.hasPermission('putaway_edit')" size="sm" icon="plus" @click="openOperation('putaway')">{{t('location.ui.putaway')}}</WButton></div><WTable :rows="storageRows?.items||[]" :columns="storageColumns" inset><template #cell-goods="{row}"><div class="w-location-product"><span class="w-product-image"><img v-if="row.goods.thumbnail_url" :src="row.goods.thumbnail_url" alt=""/><WIcon v-else name="box" :size="18"/></span><div><NuxtLink class="w-location-record" :to="'/goods/detail/'+row.goods.id">{{row.goods.name}}</NuxtLink><span class="w-location-secondary">{{row.goods.code}}</span></div></div></template><template #cell-created_at="{row}">{{$dayjs(row.created_at,'MM/DD HH:mm',itemData)}}</template><template #cell-updated_at="{row}">{{$dayjs(row.updated_at,'MM/DD HH:mm',itemData)}}</template><template #cell-actions="{row}"><WDropdown :label="t('common.fields.action')" placement="bottom-end"><template #trigger="{attrs}"><WButton v-bind="attrs" icon="more" icon-only variant="text" size="sm" :aria-label="t('common.fields.action')" /></template><button v-if="staff.hasPermission('removal_edit')" class="w-menu-item" role="menuitem" @click="openOperation('removal',row)">{{t('location.ui.removal')}}</button><button v-if="staff.hasPermission('transfer_edit')" class="w-menu-item" role="menuitem" @click="openOperation('transfer',row)">{{t('location.ui.transfer')}}</button></WDropdown></template></WTable><footer><WPagination v-model:page="storagePage" :page-size="50" :total="storageRows?.total" show-total /></footer></WCard><WCard v-if="historyTabs.length" flush>
 <div class="w-location-section w-location-section--actions"><h2>{{t('location.ui.history')}}</h2><div class="w-history-segments" role="group" :aria-label="t('location.ui.history')"><button v-for="tab in historyTabs" :key="tab.key" type="button" :class="{active:activeTab===tab.key}" :aria-pressed="activeTab===tab.key" @click="setActiveFilter(tab.key)">{{tab.label}}</button></div></div>
 <LocationActivity v-if="activeTab==='all'" :rows="tabData?.items||[]" :loading="loading" :warehouse="itemData"/><div v-else class="w-location-table-wrap"><table class="w-location-table" :aria-busy="loading"><thead>
                  <tr v-if="activeTab === 'storage'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="">{{ t('location.fields.location-type') }}</th>
                    <th scope="col" class="">{{ t('common.dates.created') }}</th>
                    <th scope="col" class="">{{ t('common.dates.updated') }}</th>
                    <th scope="col">{{ t('common.fields.action') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'putaway'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="">{{ t('common.dates.putaway') }}</th>
                    <th scope="col" class="">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'removal'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="">{{t('common.fields.reason')}}</th>
                    <th scope="col" class="">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="">{{ t('common.dates.removal') }}</th>
                    <th scope="col" class="">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'adjustment'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{ t('common.inventory-ops.adjustment') }}</th>
                    <th scope="col">{{ t('common.quantities.system') }}</th>
                    <th scope="col">{{ t('common.quantities.actual') }}</th>
                    <th scope="col">{{ t('common.quantities.adjusted') }}</th>
                    <th scope="col" class="">{{ t('common.dates.approved') }}</th>
                    <th scope="col" class="">{{ t('common.dates.completed') }}</th>
                    <th scope="col" class="">{{ t('common.users.approver') }}</th>
                    <th scope="col" class="">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="">{{ t('common.fields.reason') }}</th>
                  </tr>
                  <tr v-if="activeTab === 'transfer'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col">{{ t('common.locations.from') }}</th>
                    <th scope="col">{{ t('common.locations.to') }}</th>
                    <th scope="col">{{t('common.fields.quantity')}}</th>
                    <th scope="col" class="">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="">{{ t('common.dates.transfer') }}</th>
                    <th scope="col" class="">{{t('common.fields.remark')}}</th>
                  </tr>
                  <tr v-if="activeTab === 'cyclecount'">
                    <th scope="col">{{t('common.entities.goods')}}</th>
                    <th scope="col" class="">{{ t('common.entities.task') }}</th>
                    <th scope="col">{{ t('common.quantities.actual') }}</th>
                    <th scope="col">{{ t('common.fields.difference') }}</th>
                    <th scope="col" class="">{{ t('common.users.operator') }}</th>
                    <th scope="col" class="">{{ t('common.dates.updated') }}</th>
                    <th scope="col" class="">{{ t('common.dates.completed') }}</th>
                  </tr>
                </thead>
                <tbody>

                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'storage'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {{ item?.quantity }}
                    </td>
                    <td class="">{{t('common.locations.'+item?.location?.location_type)}}</td>
                    <td class="">{{ $dayjs(item?.created_at, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td class="">{{ $dayjs(item?.updated_at, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td>
                      <button class="w-location-operation"
                         @click="openOperation('removal',item)" v-if="staff.hasPermission('removal_edit')" :title="t('common.inventory-ops.removal')">
                        <i class="ri-arrow-down-line"></i>
                      </button>
                      <button class="w-location-operation"
                         @click="openOperation('transfer',item)" v-if="staff.hasPermission('transfer_edit')" :title="t('common.inventory-ops.transfer')">
                        <i class="ri-arrow-right-line"></i>
                      </button>
                    </td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'putaway'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>↑{{ item?.quantity }}</td>
                    <td class="">{{ item?.operator_name }}</td>
                    <td class="">{{ $dayjs(item?.putaway_time, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td class="">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'removal'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>↓{{ item?.quantity }}</td>
                    <td class="">{{ removalReasonLabel(item?.reason) }}</td>
                    <td class="">{{ item?.operator_name }}</td>
                    <td class="">{{ $dayjs(item?.removal_time, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td class="">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'adjustment'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <NuxtLink class="w-location-record" :to="`/adjustment/detail/${item?.adjustment_id}`" target="_blank">ADJ-{{ item?.adjustment_id }}
                      </NuxtLink>
                    </td>
                    <td>{{ item?.system_quantity }}</td>
                    <td>{{ item?.actual_quantity }}</td>
                    <td>{{ item?.adjustment_quantity }}</td>
                    <td class="">{{ $dayjs(item?.adjustment?.approved_at, 'YYYY-MM-DD HH:mm:ss', item) }}
                    </td>
                    <td class="">{{ $dayjs(item?.adjustment?.completed_at, 'YYYY-MM-DD HH:mm:ss', item)
                      }}</td>
                    <td>{{ item?.approver?.user_name }}</td>
                    <td>{{ item?.operator?.user_name }}</td>
                    <td class="">{{ item?.adjustment?.adjustment_reason }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'transfer'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="">
                      <NuxtLink class="w-location-record" :to="`/location/detail/${item?.from_location_id}`" target="_blank"
                        v-if="locationId != item?.from_location_id">{{
                        nameWithTypeAndWarehouse(item?.from_location) }}</NuxtLink>
                    </td>
                    <td class="">
                      <NuxtLink class="w-location-record" :to="`/location/detail/${item?.to_location_id}`" target="_blank"
                        v-if="locationId != item?.to_location_id">{{
                        nameWithTypeAndWarehouse(item?.to_location) }}
                      </NuxtLink>
                    </td>
                    <td>→{{ item?.quantity }}</td>
                    <td class="">{{ item?.operator_name }}</td>
                    <td class="">{{ $dayjs(item?.transfer_time, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td class="">{{ item?.remark }}</td>
                  </tr>
                  <tr v-for="item in tabData?.items" class="invoice-list" v-if="activeTab === 'cyclecount'">
                    <td class="">
                      <div class="d-flex align-items-center">
                        <div class="me-2 lh-1">
                          <span class="avatar avatar-xxl me-2">
                            <NuxtLink class="w-location-record" :to="`/goods/detail/${item?.goods?.id}`">
                              <img :src="item?.goods?.thumbnail_url" alt="" v-if="item?.goods?.thumbnail_url">
                              <img src="/images/goods/default.png" alt="" v-else>
                            </NuxtLink>
                          </span>
                        </div>
                        <div>
                          <p class="mb-0 fw-semibold">
                            <NuxtLink class="w-location-record text-wrap" :to="`/goods/detail/${item?.goods?.id}`">{{ item?.goods?.name }}
                            </NuxtLink>
                          </p>
                          <p class="mb-0 fs-11 text-muted">{{ item?.goods?.code }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="">
                      <NuxtLink class="w-location-record" :to="`/cyclecount/detail/${item?.task_id}`" target="_blank">CC-{{ item?.task_id }}</NuxtLink>
                    </td>
                    <td>{{ item?.actual_quantity }}</td>
                    <td>{{ item?.difference }}</td>
                    <td class="">{{ item?.operator?.user_name }}</td>
                    <td class="">{{ $dayjs(item?.updated_at, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                    <td class="">{{ $dayjs(item?.completed_at, 'YYYY-MM-DD HH:mm:ss', item) }}</td>
                  </tr>
                </tbody></table></div>
 <footer><WPagination :page="Number(route.query.page)||1" :page-size="tabData?.per_page||20" :total="tabData?.total" show-total @update:page="page=>router.push({query:{...route.query,page}})" /></footer>
 </WCard></div><aside>
 <WCard><h3>{{t('location.ui.position')}}</h3><LocationMapPreview :warehouse-id="itemData.warehouse_id" :location-id="locationId"/><dl><dt>{{t('common.entities.warehouse')}}</dt><dd><NuxtLink class="w-location-back" :to="'/warehouse/detail/'+itemData.warehouse_id">{{itemData.warehouse?.name||itemData.warehouse_name}}</NuxtLink></dd><dt>{{t('location.fields.location-type')}}</dt><dd>{{locationTypeLabel(itemData.location_type)}}</dd></dl></WCard>
 <WCard><h3>{{t('location.ui.label')}}</h3><div class="w-location-barcode"><div class="w-label-header">{{itemData.warehouse?.name||itemData.warehouse_name}}</div><strong class="w-label-code">{{itemData.code}}</strong><Barcode :value="itemData.code" /></div></WCard>
 <WCard><h3>{{t('location.fields.specification')}}</h3><dl><template v-for="key in ['width','depth','height','capacity']" :key="key"><dt>{{t('location.fields.'+key)}}</dt><dd>{{itemData[key]??'—'}} {{key==='capacity'?'m³':'cm'}}</dd></template></dl></WCard>
 <WCard><h3>{{t('location.ui.information')}}</h3><dl><dt>{{t('common.users.creator')}}</dt><dd>{{itemData.creator?.user_name}}</dd><dt>{{t('common.dates.created')}}</dt><dd>{{$dayjs(itemData.created_at,'YYYY/MM/DD HH:mm',itemData)}}</dd><dt>{{t('common.dates.updated')}}</dt><dd>{{$dayjs(itemData.updated_at,'YYYY/MM/DD HH:mm',itemData)}}</dd></dl><div v-if="itemData.description" v-html="sanitizeHtml(itemData.description)" /></WCard>
 </aside></div>
 <WModal v-model:open="modalOpen" :title="t('goods.operations.create-'+(operation||'putaway'))" :closable="!loading">
 <WFormGrid><WField :label="t('common.entities.goods')" :error="errors.goods"><WCombobox v-if="operation==='putaway'" v-model="selectedGoodsId" :search="searchGoods" :min-chars="1" :selected-label="selectedGoods?nameWithCodeAndName(selectedGoods):''" :disabled="loading" /><span v-else>{{selectedGoods?nameWithCodeAndName(selectedGoods):''}}</span><PutawayPendingNotice v-if="operation==='putaway'&&selectedGoods&&putawayPending" :pending="putawayPending" :location-type="itemData?.location_type" :warehouse-id="itemData?.warehouse_id" /></WField>
 <WField v-if="operation==='transfer'" :label="t('common.entities.location')" :error="errors.location"><WCombobox v-model="selectedLocationId" :search="searchLocations" :min-chars="1" :selected-label="selectedLocation?nameWithTypeAndWarehouse(selectedLocation):''" :disabled="loading" /></WField>
 <WField :label="t('common.fields.quantity')" :error="errors.quantity"><WInput v-model="quantity" type="number" min="1" step="1" :max="operation==='putaway'?putawayMax??undefined:maxQuantity" :disabled="loading" /></WField>
 <WField v-if="operation==='removal'" :label="t('common.fields.reason')" :error="errors.reason"><WSelect v-model="reason" :options="removalReasonsOptions.map(value=>({value,label:removalReasonLabel(value)}))" :disabled="loading" /></WField>
 <WField v-if="operation==='transfer'&&showTransferReason" :label="t('common.fields.reason')" :error="errors.transfer_reason"><WInput v-model="transferReason" :disabled="loading" /></WField>
 <WField :label="t('common.fields.remark')" optional><WTextarea v-model="remark" :disabled="loading" /></WField></WFormGrid>
 <template #footer><WButton :disabled="loading" @click="modalOpen=false">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="loading" @click="submitOperation">{{t('button.submit')}}</WButton></template>
 </WModal></div>
</template>
<style scoped>
.w-location-detail{display:flex;flex-direction:column;gap:16px}.w-location-detail nav{display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2)}.w-location-back{color:var(--w-text-3)}.w-location-detail header{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;margin-top:-8px}.w-location-detail header>div{display:flex;align-items:center;gap:12px}.w-location-detail h1{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:.02em}.w-location-detail header span{font-size:13px;color:var(--w-text-2)}
.w-location-detail__layout{display:flex;flex-wrap:wrap;gap:16px}.w-location-detail__main{flex:999 1 600px;min-width:0}.w-location-detail aside{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px}.w-location-detail aside :deep(.w-card__body){padding:16px 20px 20px;display:flex;flex-direction:column;gap:10px}.w-location-detail h3{margin:0;font-size:14px;line-height:22px;font-weight:600}.w-location-detail dl{margin:0;display:grid;grid-template-columns:84px minmax(0,1fr);gap:6px 12px;font-size:13px;line-height:20px}.w-location-detail dt{font-weight:400;color:var(--w-text-3)}.w-location-detail dd{margin:0;overflow-wrap:anywhere}.w-location-barcode{overflow:hidden}.w-location-barcode :deep(svg){max-width:100%;height:auto}
.w-location-section{padding:16px 24px;border-bottom:1px solid var(--w-line)}.w-location-section h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.w-location-section small{font-size:13px;font-weight:400;color:var(--w-text-3)}.w-location-table-wrap{overflow:auto}.w-location-table{width:100%;min-width:680px;border-collapse:collapse;font-size:13px;line-height:20px}.w-location-table th{padding:10px 12px 8px;font-size:12px;line-height:18px;font-weight:500;color:var(--w-text-3);border-bottom:1px solid var(--w-border);white-space:nowrap}.w-location-table td{padding:12px;border-bottom:1px solid var(--w-line);vertical-align:top}.w-location-table th:first-child,.w-location-table td:first-child{padding-left:24px}.w-location-table th:last-child,.w-location-table td:last-child{padding-right:24px}.w-location-table :deep(a){color:var(--w-text-1)}.w-location-table .avatar{width:40px;height:40px}.w-location-table img{max-width:40px;max-height:40px;object-fit:contain}.w-location-table .fs-11{font-size:12px!important;line-height:18px}.w-location-operation{border:1px solid var(--w-border-strong);background:var(--w-surface);border-radius:6px;width:28px;height:28px;margin-right:4px;color:var(--w-text-2)}.w-location-detail footer{padding:12px 24px;border-top:1px solid var(--w-border)}
.w-history-segments{display:flex;gap:2px;padding:3px;background:#EDEFF3;border-radius:6px;flex-wrap:wrap}.w-history-segments button{padding:4px 8px;border:0;border-radius:4px;background:transparent;color:var(--w-text-2);font:inherit;font-size:12px;line-height:20px;cursor:pointer}.w-history-segments button.active{background:white;font-weight:600;color:var(--w-text-1);box-shadow:0 1px 3px #15192315}.w-history-segments button:focus-visible{outline:2px solid #9C7BFC}.w-location-product{display:flex;gap:12px;align-items:center;min-width:0}.w-location-product>div{min-width:0}.w-product-image{width:40px;height:40px;border-radius:6px;background:#EDEFF3;color:#A0A4B0;flex:none;display:grid;place-items:center}.w-product-image img{width:100%;height:100%;object-fit:contain;border-radius:6px}.w-location-context{display:flex;align-items:center;gap:24px;margin-top:-8px;font-size:12px;line-height:18px;color:var(--w-text-3)}.w-location-context strong{font-weight:600;color:var(--w-text-2)}.w-location-section--actions{flex-wrap:wrap}.w-location-barcode{padding:10px;border:1px dashed var(--w-border);border-radius:6px}.w-label-header{text-transform:uppercase;font-size:9px;line-height:14px;letter-spacing:.5px;border-bottom:1px solid var(--w-border);padding-bottom:4px;font-weight:600}.w-label-code{display:block;margin:12px 0 0;font-size:28px;line-height:36px;font-weight:700;letter-spacing:1px}.w-location-barcode :deep(svg){max-height:65px}.w-location-metrics strong{font-variant-numeric:tabular-nums}
</style>

<style scoped>
.w-location-overview :deep(.w-card__body){padding:24px;display:flex;flex-direction:column;gap:16px}.w-location-overview header{margin-top:0}.w-location-detail__main{display:flex;flex-direction:column;gap:20px}.w-location-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.w-location-metrics>div{border:1px solid var(--w-border);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:0}.w-location-metrics span,.w-location-metrics small{font-size:12px;line-height:18px;color:var(--w-text-3)}.w-location-metrics strong{font-size:20px;line-height:28px;font-weight:600}.w-location-metrics progress{width:100%;height:6px;accent-color:var(--w-pri)}.w-location-section--actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.w-location-secondary{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.w-location-record{color:var(--w-text-1);font-weight:500}.w-location-detail :deep(.w-table){min-width:650px;border-collapse:collapse}.w-location-detail :deep(.w-table thead th){height:auto;padding-top:10px;padding-bottom:8px;line-height:18px}.w-location-detail :deep(.w-table tbody td){padding-top:12px;padding-bottom:12px}
@media(max-width:600px){.w-location-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.w-location-overview :deep(.w-card__body){padding:20px}.w-location-metrics strong{font-size:18px}}
</style>
