<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
  key: route => route.fullPath
});

const { t } = useI18n();
const { bizErrorMessage } = useBizError();
const tenantSummary=ref<any>(null);
const savedStatus=ref('active');
const platformZone=computed(()=>tenantSummary.value?.timezone||'UTC');
let originalExpiry:string|null=null, originalExpiryInput:string|null=null;
const router = useRouter();
const route = useRoute();
const itemId = route.params.id;

const dataToPass = computed(() => ({
  current: t('admin.tenants.operations.edit'),
  list: [t('admin.title'), t('admin.nav.tenants'), t('admin.tenants.operations.edit')]
}));

let loading = ref(true);
const loadError=ref(''),saveError=ref(''),summaryError=ref(''),original=ref<string|null>(null);
let generation=0,summaryGeneration=0;
let saving = ref(false);

let itemData = ref({
  name: '',
  email: '',
  phone: '',
  address: '',
  zip_code: '',
  default_currency: 'JPY',
  expired_at: null as string | null,
  is_active: true,
});

let errors = ref<Record<string, string>>({});

useUnsavedForm(()=>original.value!==null&&JSON.stringify(itemData.value)!==original.value,()=>saving.value);
onBeforeUnmount(()=>{generation++;summaryGeneration++});
const fetchSummary=async()=>{
 const seq=++summaryGeneration;summaryError.value='';
 const value=await httpRequest('/api/warehouse/company/'+itemId+'/platform-summary',{onError:e=>{if(seq===summaryGeneration)summaryError.value=bizErrorMessage(e)}});
 if(seq===summaryGeneration)tenantSummary.value=value;
};
const fetchData = async () => {
  const seq=++generation;original.value=null;
  loading.value = true;
  loadError.value='';
  await fetchSummary();
  if(seq!==generation)return;
  if(summaryError.value){loadError.value=summaryError.value;loading.value=false;return;}
  await httpRequest<any>(`/api/warehouse/company/${itemId}`, {
    method: 'GET',
    onSuccess: (data) => {
      if(seq!==generation)return;
      originalExpiry=data.expired_at||null;
      savedStatus.value=!data.is_active?'inactive':data.expired_at&&Date.parse(data.expired_at)<=Date.now()?'expired':'active';
      originalExpiryInput=originalExpiry?formatInTimeZone(originalExpiry,'YYYY-MM-DD[T]HH:mm',platformZone.value,{withZone:false})||null:null;
      itemData.value = {
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        zip_code: data.zip_code || '',
        default_currency: data.default_currency || 'JPY',
        // 后端返回带偏移的 ISO 时刻（UTC），date 输入框只接受 YYYY-MM-DD：按页头仓库 / 浏览器的时区取日期
        // （直接截前 10 位是 UTC 的日期，UTC 以东的时区会早一天）
        expired_at: originalExpiryInput,
        is_active: data.is_active ?? true,
      };
      original.value=JSON.stringify(itemData.value);
    },
    onError: (error) => {
      if(seq!==generation)return;
      loadError.value=bizErrorMessage(error);
      showToast(error.message, 'error');
    },
    onFinally: () => {
      if(seq===generation)loading.value = false;
    }
  });
};

const validate = () => {
  errors.value = {};
  if (!itemData.value.name?.trim()) {
    errors.value.name = t('common.validation.name-required', { entity: t('admin.tenants.entity') });
  }
  if (!itemData.value.email?.trim()) {
    errors.value.email = t('common.validation.email-required');
  } else if (!/\S+@\S+\.\S+/.test(itemData.value.email)) {
    errors.value.email = t('common.validation.email-format');
  }
  return Object.keys(errors.value).length === 0;
}

const submitForm = async () => {
  if(saving.value||loading.value||loadError.value)return;
  saveError.value='';
  if (!validate()) return;
  const expiresAt=itemData.value.expired_at?parseDateTime(itemData.value.expired_at,platformZone.value):null;
  if(itemData.value.expired_at&&!expiresAt){errors.value.expired_at=t('tenant-management.invalid-date');return;}
  saving.value = true;
  await httpRequest(`/api/warehouse/company/${itemId}`, {
    method: 'PUT',
    // 清空日期时提交 null 而不是空串
    body: { ...itemData.value, expired_at: itemData.value.expired_at===originalExpiryInput?originalExpiry:expiresAt?toOffsetIsoString(expiresAt,platformZone.value):null },
    onSuccess: async () => {
      original.value=JSON.stringify(itemData.value);
      showToast(t('action-results.success'), 'success');
      router.push('/admin/tenants/');
    },
    onError: (error) => {
      saveError.value=bizErrorMessage(error);
      showToast(saveError.value, 'error');
    },
    onFinally: () => {
      saving.value = false;
    }
  });
};

onMounted(() => {
  fetchData();
});

useHead({title:()=>t('admin.tenants.operations.edit')})
</script><template><div class="w-tenant-form w-scope"><header><h1>{{original!==null?itemData.name:t('admin.tenants.operations.edit')}}</h1><WStatus v-if="original!==null" :tone="savedStatus==='active'?'ok':savedStatus==='expired'?'bad':'none'">{{t('tenant-list.'+savedStatus)}}</WStatus><small v-if="tenantSummary">ID {{itemId}} &middot; {{t('common.dates.created')}} {{$dayjs(tenantSummary.created_at,'YYYY-MM-DD HH:mm')}} &middot; {{tenantSummary.creator_name||'\u2014'}}</small></header><section v-if="tenantSummary" class="tenant-facts" :aria-label="t('tenant-management.scope')"><WKpi :label="t('tenant-list.warehouses')" :value="tenantSummary.warehouses.length"/><WKpi :label="t('tenant-list.users')" :value="tenantSummary.staff_count" :caption="t('tenant-list.active')+' '+tenantSummary.staff_active+' \u00b7 '+t('tenant-list.inactive')+' '+(tenantSummary.staff_count-tenantSummary.staff_active)"/><WKpi :label="t('tenant-list.documents')" :value="(tenantSummary.documents?.asn||0)+(tenantSummary.documents?.dn||0)" :caption="tenantSummary.month+' \u00b7 ASN '+(tenantSummary.documents?.asn||0)+' \u00b7 DN '+(tenantSummary.documents?.dn||0)"/><WKpi :label="t('nav.apikeys')" :value="tenantSummary.api_keys?.total??'\u2014'" :caption="t('tenant-list.active')+' '+(tenantSummary.api_keys?.active??'\u2014')"/></section><WAlert v-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="fetchData">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-else-if="summaryError" tone="block" :title="summaryError"><template #actions><WButton @click="fetchSummary">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-if="saveError" tone="block" :title="saveError"/><WCard flush><form id="tenant-edit-form" @submit.prevent="submitForm"><fieldset :disabled="saving||loading||!!loadError"><WFormSection :title="t('common.fields.name')"><div class="fields"><WField :label="t('common.fields.name')" :error="errors.name" required><WInput v-model="itemData.name" type="text"/></WField><WField :label="t('common.fields.email')" :error="errors.email" required><WInput v-model="itemData.email" type="email"/></WField><WField :label="t('common.fields.phone')" :error="errors.phone"><WInput v-model="itemData.phone" type="tel"/></WField><WField :label="t('common.fields.zip')" :error="errors.zip_code"><WInput v-model="itemData.zip_code" type="text"/></WField><WField :label="t('common.fields.address')" :error="errors.address"><WInput v-model="itemData.address" type="text"/></WField></div></WFormSection><WFormSection id="tenant-expiry" :title="t('admin.tenants.fields.expired-at')"><div class="fields"><WField :label="t('admin.tenants.fields.expired-at')" :error="errors.expired_at"><WInput v-model="itemData.expired_at" type="datetime-local"/><small>{{t('tenant-list.expiry-hint',{zone:platformZone})}}</small></WField><WField :label="t('common.fields.currency')"><WInput v-model="itemData.default_currency" maxlength="3"/></WField><WField :label="t('common.fields.status')"><WSwitch v-model="itemData.is_active">{{t('common.status.'+(itemData.is_active?'active':'inactive'))}}</WSwitch></WField></div></WFormSection></fieldset></form><TenantScope v-if="tenantSummary" :company-id="String(itemId)" :summary="tenantSummary" @changed="fetchSummary"/><footer><WButton to="/admin/tenants">{{t('button.cancel')}}</WButton><WButton form="tenant-edit-form" type="submit" variant="primary" :loading="saving" :disabled="loading||!!loadError">{{t('button.save')}}</WButton></footer></WCard></div></template><style scoped>.w-tenant-form{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.tenant-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}header small{display:block;color:var(--w-text-3);font-size:12px;margin-top:8px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:800px}fieldset{border:0;padding:0;margin:0;min-width:0}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:0 0 12px}footer{display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>
