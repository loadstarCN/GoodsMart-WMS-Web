<script lang="ts" setup>
import { currenciesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})

// 富文本编辑器
import { QuillEditor } from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.department'),
  list: [t('nav.warehouse'), t('nav.department')]
}))

const staffStore = useStaffStore()
const router = useRouter()
let route = useRoute();
const itemId = route.params.id;
let loading = ref(true);

const itemData = ref({
  name: null,  
  description: null,
  company_id: staffStore.staffInfo?.company_id,
})

const errors = ref({
  name: null
})

// 配置化选项集合
const selectOptions = reactive({
  currencies: currenciesOptions,
})


// ------------------ 提交保存 ----------------------
const saveDepartment = async () => {
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required') : null,
  }

  if (Object.values(errors.value).some(v => v)) return


  await httpRequest(`/api/warehouse/department/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await staffStore.clearStaffInfo();
      await staffStore.getCurrentStaffInfo();
      await router.push('/department/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/department/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;          
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


onMounted(async() => {
  await fetchData();

})


</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>
  <div class="row" v-else>
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
                        <label for="department-name" class="form-label">{{ t('department.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="department-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="department-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{ t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>
                      <div class="col-xl-12 product-features">
                        <label class="form-label" for="product-description">{{ t('department.fields.description')}}</label>
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
            <button class="btn btn-primary-light m-1" @click="saveDepartment">{{ t('department.operations.edit')}}<i
                class="bi bi-plus-lg ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
