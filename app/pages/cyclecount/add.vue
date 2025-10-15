<script lang="ts" setup>
import { useUseGoodsLocationSearch } from '~/composables/goods/useGoodsLocationSearch';

// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
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
const taskItem = ref({
  task_name: null,
  warehouse_id: null,
  scheduled_date: null,  
  task_details: []
})

// 配置化选项集合
const selectOptions = reactive({
  warehouses:[]
})

const errors = ref({
  wareshouse: null,
  task_details: null,
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
const addCycleCount = async () => {
  errors.value = {
    wareshouse: !taskItem.value.warehouse_id ? t('common.validation.warehouse-required') : null,
    
    task_details: taskItem.value.task_details.length === 0 ? t('common.validation.goods-item-required') : null
  }

  if (Object.values(errors.value).some(v => v)) return

  if (taskItem.value.scheduled_date) {
    taskItem.value.scheduled_date = safeFormatDateTime(taskItem.value.scheduled_date);
  }

  await httpRequest('/api/warehouse/cyclecount/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: taskItem.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/cyclecount/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })

}

// ------------------ 添加商品 ----------------------

// 整合所有搜索相关状态
// 组件中调用
const { state: goodsSearch, fetchGoodsLocation, resetSelection,resetState } = useUseGoodsLocationSearch();
const handleSearch = () => {
  if (goodsSearch.code.trim()) {
    fetchGoodsLocation(selectWareshouse.value.id);
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



</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row">
    <div class="col-xxl-9">
      <div class="card custom-card" id="cart-container-delete">
        <div class="card-header justify-content-between">
          <div class="card-title">
            {{t('cyclecount.fields.items')}} <abbr title="required" aria-hidden="true" class="text-danger">*</abbr><span
              class="badge rounded-pill bg-success ms-2" v-if="taskItem?.task_details?.length>0">{{
              taskItem?.task_details?.length}}</span>

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
                  <th>{{t('common.entities.location')}}</th>
                  <th>{{ t('common.fields.action') }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="detail in taskItem?.task_details">
                  <td>
                    <div class="d-flex align-items-center">
                      <div class="me-2 lh-1">
                        <span class="avatar avatar-xxl me-2">

                          <NuxtLink :to="`/goods/detail/${detail?.goods_id}`" target="_blank">
                            <img :src="detail.goods?.thumbnail_url" alt="" v-if="detail.goods?.thumbnail_url">
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

                  </td>
                  <td>
                    <p class="mb-0 fw-semibold">
                      {{ detail.location_code }}
                    </p>
                  </td>

                  <td>
                    <button class="btn btn-icon btn-danger btn-delete" @click="deleteItem(detail)">
                      <i class="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-5 border border-top-0" v-if="taskItem?.task_details?.length==0">{{t('common.status.nothing-show')}}</div>
          </div>
          <div v-if="errors.task_details" class="invalid-feedback d-block">{{ errors.task_details }}</div>
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
            <div class="mb-3">
              <label class="form-label">{{t('cyclecount.fields.name')}}</label>
              <input type="text" class="form-control" id="task-name" :placeholder="t('cyclecount.form.placeholders.name')"
                v-model="taskItem.task_name">
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('common.entities.warehouse')}} <abbr title="required" aria-hidden="true"
                  class="text-danger">*</abbr></label>
              <div class="flex-nowrap input-group-custom">
                <VueMultiselect id="cyclecount-warehouse" :show-labels="false" :options="selectOptions.warehouses"
                  :multiple="false" v-model="selectWareshouse" label="name" track-by="id"
                  :disabled="shouldDisableWarehouseSelect"></VueMultiselect>
              </div>
              <div v-if="errors.wareshouse" class="invalid-feedback d-block">{{ errors.wareshouse }}</div>
            </div>

            <div class="form-group mb-3">
              <label class="form-label">{{t('cyclecount.fields.scheduled-date')}}</label>
              <div class="input-group flex-nowrap input-group-custom">
                <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                <Datepicker id="scheduled_date" :placeholder="t('cyclecount.form.placeholders.scheduled-date')" class="form-control" autoApply
                  :enable-time-picker="false" v-model="taskItem.scheduled_date" />
              </div>
              
            </div>

          </div>

          <div class="p-3 d-grid">
            <NuxtLink to="javascript:void(0);" class="btn btn-primary btn-wave mb-2" @click="addCycleCount()">
              {{t('cyclecount.operations.add')}}
            </NuxtLink>

            <NuxtLink to="/cyclecount" class="btn btn-light btn-wave">
              {{t('cyclecount.operations.back-to-list')}}
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
            <VueMultiselect id="cyclecount-warehouse" :show-labels="false" :options="selectOptions.warehouses"
              :multiple="false" v-model="selectWareshouse" label="name" track-by="id"
              :disabled="shouldDisableWarehouseSelect">
            </VueMultiselect>
          </div>
        </div>
      </div>
      <div class="col-12" v-else>
        <div class="border-bottom border-block-end-dashed">
          <div class="input-group mb-3">
            <input type="text" class="form-control" :placeholder="t('common.placeholders.goods-code')" aria-label="Goods Code"
              aria-describedby="button-addon2" v-model="goodsSearch.code" @keyup.enter="handleSearch()">
            <button class="btn btn-primary" type="button" id="button-addon2" @click="handleSearch()"><i
                class="ri-search-line"></i></button>
          </div>
        </div>
        <div class="border-bottom border-block-end-dashed mb-3">
          <div class="row d-flex justify-content-center mb-3" v-if="goodsSearch.loading">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
            </div>
          </div>
          <ul class="list-group list-group-flush mb-3">
            <li class="list-group-item" v-for="(item, index) in goodsSearch.results" :key="index">
              <div class="d-flex align-items-center">
                

                <input class="form-check-input" type="checkbox" :id="`check-${item.goods_id}-${item.location_id}`" :value="{ 
                    goods: item.goods, 
                    goods_id: item.goods_id, 
                    location_id: item.location_id,
                    location_code: item.location_code,
                  }" v-model="goodsSearch.selected" :disabled="item.quantity <= 0">

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
                      :class="item.quantity>0?'bg-success':'bg-warning'">{{ item.quantity }}</span>@{{
                    item.location_code }}</p>

                </div>
              </div>
            </li>

          </ul>

          <div v-if="goodsSearch.results?.length==0" class="alert alert-warning alert-dismissible fade show mb-3"
            role="alert">
            <span>{{t('error.no-found-data')}}</span>
          </div>

        </div>



        <div class="d-grid" v-if="goodsSearch.selected.length> 0">
          <NuxtLink to="javascript:void(0);" class="btn btn-primary btn-wave mb-2" @click="addtaskItem()">
            {{t('common.operations.add-item')}}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!-- End::offcanvas -->
  
</template>

<style scoped>
/* Add any specific styles here */
</style>