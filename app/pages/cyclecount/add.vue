<script lang="ts" setup>
import { useUseGoodsLocationSearch } from '~/composables/goods/useGoodsLocationSearch';

// 定义页面元数据
definePageMeta({
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.cyclecount'),
  list: [t('nav.warehouse'), t('nav.cyclecount')]
}));

const warehouseStore = useWarehouseStore()
const router = useRouter()

// 创建响应式表单引用
const taskItem = ref<Record<string, any>>({
  task_name: null,
  warehouse_id: null,
  scheduled_date: null,  
  task_details: []
})

// 配置化选项集合
const selectOptions = reactive({
  warehouses: [] as any[]
})

const errors = ref<Record<string, any>>({
  wareshouse: null,
  task_details: null,
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
      taskItem.value.warehouse_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.wareshouse = null; // 清除错误信息
    } else {
      taskItem.value.warehouse_id = null;       // 清空选择时重置
    }
    taskItem.value.task_details = []; 
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
const { bizErrorMessage } = useBizError()
// 防重复提交：请求期间禁用按钮；成功后跳转离开，不再解锁
const submitting = ref(false)
const addCycleCount = async () => {
  if (submitting.value) return
  errors.value = {
    wareshouse: !taskItem.value.warehouse_id ? t('common.validation.warehouse-required') : null,
    
    task_details: taskItem.value.task_details.length === 0 ? t('common.validation.goods-item-required') : null
  }

  if (Object.values(errors.value).some(v => v)) return

  // 计划日期：选的那一天按所选仓库时区的 00:00，带偏移提交（不按浏览器时区，免得换算后跨日）
  const scheduledDay = safeFormatDate(taskItem.value.scheduled_date)
  const zone = resolveTimeZone(taskItem.value.warehouse_id)
  const scheduledAt = scheduledDay ? parseDateTime(scheduledDay, zone) : null

  submitting.value = true
  await httpRequest('/api/warehouse/cyclecount/', {
    method: 'POST',
    // 用表单里选的仓库作为请求的仓库（页头选「全部仓库」时也能正确建单）
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(taskItem.value.warehouse_id) },
    body: { ...taskItem.value, scheduled_date: scheduledAt ? toOffsetIsoString(scheduledAt, zone) : null },
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/cyclecount/')
    },
    onError: (error) => {
      submitting.value = false
      showToast(bizErrorMessage(error), 'error')
    }
  })

}

// ------------------ 添加商品 ----------------------

// 整合所有搜索相关状态
// 组件中调用
const { state: goodsSearch, fetchGoodsLocation, resetSelection,resetState } = useUseGoodsLocationSearch();
watch(() => selectWareshouse.value?.id, () => resetState());
const handleSearch = () => {
  if (goodsSearch.code.trim()) {
    // 库位库存按仓库查：还没选仓库时先提示选仓库（否则 selectWareshouse.value 为 null 直接报错）
    const warehouse: any = selectWareshouse.value;
    if (!warehouse?.id) {
      errors.value.wareshouse = t('common.validation.warehouse-required');
      showToast(t('common.validation.warehouse-required'), 'error');
      return;
    }
    fetchGoodsLocation(warehouse.id);
    resetSelection();
  }
}


const addtaskItem = () => {

  if (goodsSearch.selected.length === 0) {
    return;
  }
  // 添加到task_details
  goodsSearch.selected.forEach((item:any) => {
    const existingItem = taskItem.value.task_details.find((detail:any) => detail.goods_id === item.goods_id && detail.location_id === item.location_id);
    if (!existingItem) {
      taskItem.value.task_details.push({
        goods: item.goods,
        id: `${item.goods_id}-${item.location_id}`,
        location_code: item.location_code,
        goods_id: item.goods_id,
        location_id: item.location_id
      });
    }
  });

  resetState();
  errors.value.task_details = null; // 清除错误信息

}

//-------------------- 编辑表单项 ----------------------
const deleteItem = (detail:any) => {
  const index = taskItem.value.task_details.indexOf(detail);
  if (index > -1) {
    taskItem.value.task_details.splice(index, 1);
  }
}



const warehouseId=computed({get:()=>selectWareshouse.value?.id??null,set:value=>{selectWareshouse.value=selectOptions.warehouses.find(row=>row.id===value)||null}})
const selectedIds=computed({get:()=>goodsSearch.selected.map((row:any)=>row.id),set:(ids:(string|number)[])=>{goodsSearch.selected=goodsSearch.results.filter((row:any)=>ids.includes(row.id))}})
const columns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},{key:'location',label:t('nav.location')},{key:'quantity',label:t('common.fields.quantity'),type:'qty' as const}])
useHead({title:()=>t('cyclecount.operations.add')})
</script>

<template><div class="w-count-form w-scope"><header><nav><NuxtLink class="w-count-link" to="/cyclecount">{{t('nav.cyclecount')}}</NuxtLink><span>/</span><span>{{t('cyclecount.operations.add')}}</span></nav><h1>{{t('cyclecount.operations.add')}}</h1></header><WCard flush><form @submit.prevent="addCycleCount"><WFormSection :title="t('recipient.ui.basic')"><WFormGrid><WField :span="4" :label="t('nav.warehouse')" :error="errors.wareshouse"><WSelect v-model="warehouseId" :options="selectOptions.warehouses.map(row=>({value:row.id,label:row.name}))" :placeholder="t('common.validation.warehouse-required')" :disabled="submitting||shouldDisableWarehouseSelect" /></WField><WField :span="4" :label="t('cyclecount.fields.scheduled-date')" :hint="warehouseId?resolveTimeZone(warehouseId):''" optional><WInput v-model="taskItem.scheduled_date" type="date" :disabled="submitting" /></WField><WField :label="t('common.fields.name')" optional><WInput v-model="taskItem.task_name" :disabled="submitting" /></WField></WFormGrid></WFormSection><WFormSection :title="t('operations.ui.scope')"><div class="w-count-scope"><div class="w-count-results"><div class="w-count-search"><WInput v-model="goodsSearch.code" type="search" :disabled="!warehouseId||submitting" :aria-label="t('common.search')" :placeholder="t('goods.fields.code')" @keydown.enter.prevent="handleSearch" @change="handleSearch"><template #prefix><WIcon name="search" :size="16" /></template></WInput></div><WTable v-model:selected="selectedIds" :rows="goodsSearch.results" :columns="columns" selectable :loading="goodsSearch.loading" inset><template #cell-goods="{row}"><strong>{{row.goods?.name}}</strong><span class="w-count-sub">{{row.goods?.code}}</span></template><template #cell-location="{row}">{{row.location?.code}}</template></WTable><div class="w-count-selected"><span>{{t('inventory.ui.selected',{count:selectedIds.length})}}</span><WButton :disabled="!selectedIds.length||submitting" @click="addtaskItem">{{t('goods.operations.add')}}</WButton></div></div><WAlert v-if="errors.task_details" tone="block" :title="errors.task_details" /><WTable v-if="taskItem.task_details.length" :rows="taskItem.task_details" :columns="[...columns.filter(col=>col.key!=='quantity'),{key:'action',label:t('common.fields.action')}]" row-key="id"><template #cell-goods="{row}">{{row.goods?.name}}<span class="w-count-sub">{{row.goods?.code}}</span></template><template #cell-location="{row}">{{row.location_code}}</template><template #cell-action="{row}"><WButton variant="text" icon="trash" icon-only size="sm" :aria-label="t('button.delete')" :disabled="submitting" @click="taskItem.task_details=taskItem.task_details.filter((item:any)=>item!==row)" /></template></WTable></div></WFormSection><footer><WButton to="/cyclecount" :disabled="submitting">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="submitting">{{t('button.save')}}</WButton></footer></form></WCard></div></template>
<style scoped>
.w-count-form{display:flex;flex-direction:column;gap:16px}.w-count-form header{display:flex;flex-direction:column;gap:8px}.w-count-form nav{display:flex;gap:8px;font-size:13px;color:var(--w-text-2)}.w-count-link{color:var(--w-text-3);text-decoration:none}.w-count-form h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-count-scope{display:flex;flex-direction:column;gap:16px}.w-count-results{border:1px solid var(--w-border);border-radius:10px;overflow:hidden}.w-count-search{padding:12px 16px;border-bottom:1px solid var(--w-line)}.w-count-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.w-count-scope :deep(.w-table){min-width:500px}.w-count-scope strong{font-weight:500}.w-count-selected{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:12px 16px;border-top:1px solid var(--w-line)}.w-count-form footer{padding:16px 24px;border-top:1px solid var(--w-border);display:flex;justify-content:flex-end;gap:8px}
</style>
