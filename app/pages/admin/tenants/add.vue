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

let errors = ref<Record<string, string>>({});

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
  loading.value = true;
  await httpRequest('/api/warehouse/company/', {
    method: 'POST',
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success');
      router.push('/admin/tenants/');
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

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
