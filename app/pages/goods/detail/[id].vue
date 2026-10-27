<script lang="ts" setup>
import {removalReasonsOptions}  from '~/data/selectOptions'
import GoodsLots from '~/components/goods/GoodsLots.vue'
import GoodsAnalytics from '~/components/inventory/GoodsAnalytics.vue'
import GoodsStockComposition from '~/components/inventory/GoodsStockComposition.vue'
import { countryName } from '~/data/countries'
import { pendingPutaway, putawayLimit, putawayQuantityError, type PendingPutaway } from '~/composables/inventory/putawayStock'

// 定义页面元数据
definePageMeta({
});



let loading = ref(true);
const router = useRouter();
let route = useRoute();
const productId = route.params.id;

const itemData = ref<any>(null);
const tabData = ref<any>(null);

// 获取国际化方法
const { t, locale } = useI18n();
// 上架 / 下架 / 移库失败按业务码显示三语文案（如移库时源库位没有该商品 16120）
const { bizErrorMessage } = useBizError();
// 分类 / 标签 / 单位 / 库位类型 / 下架原因存代码或英文原值，显示译名
const { categoryLabel, tagLabel, unitLabel, locationTypeLabel, removalReasonLabel } = useOptionLabel();
const warehouseStore = useWarehouseStore();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}));

const errors = ref<Record<string, any>>({
  location: null,
  quantity: null,
  reason: null,
  from_location: null,
  to_location: null,
  transfer_reason: null,
});

// 处理库位选择
const isLoading = ref(false);
const selectedLocation = ref<any>(null);
const locationSelectedOptions = ref<any[]>([]);
const quantity = ref<any>(null);
const maxQuantity = ref<any>(null);
const remark = ref<any>(null);
const reason = ref<any>(null);

const selectedFromLocation = ref<any>(null);
const selectedToLocation = ref<any>(null);
// 移库原因：从破损 / 退货库位移回标准库位（货重新变成可售）必填，否则后端 400 15018；被后端以 15018 拦下时也显示
const transferReason = ref<any>(null);
const transferReasonRequired = computed(() =>
  ['damaged', 'return'].includes(selectedFromLocation.value?.location_type)
  && selectedToLocation.value?.location_type === 'standard');
const showTransferReason = computed(() => transferReasonRequired.value || !!errors.value.transfer_reason);
const locationFromSelectedOptions = ref<any[]>([]);
const locationToSelectedOptions = ref<any[]>([]);

const fetchLocationData = async (code: string, targetRef: Ref<any[]>) => {
  if (!code) return;
  isLoading.value = true;
  
  const data = await httpRequest<PaginationData>('/api/warehouse/location/', {
    method: 'GET',
    params: { all: true, code, warehouse_id: route.query.warehouse_id || undefined },
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
  return `[${warehouse_name} | ${locationTypeLabel(location_type)}] ${code}`
})

// ------------------ 上架：待上架库存（良品 / 破损） ----------------------
// 本商品在各仓库的库存记录（页头选了仓库时只有该仓库）；读不到（没有库存查看权限等）时不提示、不预校验，以后端为准
const putawayInventories = ref<any[] | null>(null);
let inventoryGeneration = 0;
const loadPutawayInventory = async () => {
  const seq = ++inventoryGeneration;
  putawayInventories.value = null;
  await httpRequest<PaginationData>('/api/warehouse/inventory/', {
    method: 'GET',
    params: { goods_id: productId, all: true, warehouse_id: route.query.warehouse_id || undefined },
    headers: warehouseHeaders(String(route.query.warehouse_id || warehouseStore.currentWarehouse?.id || '')),
    onSuccess: (data) => {
      if (seq !== inventoryGeneration) return;
      putawayInventories.value = Array.isArray(data?.items) ? data.items : [];
    },
    onError: () => {
      if (seq === inventoryGeneration) putawayInventories.value = null;
    },
  });
};

/** 各仓库的待上架（有待上架的排前面） */
const putawayPendingRows = computed(() =>
  (putawayInventories.value || [])
    .map((inv: any) => ({
      warehouseId: inv.warehouse_id ?? inv.warehouse?.id,
      warehouseName: inv.warehouse?.name || '',
      pending: pendingPutaway(inv) as PendingPutaway,
    }))
    .sort((a, b) => b.pending.total - a.pending.total)
);

/** 上架所在的仓库：选了库位 → 库位的仓库；否则只有一个仓库有待上架时用它；再否则页头选中的仓库 */
const putawayWarehouseId = computed<number | null>(() => {
  if (selectedLocation.value?.warehouse_id) return selectedLocation.value.warehouse_id;
  const withPending = putawayPendingRows.value.filter((row) => row.pending.total > 0);
  if (withPending.length === 1) return withPending[0]!.warehouseId ?? null;
  return warehouseStore.currentWarehouse?.id ?? null;
});

/** 选中库位所在仓库的待上架；库存读不到时 null；该仓库没有库存记录时按 0 */
const selectedPending = computed<PendingPutaway | null>(() => {
  if (putawayInventories.value === null || !putawayWarehouseId.value) return null;
  const row = putawayPendingRows.value.find((r) => String(r.warehouseId) === String(putawayWarehouseId.value));
  return row ? row.pending : { total: 0, good: 0, damaged: 0 };
});

/** 选了库位后最多能上多少（破损库位 = 待上架合计；标准 / 退货库位 = 良品） */
const putawayMax = computed<number | null>(() =>
  selectedLocation.value && selectedPending.value ? putawayLimit(selectedPending.value, selectedLocation.value.location_type) : null
);

/** 「只看破损库位」：把本仓库的破损库位放进库位下拉 */
const pickDamagedLocations = (locations: any[]) => {
  locationSelectedOptions.value = locations;
};

const putawayFn = () => {
  selectedLocation.value = null;
  quantity.value = null;
  remark.value = null;
  errors.value.location = null;
  errors.value.quantity = null;
  loadPutawayInventory();
}

/** 深链 ?putaway=open（库存页「待上架」的「上架」按钮）：打开上架弹窗 */
const stockModal = ref<'putaway'|'removal'|'transfer'|null>(null)
const stockOpen = computed({get:()=>stockModal.value!==null,set:value=>{if(!value)stockModal.value=null}})
const stockBusy = ref(false)
const openPutawayModal = () => { putawayFn(); stockModal.value='putaway' }
const searchStockLocations = async (code:string) => {
 const warehouseId = stockModal.value==='transfer' ? selectedFromLocation.value?.warehouse_id : route.query.warehouse_id || putawayWarehouseId.value
 const data = await httpRequest<PaginationData>('/api/warehouse/location/', {params:{code:code||undefined,per_page:50,warehouse_id:warehouseId||undefined}})
 const values=data?.items||[]
 if(stockModal.value==='transfer')locationToSelectedOptions.value=values
 else locationSelectedOptions.value=values
 return values.map((item:any)=>({value:item.id,label:item.code,description:nameWithTypeAndWarehouse(item)}))
}
const chosenLocationId = computed<number|null>({get:()=>stockModal.value==='transfer'?selectedToLocation.value?.id:selectedLocation.value?.id,set:value=>{
 if(stockModal.value==='transfer')selectedToLocation.value=locationToSelectedOptions.value.find(item=>item.id===value)||null
 else selectedLocation.value=locationSelectedOptions.value.find(item=>item.id===value)||null
}})
const submitStock = async()=>{
 if(stockBusy.value)return
 stockBusy.value=true
 try{if(stockModal.value==='putaway')await createPutaway();else if(stockModal.value==='removal')await createRemoval();else if(stockModal.value==='transfer')await createTransfer()}finally{stockBusy.value=false}
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
  // 预校验待上架数量（后端同样会拦：超出待上架 15007；标准 / 退货库位超出良品 15016）
  const quantityError = putawayQuantityError(selectedPending.value, selectedLocation.value.location_type, Number(quantity.value));
  if (quantityError) {
    errors.value.quantity = bizErrorMessage(quantityError);
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/putaway/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: selectedLocation.value.id, goods_id: Number(productId), quantity: Number(quantity.value), remark: remark.value},
      onSuccess: async() => {
        stockModal.value=null;
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-putaway'),entity:itemData.value?.code ?? ''}), 'success')
        loadPutawayInventory();
        await fetchTabData();
      },
      onError: (error) => {
          // 15016 破损品不能上到标准 / 退货库位、15007 待上架不足：标在数量下，并刷新待上架
          if (error.code === 15016 || error.code === 15007) {
            errors.value.quantity = bizErrorMessage(error);
            loadPutawayInventory();
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
  quantity.value=null;remark.value=null;reason.value=null;errors.value={};stockModal.value='removal';
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
    errors.value.reason = t('goods.validation.reason-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/removal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {location_id: selectedLocation.value.id, goods_id: Number(productId), quantity: Number(quantity.value), reason:reason.value, remark: remark.value},
      onSuccess: async() => {
        stockModal.value=null;
        selectedLocation.value = null;
        quantity.value = null;
        remark.value = null;
        reason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('removalModal');
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-removal'),entity:itemData.value?.code ?? ''}), 'success')
        if (staff.hasPermission('inventory_read')) await loadPutawayInventory();
        await fetchTabData();
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
  quantity.value=null;remark.value=null;selectedToLocation.value=null;errors.value={};stockModal.value='transfer';
  selectedFromLocation.value = item.location;
  maxQuantity.value = item.quantity;
  transferReason.value = null;
  errors.value.transfer_reason = null;
}

const createTransfer = async () => {
  // 原因输入显示着时才带上 reason
  const reasonText = showTransferReason.value ? String(transferReason.value ?? '').trim() : '';
  errors.value = {
    from_location: null,
    to_location: null,
    quantity: null,
    transfer_reason: null,
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
  if (transferReasonRequired.value && !reasonText) {
    errors.value.transfer_reason = t('goods.validation.reason-required');
    return;
  }
  loading.value = true;
  const data = await httpRequest('/api/warehouse/transfer/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {from_location_id: selectedFromLocation.value.id, to_location_id:selectedToLocation.value.id, goods_id: Number(productId), quantity: Number(quantity.value), remark: remark.value, reason: reasonText || undefined},
      onSuccess: async() => {
        stockModal.value=null;
        selectedFromLocation.value = null;
        selectedToLocation.value = null;
        quantity.value = null;
        remark.value = null;
        transferReason.value = null;
        // 调用公共方法关闭模态框
        // closeModal('transferModal');
        showToast(t('action-results.op-success',{operation:t('goods.operations.create-transfer'),entity:itemData.value?.code ?? ''}), 'success')
        if (staff.hasPermission('inventory_read')) await loadPutawayInventory();
        await fetchTabData();
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


let tabGeneration = 0
onBeforeUnmount(() => { tabGeneration++; inventoryGeneration++ })
const fetchTabData = async () => {
    const seq = ++tabGeneration;
    if (activeTab.value === 'analytics' || activeTab.value === 'lots') { loading.value=false; return; }
    let url = '';
    switch (activeTab.value) {
        case 'ledger':
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
        params: {...route.query, goods_id: productId},
        headers: warehouseHeaders(String(route.query.warehouse_id || warehouseStore.currentWarehouse?.id || '')),
        onSuccess: (data) => {
          if (seq === tabGeneration) tabData.value = data;
        },
        onError: (error) => {
            if (seq === tabGeneration) showToast(error.message, 'error')
        },
        onFinally: () => {
            if (seq === tabGeneration) loading.value = false;
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

watch([()=>route.query.warehouse_id,()=>warehouseStore.currentWarehouse?.id], () => { if(staff.hasPermission('inventory_read')) loadPutawayInventory(); });
watch(() => route.query, async () => {
    // await fetchData();
    await fetchTabData();
});

onMounted(async() => {
  await fetchData();
  if (staff.hasPermission('inventory_read')) await loadPutawayInventory();
  await fetchTabData();
  if (route.query.putaway === 'open') {
    await nextTick();
    openPutawayModal();
  }
});



const staff = useStaffStore()
useHead({title:()=>itemData.value?.name || t('nav.goods')})
const recordTabs = computed(()=>[...(staff.hasPermission('inventory_read')?[{key:'ledger',label:t('common.status.all')}]:[]),...['putaway','removal','adjustment','transfer','cyclecount'].map(key=>({key,label:t('common.inventory-ops.'+(key==='cyclecount'?'cycle-count':key))}))])
const detailTab = computed(()=>activeTab.value==='lots'?'lots':activeTab.value==='analytics'?'analytics':activeTab.value==='storage'?'storage':'records')
const detailTabs = computed(()=>[{key:'storage',label:t('goods.ui.location-stock')},{key:'records',label:t('goods.ui.stock-records')},...(staff.hasPermission('inventory_read')?[{key:'analytics',label:t('inventory-analysis.title')}]:[]),{key:'lots',label:t('goods-label.lot')}])
const selectDetailTab = (key:string|number|null|undefined)=>setActiveFilter(key==='records'?(staff.hasPermission('inventory_read')?'ledger':'putaway'):String(key||'storage'))
const goodsFacts = computed(()=>[
 {label:t('goods.fields.price'),value:itemData.value?.price==null?'':itemData.value.price+' '+(itemData.value.currency||'')},
 {label:t('goods.fields.discount-price'),value:itemData.value?.discount_price},
 {label:t('goods.fields.manufacturer'),value:itemData.value?.manufacturer},
 {label:t('goods.fields.unit'),value:unitLabel(itemData.value?.unit)},
 {label:t('goods.fields.weight'),value:itemData.value?.weight ? itemData.value.weight+' kg':''},
 {label:t('goods.ui.dimensions'),value:[itemData.value?.length,itemData.value?.width,itemData.value?.height].every(Boolean)?[itemData.value.length,itemData.value.width,itemData.value.height].join(' × ')+' mm':''},
 {label:t('goods.fields.origin-country'),value:countryName(itemData.value?.origin_country,locale.value)},
 {label:t('goods.fields.product-date'),value:itemData.value?.production_date},
 {label:t('goods.fields.expiry-date'),value:itemData.value?.expiration_date},
 {label:t('common.users.creator'),value:itemData.value?.creator?.user_name},
])

const {$dayjs}=useNuxtApp()
const recordColumns=computed(()=>{
 const col=(key:string,label:string,value?:(row:any)=>any)=>({key,label:t(label),...(value?{value}:{}),wrap:true})
 const quantity=(key:string,label='common.fields.quantity')=>({key,label:t(label),type:'qty' as const,keepZero:true,strong:true})
 const date=(key:string,label:string,value?:(row:any)=>any)=>col(key,label,row=>{const v=value?value(row):row[key];return v?$dayjs(v,'YYYY-MM-DD HH:mm',row):''})
 const location=col('location','common.entities.location'),operator=col('operator','common.users.operator',row=>row.operator_name||row.operator?.user_name),remark=col('remark','common.fields.remark')
 switch(activeTab.value){
  case 'putaway':return [location,quantity('quantity'),operator,date('putaway_time','common.dates.putaway'),remark]
  case 'removal':return [location,quantity('quantity'),col('reason','common.fields.reason',row=>removalReasonLabel(row.reason)),operator,date('removal_time','common.dates.removal'),remark]
  case 'transfer':return [col('from','common.locations.from'),col('to','common.locations.to'),quantity('quantity'),operator,date('transfer_time','common.dates.transfer'),remark]
  case 'adjustment':return [location,col('document','common.inventory-ops.adjustment'),quantity('system_quantity','common.quantities.system'),quantity('actual_quantity','common.quantities.actual'),quantity('adjustment_quantity','common.quantities.adjusted'),date('approved','common.dates.approved',row=>row.adjustment?.approved_at),date('completed','common.dates.completed',row=>row.adjustment?.completed_at),col('approver','common.users.approver',row=>row.approver?.user_name),operator,col('reason','common.fields.reason',row=>row.adjustment?.adjustment_reason)]
  case 'cyclecount':return [location,col('document','common.entities.task'),quantity('actual_quantity','common.quantities.actual'),quantity('difference','common.fields.difference'),operator,date('completed_at','common.dates.completed'),date('updated_at','common.dates.updated')]
  default:return [location,quantity('quantity'),date('created_at','common.dates.created'),date('updated_at','common.dates.updated'),col('actions','common.fields.action')]
 }
})

</script>
<template>
  <div class="w-goods-detail w-scope">
  <nav class="w-goods-detail__breadcrumb"><NuxtLink class="w-breadcrumb-link" to="/goods">{{ t('nav.goods') }}</NuxtLink><span>/</span>{{ itemData?.code }}</nav>
  <section v-if="itemData" class="w-goods-detail__overview">
    <div class="w-goods-detail__media"><img v-if="itemData.image_url" :src="itemData.image_url" :alt="itemData.name" /><div v-else class="w-goods-detail__image-empty">{{t('goods.fields.image')}}</div></div>
    <div class="w-goods-detail__body">
      <header><div class="w-goods-detail__heading"><span class="w-goods-detail__sub">{{ t('goods.fields.code') }} {{ itemData.code }}</span><h1>{{ itemData.name }}</h1><div class="w-goods-detail__tags"><WStatus :tone="itemData.is_active?'ok':'none'" variant="pill">{{ t(itemData.is_active?'common.status.active':'common.status.inactive') }}</WStatus><span>{{ [itemData.brand,categoryLabel(itemData.category)].filter(Boolean).join(' · ') }}</span><span v-for="tag in itemData.tags" :key="tag" class="w-goods-detail__tag">{{ tagLabel(tag) }}</span></div></div><div class="w-goods-detail__actions"><WButton v-if="staff.hasPermission('goods_edit')" :to="'/goods/edit/'+productId">{{ t('button.edit') }}</WButton><WButton :to="'/goods/label/'+productId">{{t('goods-label.title')}}</WButton></div></header>
      <GoodsStockComposition v-if="putawayInventories" :rows="putawayInventories" :goods-id="String(productId)" :unit="unitLabel(itemData.unit)" />
      <dl class="w-goods-detail__facts"><div v-for="fact in goodsFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value || '—' }}</dd></div></dl>
      <div v-if="itemData.description" class="w-goods-detail__description" v-html="sanitizeHtml(itemData.description)" />
    </div>
  </section>

  <WCard class="w-goods-detail__records" flush>
    <div class="w-goods-detail__record-head"><WTabs :model-value="detailTab" :items="detailTabs" :label="t('nav.inventory')" @update:model-value="selectDetailTab" /><WButton v-if="staff.hasPermission('putaway_add','putaway_edit') && (activeTab==='putaway'||activeTab==='storage')" icon="plus" size="sm" @click="openPutawayModal">{{t('goods.operations.create-putaway')}}</WButton></div>
    <GoodsAnalytics v-if="detailTab==='analytics' && staff.hasPermission('inventory_read')" :goods-id="String(productId)" />
    <GoodsLots v-else-if="detailTab==='lots'" :goods-id="Number(productId)" />
    <template v-else>
    <div v-if="detailTab==='records'" class="w-goods-detail__record-filters"><button v-for="tab in recordTabs" :key="tab.key" type="button" :class="{'is-active':activeTab===tab.key}" :aria-pressed="activeTab===tab.key" @click="setActiveFilter(tab.key)">{{tab.label}}</button></div>
    <StockLedgerTable v-if="activeTab==='ledger'" :rows="tabData?.items||[]" :loading="loading" hide-goods />
    <WTable v-else :rows="tabData?.items||[]" :columns="recordColumns" :loading="loading" inset>
      <template #cell-location="{row}"><NuxtLink v-if="row.location" class="w-stock-link" :to="'/location/detail/'+(row.location_id||row.location.id)">{{row.location.code}}</NuxtLink><span v-if="row.location" class="w-stock-location-type">{{locationTypeLabel(row.location.location_type)}}</span><span class="w-stock-warehouse">{{row.location?.warehouse_name}}</span></template>
      <template #cell-from="{row}"><NuxtLink v-if="row.from_location" class="w-stock-link" :to="'/location/detail/'+row.from_location_id">{{nameWithTypeAndWarehouse(row.from_location)}}</NuxtLink></template>
      <template #cell-to="{row}"><NuxtLink v-if="row.to_location" class="w-stock-link" :to="'/location/detail/'+row.to_location_id">{{nameWithTypeAndWarehouse(row.to_location)}}</NuxtLink></template>
      <template #cell-document="{row}"><NuxtLink class="w-stock-link" :to="activeTab==='adjustment'?'/adjustment/detail/'+row.adjustment_id:'/cyclecount/detail/'+row.task_id">{{activeTab==='adjustment'?'ADJ-':'CC-'}}{{row.adjustment_id||row.task_id}}</NuxtLink></template>
      <template #cell-actions="{row}"><div class="w-stock-actions"><WButton v-if="staff.hasPermission('removal_add','removal_edit')" size="sm" variant="text" @click="removalFn(row)">{{t('common.inventory-ops.removal')}}</WButton><WButton v-if="staff.hasPermission('transfer_add','transfer_edit')" size="sm" variant="text" @click="transferFn(row)">{{t('common.inventory-ops.transfer')}}</WButton></div></template>
    </WTable>
    <footer class="w-goods-detail__record-foot"><WPagination :page="Number(route.query.page)||1" :page-size="tabData?.per_page||20" :total="tabData?.total" show-total @update:page="value=>router.push({query:{...route.query,page:value}})" /></footer>
    </template>
  </WCard>

  <WModal v-model:open="stockOpen" :title="t('goods.operations.create-'+(stockModal||'putaway'))" :closable="!stockBusy">
    <WFormGrid>
      <WField v-if="stockModal==='transfer'" :label="t('common.locations.from')"><p class="w-stock-location">{{ selectedFromLocation ? nameWithTypeAndWarehouse(selectedFromLocation):'' }}</p></WField>
      <WField v-if="stockModal==='removal'" :label="t('common.entities.location')"><p class="w-stock-location">{{ selectedLocation ? nameWithTypeAndWarehouse(selectedLocation):'' }}</p></WField>
      <WField v-else :label="t(stockModal==='transfer'?'common.locations.to':'common.entities.location')" :error="stockModal==='transfer'?errors.to_location:errors.location"><WCombobox v-model="chosenLocationId" :search="searchStockLocations" :selected-label="stockModal==='transfer'?selectedToLocation?.code:selectedLocation?.code" :disabled="stockBusy" /></WField>
      <div v-if="stockModal==='putaway' && putawayInventories!==null"><PutawayPendingNotice v-if="selectedLocation||putawayPendingRows.length<=1" :pending="selectedPending" :location-type="selectedLocation?.location_type" :warehouse-id="putawayWarehouseId" /><template v-else><PutawayPendingNotice v-for="row in putawayPendingRows" :key="row.warehouseId" :pending="row.pending" :warehouse-id="row.warehouseId" /></template></div>
      <WField :label="t('common.fields.quantity')" :error="errors.quantity"><WInput v-model="quantity" type="number" min="1" step="1" :max="stockModal==='putaway'?putawayMax??undefined:maxQuantity??undefined" :disabled="stockBusy" /></WField>
      <WField v-if="stockModal==='removal'" :label="t('common.fields.reason')" :error="errors.reason"><WSelect v-model="reason" :options="removalReasonsOptions.map(value=>({value,label:removalReasonLabel(value)}))" placeholder="—" :disabled="stockBusy" /></WField>
      <WField v-if="stockModal==='transfer'&&showTransferReason" :label="t('common.fields.reason')" :hint="t('common.tips.transfer-restore-reason')" :error="errors.transfer_reason"><WInput v-model="transferReason" maxlength="255" :disabled="stockBusy" /></WField>
      <WField :label="t('common.fields.remark')" optional><WTextarea v-model="remark" :disabled="stockBusy" /></WField>
    </WFormGrid>
    <template #footer><WButton :disabled="stockBusy" @click="stockOpen=false">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="stockBusy" @click="submitStock">{{t('button.submit')}}</WButton></template>
  </WModal>
  </div>
</template>
<style>

</style>
<style scoped>
.w-goods-detail { display:flex; flex-direction:column; gap:16px; }
.w-goods-detail__breadcrumb { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-breadcrumb-link { color:var(--w-text-3); }
.w-goods-detail__overview { display:flex; flex-wrap:wrap; gap:24px; padding:24px; border:1px solid var(--w-border); border-radius:10px; background:var(--w-surface); }
.w-goods-detail__media { flex:0 1 240px; min-width:200px; }
.w-goods-detail__image-empty { width:100%; aspect-ratio:1; display:grid; place-items:center; background:var(--w-line); border-radius:10px; color:var(--w-text-3); font-size:13px; line-height:20px; }
.w-stock-location-type { margin-left:6px; color:var(--w-text-3); font-size:12px; line-height:18px; }
.w-stock-warehouse { display:block; color:var(--w-text-3); font-size:12px; line-height:18px; }
.w-goods-detail__media img { width:100%; aspect-ratio:1; object-fit:contain; border-radius:10px; background:var(--w-line); }
.w-goods-detail__body { flex:999 1 460px; min-width:0; display:flex; flex-direction:column; gap:16px; }
.w-goods-detail__body header { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.w-goods-detail__actions { display:flex; flex-wrap:wrap; gap:8px; }
.w-goods-detail__heading { flex:1 1 360px; min-width:0; display:flex; flex-direction:column; gap:4px; }
.w-goods-detail h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-goods-detail__sub { font-size:13px; line-height:20px; color:var(--w-text-3); }
.w-goods-detail__tags { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-top:4px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-goods-detail__tag { padding:1px 6px; border:1px solid var(--w-border); border-radius:6px; font-size:12px; line-height:16px; }
.w-goods-detail__stock { border:1px solid var(--w-border); border-radius:10px; padding:16px 20px; }
.w-goods-detail__stock-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:14px; line-height:22px; }
.w-goods-detail__metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; border-top:1px solid var(--w-line); padding-top:12px; }
.w-goods-detail__metrics>div { display:flex; flex-direction:column; }
.w-goods-detail__metrics span { font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-goods-detail__metrics b { font-size:16px; line-height:24px; font-weight:600; }
.w-goods-detail__facts { margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:8px 24px; font-size:14px; line-height:22px; }
.w-goods-detail__facts>div { display:grid; grid-template-columns:76px minmax(0,1fr); gap:8px; }
.w-goods-detail__facts dt { color:var(--w-text-3); font-weight:400; }
.w-goods-detail__facts dd { margin:0; overflow-wrap:anywhere; }
.w-goods-detail__description { font-size:14px; line-height:22px; color:var(--w-text-2); }
.w-goods-detail__record-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; padding:0 20px; border-bottom:1px solid var(--w-border); }
.w-goods-detail__record-head>.w-tabs { min-width:0; flex:1 1 240px; box-shadow:none; }
.w-goods-detail__record-head>.w-btn { margin:8px 0; }
.w-goods-detail__records :deep(.w-tabs__tab) { height:48px; }
.w-goods-detail__records :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.w-goods-detail__records :deep(.w-table) { min-width:850px; border-collapse:collapse; }
.w-goods-detail__records :deep(.w-table thead th) { height:auto; padding-top:10px; padding-bottom:8px; line-height:16px; }
.w-goods-detail__records :deep(.w-table__head) { vertical-align:top; }
.w-goods-detail__records :deep(.w-table tbody td) { padding-top:12px; padding-bottom:12px; }
.w-goods-detail__record-foot { padding:12px 20px; border-top:1px solid var(--w-border); }
.w-goods-detail__record-filters { display:flex; flex-wrap:wrap; gap:4px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-goods-detail__record-filters button { border:0; background:transparent; color:var(--w-text-2); border-radius:6px; padding:5px 12px; font:inherit; font-size:13px; line-height:20px; }
.w-goods-detail__record-filters button.is-active { background:var(--w-pri-light,#F1EBFE); color:var(--w-link); font-weight:600; }
.w-goods-detail__record-filters button:hover { background:var(--w-line); }
.w-stock-link { color:var(--w-text-1); text-decoration:none; }
.w-stock-link:hover { color:var(--w-link); }
.w-stock-actions { display:flex; gap:8px; }
</style>
