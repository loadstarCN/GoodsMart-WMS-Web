<script lang="ts" setup>


// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})

// 富文本编辑器
import { QuillEditor } from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'
import { locationTypesOptions } from '~/data/selectOptions'

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.location'),
  list: [t('nav.warehouse'), t('nav.location')]
}))

const warehouseStore = useWarehouseStore()
const router = useRouter()

const itemData = ref({
  code: null,
  location_type: 'standard',
  warehouse_id: null,
  description: null,
  width: null,
  depth: null,
  height: null,
  capacity: null  
})

const errors = ref({
  name: null,
  location_type: null,
  warehouse: null
})


// 配置化选项集合
const selectOptions = reactive({
  location_type: locationTypesOptions,
  warehouses:[]
})

// ------------------ 提交保存 ----------------------
const addLocation = async () => {
  errors.value = {
    code: !itemData.value.code ? t('location.validation.code-required') : null,
    location_type: !itemData.value.location_type ? t('location.validation.location-type-required') : null,
    warehouse: !itemData.value.warehouse_id ? t('location.validation.warehouse-required') : null,
  }

  if (Object.values(errors.value).some(v => v)) return


  await httpRequest('/api/warehouse/location/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/location/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}


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
      itemData.value.warehouse_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.wareshouse = null; // 清除错误信息
    } else {
      itemData.value.warehouse_id = null;       // 清空选择时重置
    }
    itemData.value.details = []; 
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
</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body add-products p-0">
          <div class="p-4">
            <div class="row gx-5">
              <div class="col-xxl-6 col-xl-12">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3">
                      <div class="col-xl-6">
                        <label for="location-code" class="form-label">{{t('location.fields.code')}} <abbr title="required"
                            aria-hidden="true" class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="location-code" :placeholder="t('location.form.placeholders.code')"
                          v-model="itemData.code">
                        <label for="location-code" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.code')}}</label>
                        <div v-if="errors.code" class="invalid-feedback d-block">{{ errors.code }}</div>
                      </div>
                      <div class="col-xl-6">
                        <label for="location_type" class="form-label">{{t('location.fields.location-type')}}</label>
                        <VueMultiselect id="location_type" :show-labels="false" :options="selectOptions.location_type"
                          :multiple="false" v-model="itemData.location_type">
                        </VueMultiselect>
                        <div v-if="errors.location_type" class="invalid-feedback d-block">{{ errors.location_type
                          }}</div>
                      </div>

                      <div class="col-xl-6">
                        <label class="form-label">{{t('location.fields.warehouse')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <div class="flex-nowrap input-group-custom">
                          <VueMultiselect id="dn-warehouse" :show-labels="false" :options="selectOptions.warehouses"
                            :multiple="false" v-model="selectWareshouse" label="name" track-by="id"
                            :disabled="shouldDisableWarehouseSelect"></VueMultiselect>
                        </div>
                        <div v-if="errors.warehouse" class="invalid-feedback d-block">{{ errors.warehouse }}</div>
                      </div>

                      <div class="col-xl-6">
                        <label for="product-capacity" class="form-label">{{t('location.fields.capacity')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-capacity"
                          data-maska="0.999" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('location.form.placeholders.capacity')" v-model="itemData.capacity">
                        <label for="product-capacity" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('location.tips.capacity')}}</label>
                      </div>

                      <div class="col-xl-4">
                        <label for="product-width" class="form-label">{{t('location.fields.weight')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-weight"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('location.form.placeholders.width')"
                          v-model="itemData.width">
                        <label for="product-width" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('location.tips.dimensions')}}</label>
                      </div>
                      <div class="col-xl-4">
                        <label for="product-depth" class="form-label">{{t('location.fields.depth')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-depth"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('location.form.placeholders.depth')"
                          v-model="itemData.depth">

                        <label for="product-depth" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('location.tips.dimensions')}}</label>
                      </div>
                      <div class="col-xl-4">
                        <label for="product-height" class="form-label">{{t('location.fields.height')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-height"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional" :placeholder="t('location.form.placeholders.height')"
                          v-model="itemData.height">
                        <label for="product-height" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('location.tips.dimensions')}}</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-xxl-6 col-xl-12">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3">
                      <div class="col-xl-12 product-features">
                        <label class="form-label" for="product-description">{{t('location.fields.description')}}</label>
                        <QuillEditor id="product-description" theme="snow" v-model:content="itemData.description"
                          contentType="html" toolbar="full" style="overflow-y:auto;" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="addLocation">{{t('location.operations.add')}}<i
                class="bi bi-plus-lg ms-2"></i></button>

          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
