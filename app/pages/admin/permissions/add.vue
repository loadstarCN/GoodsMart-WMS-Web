<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
const router = useRouter();

const dataToPass = computed(() => ({
  current: t('admin.permissions.operations.add'),
  list: [t('admin.title'), t('admin.nav.permissions'), t('admin.permissions.operations.add')]
}));

let loading = ref(false);

let itemData = ref({
  name: '',
  description: '',
});

let errors = ref<Record<string, string>>({});

const validate = () => {
  errors.value = {};
  if (!itemData.value.name?.trim()) {
    errors.value.name = t('common.validation.name-required', { entity: t('admin.permissions.entity') });
  }
  return Object.keys(errors.value).length === 0;
};

const submitForm = async () => {
  if (!validate()) return;
  loading.value = true;
  await httpRequest('/api/system/user/permissions', {
    method: 'POST',
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success');
      router.push('/admin/permissions/');
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
          <div class="card-title">{{ t('admin.permissions.operations.add') }}</div>
          <NuxtLink to="/admin/permissions/" class="btn btn-light btn-wave">
            <i class="ri-arrow-left-line me-1"></i>{{ t('button.cancel') }}
          </NuxtLink>
        </div>
        <div class="card-body">
          <form @submit.prevent="submitForm">
            <div class="row gy-3">
              <!-- Name -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.name') }} <span class="text-danger">*</span></label>
                <input type="text" class="form-control" v-model="itemData.name" :class="{'is-invalid': errors.name}" :placeholder="t('admin.permissions.placeholders.name')">
                <div class="invalid-feedback">{{ errors.name }}</div>
              </div>
              <!-- Description -->
              <div class="col-xl-6">
                <label class="form-label">{{ t('common.fields.description') }}</label>
                <input type="text" class="form-control" v-model="itemData.description" :placeholder="t('admin.permissions.placeholders.description')">
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
