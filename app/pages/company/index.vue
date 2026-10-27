<script lang="ts" setup>
import { currenciesOptions } from '~/data/selectOptions'
import { hasNonLatin } from '~/composables/customs/customsDocuments'

// 定义页面元数据
definePageMeta({
})

// 获取国际化方法
const { t } = useI18n()
const { bizErrorMessage } = useBizError()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.company'),
  list: [t('nav.warehouse'), t('nav.company')]
}))

const staffStore = useStaffStore()
const router = useRouter()
let route = useRoute();
let loading = ref(true);

const itemData = ref<Record<string, any>>({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  email: null,
  logo: null,
  default_currency: staffStore.staffInfo?.company?.default_currency || 'JPY',
  // 出口资料（海外出货单证 CI / PL 上以英文印出）
  legal_name_en: null,
  address_en: null,
  country_code: null,
  tax_id_label: null,
  tax_id: null,
  export_contact_name: null,
  export_signatory_name: null,
  export_signatory_title: null,
})

// 出口资料字段（英文）：含非拉丁字符时只提示，不拦截（单证上会给警告）
const exportTextFields = [
  'legal_name_en', 'address_en', 'tax_id_label', 'tax_id',
  'export_contact_name', 'export_signatory_name', 'export_signatory_title',
]
const nonLatin = computed<Record<string, boolean>>(() => {
  const data = itemData.value as Record<string, any>
  return Object.fromEntries(exportTextFields.map((f) => [f, hasNonLatin(data?.[f])]))
})

const errors = ref<Record<string, any>>({
  name: null,
  email: null,
})

// 配置化选项集合
const selectOptions = reactive({
  currencies: currenciesOptions,
})



// ------------------ 提交保存 ----------------------
// 防重复提交：请求期间禁用按钮
const submitting = ref(false)
const editable=computed(()=>staffStore.hasPermission('company_edit'))
const logoUploader=useTemplateRef<{triggerSelect:()=>void}>('logoUploader')
useHead({title:()=>t('nav.company')})
const saveCompany = async () => {
  if (submitting.value||!editable.value) return
  errors.value = {
    name: !itemData.value.name ? t("common.validation.name-required", { entity: t('company.entity') }) : null,
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

  const companyId = staffStore.staffInfo?.company_id
  if (!companyId) {
    showToast(t('common.validation.company-required'), 'error')
    return
  }

  submitting.value = true
  await httpRequest(`/api/warehouse/company/${companyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: Object.fromEntries(['name','address','phone','zip_code','email','logo','default_currency','country_code',...exportTextFields].map(key=>[key,itemData.value[key]])),
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      // 公司名称、默认币种等在员工信息里有缓存（页头、各新建页默认值）：重新拉取
      await staffStore.refreshStaffInfo()
    },
    onError: (error) => {
      // 14019 文本超长 / 14020 国家代码不合法 等业务码用三语文案
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      submitting.value = false
    }
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const companyId = staffStore.staffInfo?.company_id
    if (!companyId) {
      showToast(t('common.validation.company-required'), 'error')
      loading.value = false
      return null
    }
    const data = await httpRequest(`/api/warehouse/company/${companyId}`, {
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
  // 确保 staffInfo 已加载（可能 Header 尚未完成加载）
  if (!staffStore.staffInfo) {
    await staffStore.getCurrentStaffInfo()
  }
  await fetchData();
})


</script>

<template><div class="w-company w-scope"><header><h1>{{t('company.title')}}</h1></header><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')" /></WCard><WCard v-else flush><form @submit.prevent="saveCompany"><fieldset :disabled="submitting||!editable"><WFormSection :title="t('recipient.ui.basic')"><WFormGrid><WField :label="t('company.fields.name')" :error="errors.name"><WInput v-model="itemData.name" maxlength="255" /></WField><WField :span="6" :label="t('common.fields.phone')" optional><WInput v-model="itemData.phone" type="tel" maxlength="20" /></WField><WField :span="6" :label="t('common.fields.email')" :error="errors.email" optional><WInput v-model="itemData.email" type="email" maxlength="255" /></WField></WFormGrid></WFormSection><WFormSection :title="t('common.fields.address')"><WFormGrid><WField :span="4" :label="t('company.fields.country-code')" optional><CountryCombobox v-model="itemData.country_code" :disabled="submitting||!editable" /></WField><WField :span="4" :label="t('common.fields.zip')" optional><WInput v-model="itemData.zip_code" maxlength="10" /></WField><WField :label="t('company.fields.address')" optional><WInput v-model="itemData.address" maxlength="255" /></WField></WFormGrid></WFormSection><WFormSection :title="t('common.fields.logo')"><div class="w-company-logo"><ImageUploader v-if="editable" ref="logoUploader" v-model="itemData.logo" upload-url="/api/warehouse/company/image/upload" shape="square" :size="64" :show-hint="false" /><img v-else-if="itemData.logo" :src="itemData.logo" alt="" /><WButton v-if="editable" @click="logoUploader?.triggerSelect()">{{t('button.upload')}}</WButton></div></WFormSection><WFormSection :title="t('company.sections.export')" :help="t('company.tips.export')"><WFormGrid><WField v-for="field in exportTextFields" :key="field" :span="['legal_name_en','address_en'].includes(field)?12:6" :label="t('company.fields.'+field.replaceAll('_','-'))" :hint="nonLatin[field]?t('common.tips.non-latin'):undefined" optional><WTextarea v-if="field==='address_en'" v-model="itemData[field]" :rows="2" :maxlength="500" /><WInput v-else v-model="itemData[field]" :maxlength="field==='legal_name_en'?255:field.startsWith('tax')?40:100" /></WField></WFormGrid></WFormSection><WFormSection :title="t('company.ui.defaults')"><WFormGrid><WField :span="4" :label="t('common.fields.currency')"><WSelect v-model="itemData.default_currency" :options="currenciesOptions.map(value=>({value,label:value}))" /></WField></WFormGrid></WFormSection></fieldset><footer><WButton v-if="editable" type="submit" variant="primary" :loading="submitting">{{t('button.save')}}</WButton></footer></form></WCard></div></template>
<style scoped>
.w-company{display:flex;flex-direction:column;gap:16px}.w-company h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-company fieldset{margin:0;padding:0;border:0;min-width:0}.w-company :deep(.w-form-grid){gap:12px 16px}.w-company-logo{display:flex;align-items:center;gap:16px}.w-company-logo>img{width:64px;height:64px;object-fit:contain}.w-company footer{display:flex;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}
</style>
