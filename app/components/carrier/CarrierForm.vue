<script lang="ts" setup>
const props=defineProps<{carrierId?:string;readonly?:boolean}>()

// 定义页面元数据


// 获取国际化方法
const { t } = useI18n()


// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.carrier'),
  list: [t('nav.warehouse'), t('nav.carrier')]
}))

const staffStore = useStaffStore()
const router = useRouter()
const itemId=props.carrierId
const editable=computed(()=>!props.readonly&&staffStore.hasPermission('carrier_edit'))
let loading = ref(true);

const itemData = ref<Record<string, any>>({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  email: null,
  contact: null,
  company_id: staffStore.staffInfo?.company_id,
})

useHead({title:()=>itemData.value.name||t('carrier.operations.add')})
const errors = ref<Record<string, any>>({
  name: null,
  email: null,
})


// ------------------ 提交保存（承运商资料 + 对接方式一起存；在线对接单独保存） ----------------------
const { bizErrorMessage } = useBizError()
const methodsRef = ref<{ validate: () => boolean; payload: () => Record<string, any> } | null>(null)
/** 对接方式不合法（400 16135）：field 指明哪一项 */
const methodErrors = ref<Record<string, string>>({})
// 防重复提交：请求期间禁用按钮；成功后跳转离开，不再解锁
const submitting = ref(false)
const saveCarrier = async () => {
  if (submitting.value||!editable.value) return
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required', { entity: t('carrier.entity') }) : null,
    email: (() => {
      const email = itemData.value.email;
      // 仅当输入非空时进行格式验证
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return t('common.validation.email-format');
      }
      return null;
    })()
  }

  const methodsValid = methodsRef.value ? methodsRef.value.validate() : true
  if (Object.values(errors.value).some(v => v) || !methodsValid) return

  submitting.value = true
  methodErrors.value = {}
  await httpRequest(`/api/warehouse/carrier/${itemId||''}`, {
    method: itemId?'PUT':'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { ...Object.fromEntries(['name','code','phone','email','contact','zip_code','address','is_active'].map(key=>[key,itemData.value[key]])), ...(!itemId?{company_id:staffStore.staffInfo?.company_id}:{}), ...(methodsRef.value?.payload() || {}) },
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/carrier/')
    },
    onError: (error) => {
      submitting.value = false
      if (error.code === 16135 && error.field) methodErrors.value = { [error.field]: bizErrorMessage(error) }
      showToast(bizErrorMessage(error), 'error')
    }
  })
}

/**
 * 在线对接保存 / 移除后：能选的对接方式变了，后端也可能把还是默认值的方式自动改成 api（或删掉对接时退回默认），
 * 重读这几项（画面上其余未保存的输入不动）
 */
const METHOD_FIELDS = ['waybill_method', 'pickup_method', 'pickup_schedule', 'pickup_contact', 'tracking_method',
  'tracking_url_template', 'auto_sign_days', 'available_methods', 'integration', 'file_preset', 'file_template', 'file_account']
const refreshMethods = async () => {
  await httpRequest<any>(`/api/warehouse/carrier/${itemId}`, {
    method: 'GET',
    onSuccess: (data) => {
      for (const key of METHOD_FIELDS) {
        if (data && key in data) itemData.value[key] = data[key]
      }
    },
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/carrier/${itemId}`, {
        method: 'GET',

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
  if(itemId)await fetchData();else {itemData.value.is_active=true;loading.value=false}
})


</script>

<template>
 <div class="w-carrier-form w-scope"><header><nav><NuxtLink class="w-carrier-link" to="/carrier">{{t('nav.carrier')}}</NuxtLink><span>/</span><span>{{itemId?itemData.name:t('carrier.operations.add')}}</span></nav><div class="w-carrier-heading"><h1>{{itemId?itemData.name:t('carrier.operations.add')}}</h1><WStatus v-if="itemId&&!loading" :tone="itemData.is_active?'ok':'none'">{{t(itemData.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus><WButton v-if="readonly&&staffStore.hasPermission('carrier_edit')" :to="'/carrier/edit/'+itemId">{{t('button.edit')}}</WButton></div></header><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')" /></WCard><WCard v-else flush><form @submit.prevent="saveCarrier"><WFormSection :title="t('recipient.ui.basic')"><WFormGrid><WField :label="t('carrier.fields.name')" :error="errors.name"><WInput v-model="itemData.name" :disabled="!editable||submitting" /></WField><WField :label="t('carrier.fields.code')" :span="4" optional><WInput v-model="itemData.code" maxlength="30" :disabled="!editable||submitting" /></WField><WField :label="t('common.fields.phone')" :span="4" optional><WInput v-model="itemData.phone" type="tel" :disabled="!editable||submitting" /></WField><WField :label="t('common.fields.email')" :span="4" optional :error="errors.email"><WInput v-model="itemData.email" type="email" :disabled="!editable||submitting" /></WField><WField :label="t('common.fields.contact')" :span="6" optional><WInput v-model="itemData.contact" :disabled="!editable||submitting" /></WField><WField :label="t('common.fields.zip')" :span="3" optional><WInput v-model="itemData.zip_code" :disabled="!editable||submitting" /></WField><WField :label="t('common.fields.address')" optional><WInput v-model="itemData.address" :disabled="!editable||submitting" /></WField></WFormGrid></WFormSection>
 <CarrierIntegrationCard v-if="itemId" :carrier-id="itemId" :editable="editable&&!submitting" @saved="refreshMethods" /><CarrierMethodsCard v-if="itemId" ref="methodsRef" v-model="itemData" :editable="editable&&!submitting" :server-errors="methodErrors" /><footer><WButton to="/carrier" :disabled="submitting">{{t('button.cancel')}}</WButton><WButton v-if="editable" variant="primary" type="submit" :loading="submitting">{{t('button.save')}}</WButton></footer></form></WCard></div>
</template>
<style scoped>
.w-carrier-form{display:flex;flex-direction:column;gap:16px}.w-carrier-form header{display:flex;flex-direction:column;gap:8px}.w-carrier-form nav{display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2)}.w-carrier-link{color:var(--w-text-3);text-decoration:none}.w-carrier-heading{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.w-carrier-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-carrier-heading>.w-button{margin-left:auto}.w-carrier-form :deep(.w-form-grid){gap:12px 16px}.w-carrier-form form>footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}
</style>
