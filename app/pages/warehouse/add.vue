<script lang="ts" setup>
import { currenciesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.warehouse'),
  list: [t('nav.warehouse'), t('nav.warehouse')]
}))

const staffStore = useStaffStore()
const router = useRouter()

const itemData = ref({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  manager_id: null,
  manager: null,
  company_id: staffStore.staffInfo?.company_id,
  default_currency: staffStore.staffInfo?.company?.default_currency || 'JPY',
})

const errors = ref({
  name: null
})

// 配置化选项集合
const selectOptions = reactive({
  currencies: currenciesOptions,
})


// 处理供应商选择
const isLoading = ref(false);
const selectedStaff = ref(null);
const staffSelectedOptions = ref([]);

const fetchStaffData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/staff/', {
        method: 'GET',
        params: {all: true,user_name: name},
        onSuccess: async(data) => {
          staffSelectedOptions.value = data.items;
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
  () => selectedStaff.value,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.manager_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.manger = null; // 清除错误信息
    } else {
      itemData.value.manager_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);


// ------------------ 提交保存 ----------------------
const addWarehouse = async () => {
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required') : null,
  }

  if (Object.values(errors.value).some(v => v)) return


  await httpRequest('/api/warehouse/warehouse/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await staffStore.clearStaffInfo();
      await staffStore.getCurrentStaffInfo();
      await router.push('/warehouse/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}



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
                    <div class="row gy-3 mb-3">
                      <div class="col-xl-6">
                        <label for="warehouse-name" class="form-label">{{t('warehouse.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="warehouse-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="warehouse-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-12">
                        <label for="warehouse-address" class="form-label">{{t('common.fields.address')}}</label>
                        <input type="text" class="form-control" id="warehouse-address" :placeholder="t('common.placeholders.address')"
                          v-model="itemData.address">
                      </div>
                      <div class="col-xl-6">
                        <label for="warehouse-zip_code" class="form-label">{{t('common.fields.zip')}}</label>
                        <input type="text" class="form-control" id="warehouse-zip_code" :placeholder="t('common.placeholders.zip')"
                          v-model="itemData.zip_code">
                      </div>
                      <div class="col-xl-6">
                        <label for="warehouse-phone" class="form-label">{{t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="warehouse-phone" :placeholder="t('common.placeholders.phone')"
                          v-model="itemData.phone">
                      </div>
                      <div class="col-xl-6">
                        <label for="product-currency" class="form-label">{{t('common.fields.currency')}}</label>
                        <VueMultiselect id="product-currency" :show-labels="false" :options="selectOptions.currencies"
                          :multiple="false" v-model="itemData.default_currency">
                        </VueMultiselect>
                      </div>

                    </div>
                    <div class="row gy-3">
                      <div class="col-xl-6">
                        <div class="mb-3">
                          <label class="form-label">{{t('common.users.manager')}}</label>
                          <div class="flex-nowrap input-group-custom">
                            <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedStaff"
                              :options="staffSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                              :internal-search="false" label="user_name" track-by="id" :options-limit="100"
                              @search-change="fetchStaffData" />
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="addWarehouse">{{t('warehouse.operations.add')}}<i
                class="bi bi-plus-lg ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
