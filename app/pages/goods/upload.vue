<script lang="ts" setup>
definePageMeta({
  middleware: ["auth"]
})

// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.goods'),
  list: [t('nav.warehouse'), t('nav.goods')]
}))

const staffStore = useStaffStore()

const is_end = ref(false)
const uploading = ref(false)
const result = ref("")
const selectedOption = ref<'skip' | 'active' | 'append' | 'override'>('skip')

// 下载模板
const downloadTemplate = async () =>  {
    const csvContent = '\uFEFF' + "code,name,unit,weight,length,width,height,manufacturer,brand,image_url,thumbnail_url,category,tags,price,discount_price,currency,expiration_date,production_date,description\n4901772434184,家庭教師ヒットマンREBORN！ トレーディングクリア色紙コレクション（全7種） 1BOX入数：7,pcs,,,,,TBSグロウディア,,https://pic.goodsmart.com.cn/uploadfile/raw_docs/4901772434184.jpg,,,,3850,,JPY,,2025-07-01,'※一般情報・予約解禁日時：2025年4月19日 12時00分～厳守(C)天野明／集英社・テレビ東京・リボーン製作委員会'\n4901772429791,家庭教師ヒットマンREBORN！ クリアファイル（F ベルフェゴール）,pcs,,,,,TBSグロウディア,,https://pic.goodsmart.com.cn/uploadfile/raw_docs/4901772429791.jpg,,,,440,,JPY,,2025-07-01,'※一般情報・予約解禁日時：2025年4月19日 12時00分～厳守(C)天野明／集英社・テレビ東京・リボーン製作委員会'\n";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Goods_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  
} 


// 新增文件对象存储
const selectedFile = ref<File | null>(null)

// 改造后的文件处理方法
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    selectedFile.value = input.files[0];
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

  uploading.value = true;

  const formData = new FormData();
  formData.append('file', selectedFile.value);
  // 覆盖策略
  formData.append('overwrite', selectedOption.value);

  if (staffStore.staffInfo?.company?.id) {
    formData.append('company_id', staffStore.staffInfo?.company?.id);
  } else {
    showToast(t('common.validation.company-required'), 'error');
    return;
  }

  await httpRequest('/api/warehouse/goods/bulk_upload', {
    method: 'POST',
    body: formData,
    onSuccess: async (data) => {
      is_end.value = true;
      result.value = data?.message;
    },
    onError: (error) => {        
      showToast(error?.message, 'error');
    },
    onFinally: () => {
      uploading.value = false;
      selectedFile.value = null; // 清空已选文件
    }
  })
}

const resetToUpload = () => {
  result.value = {};
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
                    <h5>Congratulations</h5>
                    <p class="">{{result}}</p>
                    <div class="">
                        <button class="btn btn-sm btn-primary m-1" @click="resetToUpload">Upload new files</button>
                        <NuxtLink class="btn btn-sm btn-info m-1" :to="`/goods/`">Close</NuxtLink>
                    </div>
                </div>
              </template>

            </div>
          </div>
        </div>
    </div>
</template>

<style scoped></style>