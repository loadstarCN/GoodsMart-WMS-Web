<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const itemId = route.params.id;

const dataToPass = computed(() => ({
  current: t('admin.tenants.operations.edit'),
  list: [t('admin.title'), t('admin.nav.tenants'), t('admin.tenants.operations.edit')]
}));

let loading = ref(true);
const loadError=ref('');
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

const fetchData = async () => {
  loading.value = true;
  loadError.value='';
  await httpRequest<any>(`/api/warehouse/company/${itemId}`, {
    method: 'GET',
    onSuccess: (data) => {
      itemData.value = {
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        zip_code: data.zip_code || '',
        default_currency: data.default_currency || 'JPY',
        // 后端返回带偏移的 ISO 时刻（UTC），date 输入框只接受 YYYY-MM-DD：按页头仓库 / 浏览器的时区取日期
        // （直接截前 10 位是 UTC 的日期，UTC 以东的时区会早一天）
        expired_at: data.expired_at ? formatInTimeZone(data.expired_at, 'YYYY-MM-DD', resolveTimeZone()) || null : null,
        is_active: data.is_active ?? true,
      };
    },
    onError: (error) => {
      loadError.value=error.message;
      showToast(error.message, 'error');
    },
    onFinally: () => {
      loading.value = false;
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
  if (!validate()) return;
  saving.value = true;
  await httpRequest(`/api/warehouse/company/${itemId}`, {
    method: 'PUT',
    // 清空日期时提交 null 而不是空串
    body: { ...itemData.value, expired_at: itemData.value.expired_at || null },
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success');
      router.push('/admin/tenants/');
    },
    onError: (error) => {
      showToast(error.message, 'error');
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
</script><template><div class="w-tenant-form w-scope"><header><h1>{{t('admin.tenants.operations.edit')}}</h1></header><WAlert v-if="loadError" tone="block" :title="loadError"/><WCard flush><form @submit.prevent="submitForm"><fieldset :disabled="saving||loading||!!loadError"><WFormSection :title="t('common.fields.name')"><div class="fields"><WField :label="t('common.fields.name')" :error="errors.name" required><WInput v-model="itemData.name" type="text"/></WField><WField :label="t('common.fields.email')" :error="errors.email" required><WInput v-model="itemData.email" type="email"/></WField><WField :label="t('common.fields.phone')" :error="errors.phone"><WInput v-model="itemData.phone" type="tel"/></WField><WField :label="t('common.fields.zip')" :error="errors.zip_code"><WInput v-model="itemData.zip_code" type="text"/></WField><WField :label="t('common.fields.address')" :error="errors.address"><WInput v-model="itemData.address" type="text"/></WField></div></WFormSection><WFormSection :title="t('admin.tenants.fields.expired-at')"><div class="fields"><WField :label="t('admin.tenants.fields.expired-at')"><WInput v-model="itemData.expired_at" type="date"/></WField><WField :label="t('common.fields.currency')"><WInput v-model="itemData.default_currency" maxlength="3"/></WField><WField :label="t('common.fields.status')"><WSwitch v-model="itemData.is_active">{{t('common.status.'+(itemData.is_active?'active':'inactive'))}}</WSwitch></WField></div></WFormSection></fieldset><footer><WButton to="/admin/tenants">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="saving" :disabled="loading||!!loadError">{{t('button.save')}}</WButton></footer></form></WCard></div></template><style scoped>.w-tenant-form{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:800px}fieldset{border:0;padding:0;margin:0;min-width:0}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:0 0 12px}footer{display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>