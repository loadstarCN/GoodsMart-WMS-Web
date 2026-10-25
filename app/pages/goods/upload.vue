<script lang="ts" setup>
definePageMeta({
})

// 获取国际化方法
const { t } = useI18n()
// 导入失败按后端业务码显示三语文案（带行号等 details 时显示到具体行）；没有对应文案时显示后端 message
const { bizErrorMessage } = useBizError()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}))

const staffStore = useStaffStore()

const is_end = ref(false)
const uploading = ref(false)
const result = ref<any>("")
const selectedOption = ref<'skip' | 'active' | 'append' | 'override'>('skip')

// 下载模板：后端 GET /goods/bulk_upload/template（UTF-8 带 BOM 的 CSV，表头与导入读的列一致，带一行示例）
const downloadingTemplate = ref(false)
const downloadTemplate = async () => {
  if (downloadingTemplate.value) return
  downloadingTemplate.value = true
  try {
    await downloadFile('/api/warehouse/goods/bulk_upload/template', { method: 'GET' }, 'Goods_template.csv')
  } catch (error) {
    showToast(bizErrorMessage(error as HttpRequestError), 'error')
  } finally {
    downloadingTemplate.value = false
  }
}


// 新增文件对象存储
const selectedFile = ref<File | null>(null)

// 改造后的文件处理方法
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    selectedFile.value = input.files[0] ?? null;
  }
}

// 新增上传方法
const triggerUpload = async () => {
  if (!selectedFile.value) {
    showToast(t('common.validation.file-required'), 'error');
    return
  }

  if (!selectedFile.value.name.endsWith('.csv')) {
    showToast(t('common.validation.csv-only'), 'error');
    return
  }

  // 公司信息缺失（员工信息还没读到 / 已过期）：先重新读取一次；仍没有时提示，不进入上传中状态
  if (!staffStore.staffInfo?.company?.id) {
    await staffStore.getCurrentStaffInfo();
  }
  const companyId = staffStore.staffInfo?.company?.id;
  if (!companyId) {
    showToast(t('goods.tips.company-missing'), 'error');
    return;
  }

  uploading.value = true;

  const formData = new FormData();
  formData.append('file', selectedFile.value);
  // 覆盖策略
  formData.append('overwrite', selectedOption.value);
  formData.append('company_id', String(companyId));

  await httpRequest('/api/warehouse/goods/bulk_upload', {
    method: 'POST',
    body: formData,
    onSuccess: async (data) => {
      is_end.value = true;
      const processed = processedCount(data);
      result.value = processed !== null ? t('goods.import.processed', { count: processed }) : (data?.message || '');
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error');
    },
    onFinally: () => {
      uploading.value = false;
      selectedFile.value = null; // 清空已选文件
    }
  })
}

/**
 * 导入成功处理了几条：后端给 processed 时用它；否则从英文 message（Bulk upload successful. Processed N goods.）里取；
 * 都没有时 null（原样显示 message）
 */
const processedCount = (data: any): number | null => {
  if (data?.processed !== undefined && data?.processed !== null && Number.isFinite(Number(data.processed))) {
    return Number(data.processed);
  }
  const match = /Processed (\d+) goods/i.exec(String(data?.message || ''));
  return match ? Number(match[1]) : null;
}

const resetToUpload = () => {
  result.value = '';
  is_end.value = false;
}


</script>


<template>
  <!-- {{ searchSelectedValue }} -->
    <PageHeader :propData="dataToPass" />

    <!-- Start:: row-1 -->
    <div class="row">
        <div class="col">
          <div class="d-flex justify-content-center mb-4" v-if="uploading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
                </div>
            </div>
          <div class="card custom-card">
            <div class="card-body">
              <template v-if="!is_end">
                  <div class="mb-3 mt-3 row">
                    <div class="col-md-12">
                        <label for="formFile" class="form-label">{{t('upload.upload-csv')}}</label>
                        <div class="input-group mb-2">
                          <input class="form-control" type="file" id="formFile" @change="handleFileSelect">
                          <!-- 上传触发按钮 -->
                          <button 
                            class="btn btn-primary" 
                            type="button"
                            :disabled="!selectedFile || uploading"
                            @click="triggerUpload"
                          >
                            <span v-if="uploading" class="spinner-border spinner-border-sm"></span>
                            {{ uploading ? t('upload.button.uploading') : t('upload.button.upload') }}
                          </button>
                        </div>
                        
                        <div class="d-flex align-items-center flex-wrap">
                          <div class="mr-2">
                              <p class="text-muted m-0">{{t('upload.duplicate-record')}} :</p>
                          </div>
                          <div class="form-check form-check-inline">
                              <input class="form-check-input" type="radio" name="duplicateHandling" id="skipOption"
                                  value="skip" v-model="selectedOption">
                              <label class="form-check-label" for="inlineRadio1">{{t('upload.skip')}}<HelpIcon :title="t('upload.skip-tips')" /></label>
                          </div>
                          <div class="form-check form-check-inline">
                              <input class="form-check-input" type="radio" name="duplicateHandling" id="activeOption"
                                  value="active" v-model="selectedOption">
                              <label class="form-check-label" for="inlineRadio2">{{t('upload.active')}}<HelpIcon :title="t('upload.active-tips')" /></label>
                          </div>
                          <div class="form-check form-check-inline">
                              <input class="form-check-input" type="radio" name="duplicateHandling" id="appendOption"
                                  value="append" v-model="selectedOption">
                              <label class="form-check-label" for="inlineRadio2">{{t('upload.append')}}<HelpIcon :title="t('upload.append-tips')" /></label>
                          </div>
                          <div class="form-check form-check-inline">
                              <input class="form-check-input" type="radio" name="duplicateHandling" id="overrideOption" value="override" v-model="selectedOption">
                              <label class="form-check-label" for="inlineRadio3">{{t('upload.overwrite')}}<HelpIcon :title="t('upload.overwrite-tips')" /></label>
                          </div>
                        </div>

                        <div id="emailHelp" class="form-text">{{t('upload.upload-csv-description')}}<a href="#" @click.prevent="downloadTemplate" class="text-decoration-none text-primary ms-2">[{{t('upload.download-template')}} (.CSV)]</a></div>
                    </div>
                  </div>
                
            </template>
              
              <template v-else>              
              <div class="text-center px-5 pb-0 mt-5 mb-5">
                    <svg class="custom-alert-icon svg-secondary" xmlns="http://www.w3.org/2000/svg"
                        height="3rem" viewBox="0 0 24 24" width="3rem" fill="#000000">
                        <path d="M0 0h24v24H0z" fill="none" />
                        <path
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                    <h5>{{ t('goods.import.success-title') }}</h5>
                    <p class="">{{result}}</p>
                    <div class="">
                        <button class="btn btn-sm btn-primary m-1" @click="resetToUpload">{{ t('goods.import.upload-another') }}</button>
                        <NuxtLink class="btn btn-sm btn-info m-1" :to="`/goods/`">{{ t('goods.import.back-to-list') }}</NuxtLink>
                    </div>
                </div>
              </template>

            </div>
          </div>
        </div>
    </div>
</template>

<style scoped></style>