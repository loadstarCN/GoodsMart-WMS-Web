<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();

const dataToPass = computed(() => ({
  current: t('admin.nav.settings'),
  list: [t('admin.title'), t('admin.nav.settings')]
}));

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);

// SMTP form
const smtp = ref({
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_sender: '',
  smtp_use_tls: true,
});

// Test email
const testEmail = ref('');

const fetchSmtpConfig = async () => {
  loading.value = true;
  await httpRequest('/api/system/settings/smtp', {
    method: 'GET',
    onSuccess: (data: any) => {
      smtp.value = {
        smtp_host: data.smtp_host || '',
        smtp_port: data.smtp_port || 587,
        smtp_username: data.smtp_username || '',
        smtp_password: '',
        smtp_sender: data.smtp_sender || '',
        smtp_use_tls: data.smtp_use_tls ?? true,
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

const saveSmtpConfig = async () => {
  saving.value = true;
  await httpRequest('/api/system/settings/smtp', {
    method: 'PUT',
    body: smtp.value,
    onSuccess: () => {
      showToast(t('admin.settings.smtp.save-success'), 'success');
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
    onFinally: () => {
      saving.value = false;
    }
  });
};

const sendTestEmail = async () => {
  if (!testEmail.value.trim()) {
    showToast(t('admin.settings.smtp.test-required'), 'error');
    return;
  }
  testing.value = true;
  await httpRequest('/api/system/settings/smtp/test', {
    method: 'POST',
    body: { to: testEmail.value.trim() },
    onSuccess: () => {
      showToast(t('admin.settings.smtp.test-success'), 'success');
    },
    onError: (error) => {
      showToast(error.message, 'error');
    },
    onFinally: () => {
      testing.value = false;
    }
  });
};

onMounted(() => {
  fetchSmtpConfig();
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
    <!-- SMTP Configuration -->
    <div class="col-xl-8">
      <div class="card custom-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ri-mail-settings-line me-2"></i>{{ t('admin.settings.smtp.title') }}
          </div>
        </div>
        <div class="card-body">
          <p class="text-muted mb-4">{{ t('admin.settings.smtp.description') }}</p>
          <form @submit.prevent="saveSmtpConfig">
            <div class="row">
              <div class="col-md-8 mb-3">
                <label class="form-label">{{ t('admin.settings.smtp.host') }}</label>
                <input v-model="smtp.smtp_host" type="text" class="form-control" :placeholder="t('admin.settings.smtp.host-placeholder')">
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">{{ t('admin.settings.smtp.port') }}</label>
                <input v-model.number="smtp.smtp_port" type="number" class="form-control" :placeholder="t('admin.settings.smtp.port-placeholder')">
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">{{ t('admin.settings.smtp.username') }}</label>
                <input v-model="smtp.smtp_username" type="text" class="form-control" :placeholder="t('admin.settings.smtp.username-placeholder')">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">{{ t('admin.settings.smtp.password') }}</label>
                <input v-model="smtp.smtp_password" type="password" class="form-control" :placeholder="t('admin.settings.smtp.password-placeholder')" autocomplete="new-password">
                <small class="text-muted">{{ t('admin.settings.smtp.password-hint') }}</small>
              </div>
            </div>
            <div class="row">
              <div class="col-md-8 mb-3">
                <label class="form-label">{{ t('admin.settings.smtp.sender') }}</label>
                <input v-model="smtp.smtp_sender" type="email" class="form-control" :placeholder="t('admin.settings.smtp.sender-placeholder')">
              </div>
              <div class="col-md-4 mb-3 d-flex align-items-end">
                <div class="form-check form-switch mb-2">
                  <input v-model="smtp.smtp_use_tls" class="form-check-input" type="checkbox" id="smtpTls">
                  <label class="form-check-label" for="smtpTls">{{ t('admin.settings.smtp.use-tls') }}</label>
                </div>
              </div>
            </div>
            <div class="d-flex justify-content-end">
              <button type="submit" class="btn btn-primary" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
                <i v-else class="ri-save-line me-1"></i>{{ t('button.save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Test Email -->
    <div class="col-xl-4">
      <div class="card custom-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ri-send-plane-line me-2"></i>{{ t('admin.settings.smtp.test-title') }}
          </div>
        </div>
        <div class="card-body">
          <p class="text-muted mb-3">{{ t('admin.settings.smtp.test-description') }}</p>
          <div class="mb-3">
            <label class="form-label">{{ t('admin.settings.smtp.test-recipient') }}</label>
            <input v-model="testEmail" type="email" class="form-control" :placeholder="t('admin.settings.smtp.test-recipient-placeholder')">
          </div>
          <button class="btn btn-outline-primary w-100" :disabled="testing" @click="sendTestEmail">
            <span v-if="testing" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-mail-send-line me-1"></i>{{ t('admin.settings.smtp.test-send') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
