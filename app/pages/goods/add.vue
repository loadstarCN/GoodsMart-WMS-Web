<script setup>


// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})

// 富文本编辑器
import { QuillEditor } from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'
import { categoriesOptions, currenciesOptions, unitsOptions,tagsOptions } from '~/data/selectOptions'

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}))

const staffStore = useStaffStore()
const router = useRouter()

const itemData = ref({
  name: null,
  code: null,
  category: null,
  brand: null,
  manufacturer: null,
  tags: [],
  description: null,
  price: null,
  discount_price: null,
  currency: staffStore.staffInfo?.company?.default_currency || 'JPY',
  unit: 'pcs',
  weight: null,
  length: null,
  width: null,
  height: null,
  image_url: null,
  thumbnail_url: null,
  extra_data: {},
  production_date: null,
  expiration_date: null,
  company_id: staffStore.staffInfo?.company?.id || null
})

const errors = ref({
  name: null,
  code: null
})

// 标签处理方法
const addTag = (newTag) => {
  selectOptions.tagOptions.push(newTag)
  itemData.value.tags.push(newTag)
}

// 配置化选项集合
const selectOptions = reactive({
  tagOptions: tagsOptions,
  categories: categoriesOptions,
  currencies: currenciesOptions,
  units: unitsOptions
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
    
    await httpRequest('/api/warehouse/goods/image/upload', {
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
    itemData.value.image_url = file.serverId
    itemData.value.thumbnail_url = file.serverId
  }
}

const handleRemoveFile = (error, file) => {
  if (!error) {
    // 更新数据模型
    itemData.value.image_url = null
    itemData.value.thumbnail_url = null
  }
}

// ------------------ 提交保存 ----------------------
const addProduct = async () => {
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required') : null,
    code: !itemData.value.code ? t('goods.validation.code-required') : null
  }

  if (Object.values(errors.value).some(v => v)) return

  // itemData.tags从数组变成以逗号分隔的字符串
  itemData.value.tags = convert_tags_to_string(itemData.value.tags)

  await httpRequest('/api/warehouse/goods/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.op-success',{operation:t('goods.operations.add'),entity:itemData.value.name}), 'success')
      await router.push('/goods/')          
    },
    onError: (error) => {
      showToast(t('action-results.op-failed',{operation:t('goods.operations.add'),entity:itemData.value.name}), 'error')
      itemData.value.tags = convert_tags_to_array(itemData.value.tags)
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
              <div class="col-xxl-6 col-xl-12 col-lg-12 col-md-6">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3">

                      <div class="col-xl-12">
                        <label for="product-name" class="form-label">{{ t('goods.fields.name')}} <abbr title="required"
                            aria-hidden="true" class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="product-name"
                          :placeholder="t('common.placeholders.name')" v-model="itemData.name" required>
                        <label for="product-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-6">
                        <label for="product-code" class="form-label">{{ t('goods.fields.code')}} <abbr title="required"
                            aria-hidden="true" class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="product-code"
                          :placeholder="t('goods.form.placeholders.code')" v-model="itemData.code">
                        <label for="product-code" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('goods.form.tips.code')}}</label>
                        <div v-if="errors.code" class="invalid-feedback d-block">{{ errors.code }}</div>
                      </div>
                      <div class="col-xl-6">
                        <label for="product-category" class="form-label">{{ t('goods.fields.category')}}</label>
                        <VueMultiselect id="product-category" :show-labels="false" :options="selectOptions.categories"
                          :multiple="false" v-model="itemData.category">
                        </VueMultiselect>
                      </div>

                      <div class="col-xl-6">
                        <label for="product-brand" class="form-label">{{ t('goods.fields.brand')}}</label>
                        <input type="text" class="form-control" id="product-brand"
                          :placeholder="t('goods.form.placeholders.brand')" v-model="itemData.brand">
                      </div>
                      <div class="col-xl-6 color-selection">
                        <label for="product-manufacturer" class="form-label">{{ t('goods.fields.manufacturer')}}</label>
                        <input type="text" class="form-control" id="product-manufacturer"
                          :placeholder="t('goods.form.placeholders.manufacturer')" v-model="itemData.manufacturer">
                      </div>

                      <div class="col-xl-12">
                        <label for="product-tags" class="form-label">{{ t('goods.fields.tags')}}</label>
                        <VueMultiselect id="product-tags" :show-labels="false" v-model="itemData.tags"
                          :tag-placeholder="t('goods.form.placeholders.tag-add')"
                          :placeholder="t('goods.form.placeholders.tags')" :options="selectOptions.tagOptions"
                          :multiple="true" :taggable="true" @tag="addTag">
                        </VueMultiselect>
                      </div>

                      <div class="col-xl-12 product-features">
                        <label class="form-label" for="product-description">{{ t('goods.fields.description')}}</label>
                        <QuillEditor id="product-description" theme="snow" v-model:content="itemData.description"
                          contentType="html" toolbar="full" style="overflow-y:auto;" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-xxl-6 col-xl-12 col-lg-12 col-md-6">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-4">
                      <div class="col-xl-4">
                        <label for="product-price" class="form-label">{{ t('goods.fields.price')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-price"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.price')" v-model="itemData.price">
                      </div>
                      <div class="col-xl-4">
                        <label for="product-discount-price" class="form-label">{{
                          t('goods.fields.discount-price')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-discount-price"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.discount-price')" v-model="itemData.discount_price">
                      </div>
                      <div class="col-xl-4">
                        <label for="product-currency" class="form-label">{{ t('goods.fields.currency')}}</label>
                        <VueMultiselect id="product-currency" :show-labels="false" :options="selectOptions.currencies"
                          :multiple="false" v-model="itemData.currency">
                        </VueMultiselect>
                      </div>
                      <div class="col-xl-6">
                        <label for="product-unit" class="form-label">{{ t('goods.fields.unit')}}</label>

                        <VueMultiselect id="product-unit" :show-labels="false" :options="selectOptions.units"
                          :multiple="false" v-model="itemData.unit">
                        </VueMultiselect>
                      </div>
                      <div class="col-xl-6">
                        <label for="product-weight" class="form-label">{{ t('goods.fields.weight')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-weight"
                          data-maska="0.99" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.weight')" v-model="itemData.weight">
                        <label for="product-weight" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('goods.form.tips.weight')}}</label>
                      </div>
                      <div class="col-xl-4">
                        <label for="product-length" class="form-label">{{ t('goods.fields.length')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-length"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.length')" v-model="itemData.length">
                        <label for="product-length" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('goods.form.tips.dimensions')}}</label>
                      </div>
                      <div class="col-xl-4">
                        <label for="product-width" class="form-label">{{ t('goods.fields.width')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-width"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.width')" v-model="itemData.width">
                        <label for="product-width" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('goods.form.tips.dimensions')}}</label>
                      </div>
                      <div class="col-xl-4">
                        <label for="product-height" class="form-label">{{ t('goods.fields.height')}}</label>
                        <input v-maska:[] type="text" class="form-control number-format" id="product-height"
                          data-maska="0" data-maska-tokens="0:\d:multiple|9:\d:optional"
                          :placeholder="t('goods.form.placeholders.height')" v-model="itemData.height">
                        <label for="product-height" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{
                          t('goods.form.tips.dimensions')}}</label>
                      </div>

                      <div class="col-xl-12 product-documents-container">
                        <p class="fw-semibold mb-2 fs-14">{{ t('goods.fields.image')}} </p>
                        <file-pond name="image" ref="pond" :label-idle="t('upload.description')" allow-multiple="false"
                          max-files="1" :files="myFiles" :accepted-file-types="acceptedFileTypes"
                          :allow-file-type-validation="true" :instant-upload="false" :server="serverConfig"
                          @init="(instance) => pond = instance" @processfile="handleProcessFile"
                          @removefile="handleRemoveFile" />

                      </div>

                      <div class="col-xl-6">
                        <label for="production-date" class="form-label">{{ t('goods.fields.product-date')}}</label>
                        <div class="form-group">
                          <div class="input-group flex-nowrap input-group-custom">
                            <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                            <Datepicker id="production-date" :placeholder="t('goods.form.placeholders.product-date')"
                              class="form-control" autoApply :enable-time-picker="false"
                              v-model="itemData.production_date" />
                          </div>
                        </div>
                      </div>
                      <div class="col-xl-6">
                        <label for="expiration-date" class="form-label">{{ t('goods.fields.expiry-date')}}</label>
                        <div class="form-group">
                          <div class="input-group flex-nowrap input-group-custom">
                            <div class="input-group-text text-muted"> <i class="ri-calendar-line"></i> </div>
                            <Datepicker id="expiration-date" :placeholder="t('goods.form.placeholders.expiry-date')"
                              class="form-control" autoApply :enable-time-picker="false"
                              v-model="itemData.expiration_date" />
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
            <button class="btn btn-primary-light m-1" @click="addProduct">{{ t('goods.operations.add') }}<i
                class="bi bi-plus-lg ms-2"></i></button>

          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
