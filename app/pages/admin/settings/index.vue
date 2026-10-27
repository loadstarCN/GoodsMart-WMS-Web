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

// 后端没返回密码明文：设置过时返回 ********（见 system/settings/views.py）
const MASKED_PASSWORD = '********';
const passwordConfigured = ref(false);

/**
 * smtp_use_tls 后端存字符串（"True" / "False"，旧数据可能是 true / 1 / yes）；空串 = 没配置过，按后端默认开启
 */
const parseUseTls = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return true;
  return ['true', '1', 'yes', 'on'].includes(text);
};

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
        // 密码框留空：设过时占位显示「已设置」，不改就不提交
        smtp_password: '',
        smtp_sender: data.smtp_sender || '',
        smtp_use_tls: parseUseTls(data.smtp_use_tls),
      };
      passwordConfigured.value = !!data.smtp_password;
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
  if(saving.value)return;
  saving.value = true;
  // 密码没填（或误填了占位的 ********）就不提交该字段，后端保留原密码
  const { smtp_password: password, ...rest } = smtp.value;
  const body: Record<string, any> = { ...rest };
  if (password && password !== MASKED_PASSWORD) body.smtp_password = password;
  await httpRequest('/api/system/settings/smtp', {
    method: 'PUT',
    body,
    onSuccess: () => {
      showToast(t('admin.settings.smtp.save-success'), 'success');
      if (body.smtp_password) {
        passwordConfigured.value = true;
        smtp.value.smtp_password = '';
      }
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
  if(testing.value)return;
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
</script><template><div class="w-settings w-scope"><h1>{{t('admin.nav.settings')}}</h1><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')"/></WCard><template v-else><WCard flush><div class="section-title"><h2>{{t('admin.settings.smtp.title')}}</h2><p>{{t('admin.settings.smtp.description')}}</p></div><form @submit.prevent="saveSmtpConfig"><fieldset :disabled="saving"><WFormSection :title="t('admin.settings.smtp.host')"><div class="fields"><WField :label="t('admin.settings.smtp.host')"><WInput v-model="smtp.smtp_host" :placeholder="t('admin.settings.smtp.host-placeholder')"/></WField><WField :label="t('admin.settings.smtp.port')"><WInput v-model.number="smtp.smtp_port" type="number" min="1" max="65535"/></WField></div></WFormSection><WFormSection :title="t('admin.settings.smtp.username')"><div class="fields"><WField :label="t('admin.settings.smtp.username')"><WInput v-model="smtp.smtp_username" autocomplete="username"/></WField><WField :label="t('admin.settings.smtp.password')" :hint="passwordConfigured?t('admin.settings.smtp.password-hint'):undefined"><SecretInput v-model="smtp.smtp_password" autocomplete="new-password" :placeholder="passwordConfigured?t('admin.settings.smtp.password-configured'):t('admin.settings.smtp.password-placeholder')"/></WField></div></WFormSection><WFormSection :title="t('admin.settings.smtp.sender')"><div class="fields"><WField :label="t('admin.settings.smtp.sender')"><WInput v-model="smtp.smtp_sender" type="email"/></WField><WField :label="t('admin.settings.smtp.use-tls')"><WSwitch v-model="smtp.smtp_use_tls">{{t('admin.settings.smtp.use-tls')}}</WSwitch></WField></div></WFormSection></fieldset><footer><WButton type="submit" variant="primary" :loading="saving">{{t('button.save')}}</WButton></footer></form></WCard><WCard flush><WFormSection :title="t('admin.settings.smtp.test-title')"><form class="test-form" @submit.prevent="sendTestEmail"><p>{{t('admin.settings.smtp.test-description')}}</p><WField :label="t('admin.settings.smtp.test-recipient')"><WInput v-model="testEmail" type="email" required :placeholder="t('admin.settings.smtp.test-recipient-placeholder')"/></WField><WButton type="submit" :loading="testing">{{t('admin.settings.smtp.test-send')}}</WButton></form></WFormSection></WCard></template></div></template><style scoped>.w-settings{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:4px 0 0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:800px}fieldset{border:0;padding:0;margin:0;min-width:0}footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}.test-form{max-width:500px;display:flex;flex-direction:column;align-items:start;gap:12px}.test-form>.w-field{width:100%}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>