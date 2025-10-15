<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.recipient'),
  list: [t('nav.warehouse'), t('nav.recipient')]
}))

const staffStore = useStaffStore()
const router = useRouter()

const itemData = ref({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  email: null,
  contact: null,
  country: null,
  company_id: staffStore.staffInfo?.company_id,
})

const errors = ref({
  name: null,
  email: null,
  country: null,  
})


// ------------------ 提交保存 ----------------------
const addRecipient = async () => {
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required') : null,
    email: (() => {
      const email = itemData.value.email;
      // 仅当输入非空时进行格式验证
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return t('common.validation.email-format');
      }
      return null;
    })(),
    country: (() => {
      const country = itemData.value.country;
      // 非空验证
      if (!country) return t('common.validation.country-required');
      
      // 仅验证两位字母代码（ISO 3166-1 alpha-2）
      const alpha2Regex = /^[A-Z]{2}$/;
      if (!alpha2Regex.test(country)) {
        return t('common.validation.country-format');
      }
      return null;
    })()   
  }

  if (Object.values(errors.value).some(v => v)) return


  await httpRequest('/api/warehouse/recipient/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/recipient/')          
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
                        <label for="recipient-name" class="form-label">{{t('recipient.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="recipient-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="recipient-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-12">
                        <label for="recipient-address" class="form-label">{{t('common.fields.address')}}</label>
                        <input type="text" class="form-control" id="recipient-address" :placeholder="t('common.placeholders.address')"
                          v-model="itemData.address">
                      </div>
                      <div class="col-xl-6">
                        <label for="recipient-zip_code" class="form-label">{{t('common.fields.zip')}}</label>
                        <input type="text" class="form-control" id="recipient-zip_code" :placeholder="t('common.placeholders.zip')"
                          v-model="itemData.zip_code">
                      </div>
                      <div class="col-xl-6">
                        <label for="recipient-phone" class="form-label">{{t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="recipient-phone" :placeholder="t('common.placeholders.phone')"
                          v-model="itemData.phone">
                      </div>
                      <div class="col-xl-6">
                        <label for="recipient-email" class="form-label">{{t('common.fields.email')}}</label>
                        <input type="email" class="form-control" id="recipient-email" :placeholder="t('common.placeholders.email')"
                          v-model="itemData.email">
                          <div v-if="errors.email" class="invalid-feedback d-block">{{ errors.email }}</div>
                      </div>
                      <div class="col-xl-6">
                        <label for="recipient-contact" class="form-label">{{t('common.fields.contact')}}</label>
                        <input type="text" class="form-control" id="recipient-contact" :placeholder="t('common.placeholders.contact')"
                          v-model="itemData.contact">
                      </div>
                      <div class="col-xl-6">
                        <label for="recipient-country" class="form-label">{{t('common.fields.country')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="recipient-country" :placeholder="t('common.placeholders.country')"
                          v-model="itemData.country">
                          <label for="recipient-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.country')}}</label>
                          <div v-if="errors.country" class="invalid-feedback d-block">{{ errors.country }}</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="addRecipient">{{t('recipient.operations.add')}}<i
                class="bi bi-plus-lg ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
