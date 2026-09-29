<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
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
      showToast(t('admin.tenants.admin.create-failed', { message: error.message }), 'error');
    }
  });
  return ok;
};

const submitForm = async () => {
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

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="card-title">{{ t('admin.tenants.operations.add') }}</div>
          <NuxtLink to="/admin/tenants/" class="btn btn-light btn-wave">
            <i class="ri-arrow-left-line me-1"></i>{{ t('button.cancel') }}
          </NuxtLink>
        </div>
        <div class="card-body">
          <form @submit.prevent="submitForm">
            <div class="alert alert-warning" v-if="createdCompanyId">
              <i class="ri-error-warning-line me-1"></i>{{ t('admin.tenants.admin.company-created-retry') }}
            </div>
            <fieldset :disabled="!!createdCompanyId">
            <div class="row gy-3">
              <!-- Name -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.name') }} <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="itemData.name" :class="{'is-invalid': errors.name}" :placeholder="t('common.placeholders.name')">
                <div class="invalid-feedback">{{ errors.name }}</div>
              </div>
              <!-- Email -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.email') }} <span class="text-danger">*</span></label>
                <input type="email" class="form-control" v-model="itemData.email" :class="{'is-invalid': errors.email}" :placeholder="t('common.placeholders.email')">
                <div class="invalid-feedback">{{ errors.email }}</div>
              </div>
              <!-- Phone -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.phone') }}</label>
                <input type="text" class="form-control" v-model="itemData.phone" :placeholder="t('common.placeholders.phone')">
              </div>
              <!-- Address -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.address') }}</label>
                <input type="text" class="form-control" v-model="itemData.address" :placeholder="t('common.placeholders.address')">
              </div>
              <!-- Zip Code -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.zip') }}</label>
                <input type="text" class="form-control" v-model="itemData.zip_code" :placeholder="t('common.placeholders.zip')">
              </div>
              <!-- Currency -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.currency') }}</label>
                <input type="text" class="form-control" v-model="itemData.default_currency">
              </div>
              <!-- Expired At -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('admin.tenants.fields.expired-at') }}</label>
                <input type="date" class="form-control" v-model="itemData.expired_at">
              </div>
            </div>
            </fieldset>

            <!-- Initial Admin -->
            <div class="border-top border-block-start-dashed mt-4 pt-3">
              <p class="fs-15 fw-semibold mb-1">{{ t('admin.tenants.admin.title') }}</p>
              <p class="text-muted fs-12 mb-3">{{ t('admin.tenants.admin.hint') }}</p>
              <div class="row gy-3">
                <div class="col-xl-6">
                  <label class="form-label">{{ t('common.fields.name') }}</label>
                  <input type="text" class="form-control" v-model="adminData.user_name" :class="{'is-invalid': errors.admin_user_name}" :placeholder="t('common.placeholders.name')" autocomplete="off">
                  <div class="invalid-feedback">{{ errors.admin_user_name }}</div>
                </div>
                <div class="col-xl-6">
                  <label class="form-label">{{ t('common.fields.email') }}</label>
                  <input type="email" class="form-control" v-model="adminData.email" :class="{'is-invalid': errors.admin_email}" :placeholder="t('common.placeholders.email')" autocomplete="off">
                  <div class="invalid-feedback">{{ errors.admin_email }}</div>
                </div>
                <div class="col-xl-6">
                  <label class="form-label">{{ t('common.fields.password') }}</label>
                  <input type="password" class="form-control" v-model="adminData.password" :class="{'is-invalid': errors.admin_password}" :placeholder="t('common.placeholders.password')" autocomplete="new-password">
                  <div class="invalid-feedback">{{ errors.admin_password }}</div>
                </div>
                <div class="col-xl-6">
                  <label class="form-label">{{ t('staff.fields.roles') }}</label>
                  <select class="form-select" v-model="adminData.role" :class="{'is-invalid': errors.admin_role}">
                    <option value="">{{ t('common.select-placeholder') }}</option>
                    <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
                  </select>
                  <div class="invalid-feedback">{{ errors.admin_role }}</div>
                </div>
              </div>
            </div>

            <div class="mt-4">
              <button type="submit" class="btn btn-primary btn-wave" :disabled="loading">
                <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
                {{ t('button.submit') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
