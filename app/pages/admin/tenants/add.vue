<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
// 角色存代码（company_admin 等），显示译名；自定义角色原样
const { roleLabel } = useOptionLabel();
const { bizErrorMessage } = useBizError();
const router = useRouter();

const dataToPass = computed(() => ({
  current: t('admin.tenants.operations.add'),
  list: [t('admin.title'), t('admin.nav.tenants'), t('admin.tenants.operations.add')]
}));

let loading = ref(false);

let itemData = ref({
  name: '',
  email: '',
  phone: '',
  address: '',
  zip_code: '',
  default_currency: 'JPY',
  expired_at: null as string | null,
});

// 初始管理员（可选）：公司创建成功后通过 /api/warehouse/staff/ 创建首个员工
const DEFAULT_ADMIN_ROLE = 'company_admin';
let adminData = ref({
  user_name: '',
  email: '',
  password: '',
  role: '' as string,
});
let roleOptions = ref<string[]>([]);

// 公司已创建但员工创建失败时记录公司 ID，再次提交只重试员工创建
let createdCompanyId = ref<number | null>(null);

let errors = ref<Record<string, string>>({});

const fetchRoles = async () => {
  await httpRequest<any>('/api/system/user/roles', {
    method: 'GET',
    params: { all: true },
    onSuccess: (data) => {
      const items = Array.isArray(data) ? data : (data?.items || []);
      roleOptions.value = items.map((r: any) => r.name).filter(Boolean);
      if (!adminData.value.role && roleOptions.value.includes(DEFAULT_ADMIN_ROLE)) {
        adminData.value.role = DEFAULT_ADMIN_ROLE;
      }
    },
    onError: (error) => {
      showToast(error.message, 'error');
    }
  });
};

// 初始管理员区块是否有任一字段填写
const adminFilled = computed(() =>
  !!(adminData.value.user_name.trim() || adminData.value.email.trim() || adminData.value.password)
);

const validate = () => {
  errors.value = {};
  if (!createdCompanyId.value) {
    if (!itemData.value.name?.trim()) {
      errors.value.name = t('common.validation.name-required', { entity: t('admin.tenants.entity') });
    }
    if (!itemData.value.email?.trim()) {
      errors.value.email = t('common.validation.email-required');
    } else if (!/\S+@\S+\.\S+/.test(itemData.value.email)) {
      errors.value.email = t('common.validation.email-format');
    }
  }
  if (adminFilled.value) {
    if (!adminData.value.user_name.trim()) {
      errors.value.admin_user_name = t('common.validation.name-required', { entity: t('common.entities.user') });
    }
    if (!adminData.value.email.trim()) {
      errors.value.admin_email = t('common.validation.email-required');
    } else if (!/\S+@\S+\.\S+/.test(adminData.value.email)) {
      errors.value.admin_email = t('common.validation.email-format');
    }
    if (!adminData.value.password) {
      errors.value.admin_password = t('common.validation.password-required');
    } else if (!isValidPassword(adminData.value.password)) {
      // 先在前端按后端的密码规则（10015）拦下：否则公司建好了、管理员却建不了
      errors.value.admin_password = t('common.validation.password-policy', passwordPolicyParams());
    }
    if (!adminData.value.role) {
      errors.value.admin_role = t('common.validation.role-min-count');
    }
  }
  return Object.keys(errors.value).length === 0;
}

const createCompany = async (): Promise<number | null> => {
  let companyId: number | null = null;
  await httpRequest<any>('/api/warehouse/company/', {
    method: 'POST',
    body: { ...itemData.value, expired_at: itemData.value.expired_at || null },
    onSuccess: (data) => {
      companyId = data?.id ?? null;
    },
    onError: (error) => {
      showToast(error.message, 'error');
    }
  });
  return companyId;
};

const createAdminStaff = async (companyId: number): Promise<boolean> => {
  let ok = false;
  await httpRequest('/api/warehouse/staff/', {
    method: 'POST',
    body: {
      user_name: adminData.value.user_name.trim(),
      email: adminData.value.email.trim(),
      password: adminData.value.password,
      company_id: companyId,
      roles: [adminData.value.role],
      warehouse_ids: [],
      is_active: true,
    },
    onSuccess: () => {
      ok = true;
    },
    onError: (error) => {
      showToast(t('admin.tenants.admin.create-failed', { message: bizErrorMessage(error) }), 'error');
    }
  });
  return ok;
};

const submitForm = async () => {
  if(loading.value)return;
  if (!validate()) return;
  loading.value = true;
  try {
    if (!createdCompanyId.value) {
      const companyId = await createCompany();
      if (!companyId) return;
      createdCompanyId.value = companyId;
    }

    if (adminFilled.value) {
      const ok = await createAdminStaff(createdCompanyId.value);
      if (!ok) return; // 公司已创建，停留在页面可重试创建管理员
    }

    showToast(t('action-results.success'), 'success');
    router.push('/admin/tenants/');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchRoles();
});

useHead({title:()=>t('admin.tenants.operations.add')})
</script><template><div class="w-tenant-form w-scope"><header><h1>{{t('admin.tenants.operations.add')}}</h1></header><WCard flush><form @submit.prevent="submitForm"><WAlert v-if="createdCompanyId" tone="warn" :title="t('admin.tenants.admin.company-created-retry')"/><fieldset :disabled="loading||!!createdCompanyId"><WFormSection :title="t('common.fields.name')"><div class="fields"><WField :label="t('common.fields.name')" :error="errors.name" required><WInput v-model="itemData.name" type="text"/></WField><WField :label="t('common.fields.email')" :error="errors.email" required><WInput v-model="itemData.email" type="email"/></WField><WField :label="t('common.fields.phone')" :error="errors.phone"><WInput v-model="itemData.phone" type="tel"/></WField><WField :label="t('common.fields.zip')" :error="errors.zip_code"><WInput v-model="itemData.zip_code" type="text"/></WField><WField :label="t('common.fields.address')" :error="errors.address"><WInput v-model="itemData.address" type="text"/></WField></div></WFormSection><WFormSection :title="t('admin.tenants.fields.expired-at')"><div class="fields"><WField :label="t('admin.tenants.fields.expired-at')"><WInput v-model="itemData.expired_at" type="date"/></WField><WField :label="t('common.fields.currency')"><WInput v-model="itemData.default_currency" maxlength="3"/></WField></div></WFormSection></fieldset><WFormSection :title="t('admin.tenants.admin.title')"><p>{{t('admin.tenants.admin.hint')}}</p><div class="fields"><WField :label="t('common.fields.name')" :error="errors.admin_user_name"><WInput v-model="adminData.user_name" type="text" :disabled="loading"/></WField><WField :label="t('common.fields.email')" :error="errors.admin_email"><WInput v-model="adminData.email" type="email" :disabled="loading"/></WField><WField :label="t('common.fields.password')" :error="errors.admin_password"><WInput v-model="adminData.password" type="password" :disabled="loading"/></WField><WField :label="t('staff.fields.roles')" :error="errors.admin_role"><WSelect v-model="adminData.role" :options="roleOptions.map(value=>({value,label:roleLabel(value)}))" :disabled="loading"/></WField></div></WFormSection><footer><WButton to="/admin/tenants">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="loading">{{t('button.save')}}</WButton></footer></form></WCard></div></template><style scoped>.w-tenant-form{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:800px}fieldset{border:0;padding:0;margin:0;min-width:0}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:0 0 12px}footer{display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>