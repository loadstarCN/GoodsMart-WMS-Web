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
  current: t('nav.company'),
  list: [t('nav.warehouse'), t('nav.company')]
}))

const staffStore = useStaffStore()
const router = useRouter()
let route = useRoute();
let loading = ref(true);

const itemData = ref({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  email: null,
  logo: null,
  default_currency: staffStore.staffInfo?.company?.default_currency || 'JPY',
})

const errors = ref({
  name: null,
  email: null,
})

// 配置化选项集合
const selectOptions = reactive({
  currencies: currenciesOptions,
})


// ------------------ 图片上传功能 Start----------------------
// 组合式 FilePond 配置
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css'
import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type'

// 组件注册
const FilePond = vueFilePond(
  FilePondPluginImagePreview,
  FilePondPluginFileValidateType
)
const pond = ref(null)
// 文件上传配置
const myFiles = ref([]) // 修正初始化方式为数组
const acceptedFileTypes = ref(['image/png', 'image/jpeg']) // 声明为响应式数组

const serverConfig = {
  // 优化load方法处理本地文件
  load: (source, load, error, progress, abort, headers) => {
    if (!source || source === '[]') {
      error(t('upload.upload-image-no-file'))
      abort()
      return () => {}
    }

    fetch(source)
      .then(res => res.blob())
      .then(load)
      .catch(error)
    return () => abort()
  },
  process: async (fieldName, file, metadata, load, error, progress, abort) => {
    if (!acceptedFileTypes.value.includes(file.type)) {
      error(t('upload.upload-image-type-error'))
      return abort()
    }

    const controller = new AbortController()
    const formData = new FormData()
    formData.append('file', file, file.name)
    
    await httpRequest('/api/warehouse/company/image/upload', {
      method: 'POST',
      body: formData,
      onSuccess: async (data) => {
        load(data.file_url)   
      },
      onError: (error) => {
        error(err.message || t('upload.upload-image-failed'))
        abort()
      }
    })
    
    return { abort: () => controller.abort() }
  }
  
}

// 添加文件处理完成监听
const handleProcessFile = (error, file) => {
  
  if (!error) {   
    // 更新数据模型 
    itemData.value.logo = file.serverId
    
  }
}

const handleRemoveFile = (error, file) => {
  if (!error) {
    // 更新数据模型
    itemData.value.logo = null
    
  }
}

// ------------------ 提交保存 ----------------------
const saveCompany = async () => {
  errors.value = {
    name: !itemData.value.name ? t("common.validation.name-required") : null,
    email: (() => {
      const email = itemData.value.email;
      // 仅当输入非空时进行格式验证
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return t("common.validation.email-format");
      }
      return null;
    })()    
  }

  if (Object.values(errors.value).some(v => v)) return

  await httpRequest(`/api/warehouse/company/${staffStore.staffInfo?.company_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/company/${staffStore.staffInfo?.company_id}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;    
          // 将图片数据转换为 FilePond 需要的格式
          if(itemData.value.logo) {
            myFiles.value = [{
              source: itemData.value.logo,
              options: { type: 'local' }
            }]
          } else {
            myFiles.value = []
          }      
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
                      <div class="col-xl-12">
                        <label for="carrier-name" class="form-label">{{ t('company.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="carrier-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="carrier-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-12">
                        <label for="carrier-address" class="form-label">{{ t('company.fields.address')}}</label>
                        <input type="text" class="form-control" id="carrier-address" :placeholder="t('common.placeholders.address')"
                          v-model="itemData.address">
                      </div>
                      <div class="col-xl-6">
                        <label for="carrier-zip_code" class="form-label">{{ t('common.fields.zip')}}</label>
                        <input type="text" class="form-control" id="carrier-zip_code" :placeholder="t('common.placeholders.zip')"
                          v-model="itemData.zip_code">
                      </div>
                      <div class="col-xl-6">
                        <label for="carrier-phone" class="form-label">{{ t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="carrier-phone" :placeholder="t('common.placeholders.phone')"
                          v-model="itemData.phone">
                      </div>
                      <div class="col-xl-6">
                        <label for="carrier-email" class="form-label">{{ t('common.fields.email')}}</label>
                        <input type="email" class="form-control" id="carrier-email" :placeholder="t('company.form.placeholders.email')"
                          v-model="itemData.email">
                          <div v-if="errors.email" class="invalid-feedback d-block">{{ errors.email }}</div>
                      </div>
                      
                      <div class="col-xl-6">
                        <label for="product-currency" class="form-label">{{ t('common.fields.currency')}}</label>
                        <VueMultiselect id="product-currency" :show-labels="false" :options="selectOptions.currencies"
                          :multiple="false" v-model="itemData.default_currency">
                        </VueMultiselect>
                      </div>

                      <div class="col-xl-12 product-documents-container">
                        <p class="fw-semibold mb-2 fs-14">{{ t('common.fields.logo')}}</p>
                        <file-pond name="image" ref="pond"
                          :label-idle="t('upload.description')"
                          allow-multiple="false" max-files="1" :files="myFiles" :accepted-file-types="acceptedFileTypes"
                          :allow-file-type-validation="true" :instant-upload="false" :server="serverConfig"
                          @init="(instance) => pond = instance" @processfile="handleProcessFile"
                          @removefile="handleRemoveFile" />
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="saveCompany">{{ t('company.operations.edit')}}<i
                class="bi bi-plus-lg ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
