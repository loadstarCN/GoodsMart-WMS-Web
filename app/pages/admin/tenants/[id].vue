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
        expired_at: data.expired_at || null,
        is_active: data.is_active ?? true,
      };
    },
    onError: (error) => {
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
  if (!validate()) return;
  saving.value = true;
  await httpRequest(`/api/warehouse/company/${itemId}`, {
    method: 'PUT',
    body: itemData.value,
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

</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>

  <div class="row" v-else>
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-header justify-content-between">
          <div class="card-title">{{ t('admin.tenants.operations.edit') }}</div>
          <NuxtLink to="/admin/tenants/" class="btn btn-light btn-wave">
            <i class="ri-arrow-left-line me-1"></i>{{ t('button.cancel') }}
          </NuxtLink>
        </div>
        <div class="card-body">
          <form @submit.prevent="submitForm">
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
              <!-- Status -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.status') }}</label>
                <div class="form-check form-switch mt-1">
                  <input class="form-check-input" type="checkbox" v-model="itemData.is_active">
                  <label class="form-check-label">{{ itemData.is_active ? t('common.status.active') : t('common.status.inactive') }}</label>
                </div>
              </div>
            </div>

            <div class="mt-4">
              <button type="submit" class="btn btn-primary btn-wave" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
                {{ t('button.save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
