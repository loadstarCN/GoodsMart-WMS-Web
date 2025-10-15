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
  current: t('nav.supplier'),
  list: [t('nav.warehouse'), t('nav.supplier')]
}))

const staffStore = useStaffStore()
const router = useRouter()
let route = useRoute();
const itemId = route.params.id;
let loading = ref(true);

const itemData = ref({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  email: null,
  contact: null,
  company_id: staffStore.staffInfo?.company_id,
})

const errors = ref({
  name: null,
  email: null,
})


// ------------------ 提交保存 ----------------------
const saveSupplier = async () => {
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required') : null,
    email: (() => {
      const email = itemData.value.email;
      // 仅当输入非空时进行格式验证
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return t('common.validation.email-format');
      }
      return null;
    })()    
  }

  if (Object.values(errors.value).some(v => v)) return

  await httpRequest(`/api/warehouse/supplier/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/supplier/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/supplier/${itemId}`, {
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
                        <label for="supplier-name" class="form-label">{{t('supplier.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="supplier-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="supplier-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-12">
                        <label for="supplier-address" class="form-label">{{t('common.fields.address')}}</label>
                        <input type="text" class="form-control" id="supplier-address" :placeholder="t('common.placeholders.address')"
                          v-model="itemData.address">
                      </div>
                      <div class="col-xl-6">
                        <label for="supplier-zip_code" class="form-label">{{t('common.fields.zip')}}</label>
                        <input type="text" class="form-control" id="supplier-zip_code" :placeholder="t('common.placeholders.zip')"
                          v-model="itemData.zip_code">
                      </div>
                      <div class="col-xl-6">
                        <label for="supplier-phone" class="form-label">{{t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="supplier-phone" :placeholder="t('common.placeholders.phone')"
                          v-model="itemData.phone">
                      </div>
                      <div class="col-xl-6">
                        <label for="supplier-email" class="form-label">{{t('common.fields.email')}}</label>
                        <input type="email" class="form-control" id="supplier-email" :placeholder="t('common.placeholders.email')"
                          v-model="itemData.email">
                          <div v-if="errors.email" class="invalid-feedback d-block">{{ errors.email }}</div>
                      </div>
                      <div class="col-xl-6">
                        <label for="supplier-contact" class="form-label">{{t('common.fields.contact')}}</label>
                        <input type="text" class="form-control" id="supplier-contact" :placeholder="t('common.placeholders.contact')"
                          v-model="itemData.contact">
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="saveSupplier">{{t('supplier.operations.edit')}}<i
                class="bi bi-plus-lg ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
