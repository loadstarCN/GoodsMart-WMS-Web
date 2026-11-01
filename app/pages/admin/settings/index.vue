<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
useHead({title:()=>t('admin.nav.settings')});

const dataToPass = computed(() => ({
  current: t('admin.nav.settings'),
  list: [t('admin.title'), t('admin.nav.settings')]
}));

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const {bizErrorMessage}=useBizError()
const loadError=ref(''),saveError=ref(''),loaded=ref(false),original=ref('')
const presentation=useTemplateRef<{dirty:boolean;pending:boolean}>('presentation')
const ipAccess=useTemplateRef<{dirty:boolean;pending:boolean}>('ipAccess')
let generation=0
onBeforeUnmount(()=>generation++)
useUnsavedForm(()=>!!presentation.value?.dirty||!!ipAccess.value?.dirty||(loaded.value&&JSON.stringify(smtp.value)!==original.value),()=>saving.value||!!presentation.value?.pending||!!ipAccess.value?.pending)

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
  const seq=++generation
  loadError.value='';loaded.value=false
  loading.value = true;
  await httpRequest('/api/system/settings/smtp', {
    method: 'GET',
    onSuccess: (data: any) => {
      if(seq!==generation)return
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
      original.value=JSON.stringify(smtp.value);loaded.value=true
    },
    onError: (error) => {
      if(seq===generation)loadError.value=bizErrorMessage(error)
    },
    onFinally: () => {
      if(seq===generation)loading.value = false;
    }
  });
};

const saveSmtpConfig = async () => {
  if(saving.value||!loaded.value)return;
  saveError.value=''
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
      original.value=JSON.stringify(smtp.value)
    },
    onError: (error) => {
      saveError.value=bizErrorMessage(error)
    },
    onFinally: () => {
      saving.value = false;
    }
  });
};

const sendTestEmail = async () => {
  if(testing.value||saving.value||!loaded.value)return;
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
      showToast(bizErrorMessage(error), 'error');
    },
    onFinally: () => {
      testing.value = false;
    }
  });
};

onMounted(() => {
  fetchSmtpConfig();
});
</script><template><div class="w-settings w-scope"><h1>{{t('admin.nav.settings')}}</h1><nav class="section-nav" :aria-label="t('admin.nav.settings')"><a v-for="section in [{id:'brand',label:t('presentation.brand')},{id:'apk',label:t('presentation.pda')},{id:'notice',label:t('presentation.notices')},{id:'smtp',label:t('admin.settings.smtp.title')},{id:'ip',label:t('presentation.access')}]" :key="section.id" :href="'#s-'+section.id">{{section.label}}</a></nav><PresentationSettings ref="presentation"/><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')"/></WCard><WAlert v-else-if="loadError" tone="block" :title="t('admin.settings.smtp.title')">{{loadError}}<template #actions><WButton @click="fetchSmtpConfig">{{t('dn.list.retry')}}</WButton></template></WAlert><template v-else-if="loaded"><WAlert v-if="saveError" tone="block" :title="t('admin.settings.smtp.title')">{{saveError}}</WAlert><WCard id="s-smtp" flush><div class="section-title"><h2>{{t('admin.settings.smtp.title')}}</h2><p>{{t('admin.settings.smtp.description')}}</p></div><form @submit.prevent="saveSmtpConfig"><fieldset :disabled="saving"><WFormSection :title="t('admin.settings.smtp.host')"><div class="fields"><WField :label="t('admin.settings.smtp.host')"><WInput v-model="smtp.smtp_host" :placeholder="t('admin.settings.smtp.host-placeholder')"/></WField><WField :label="t('admin.settings.smtp.port')"><WInput v-model.number="smtp.smtp_port" type="number" min="1" max="65535"/></WField></div></WFormSection><WFormSection :title="t('admin.settings.smtp.username')"><div class="fields"><WField :label="t('admin.settings.smtp.username')"><WInput v-model="smtp.smtp_username" autocomplete="username"/></WField><WField :label="t('admin.settings.smtp.password')" :hint="passwordConfigured?t('admin.settings.smtp.password-hint'):undefined"><SecretInput v-model="smtp.smtp_password" autocomplete="new-password" :placeholder="passwordConfigured?t('admin.settings.smtp.password-configured'):t('admin.settings.smtp.password-placeholder')"/></WField></div></WFormSection><WFormSection :title="t('admin.settings.smtp.sender')"><div class="fields"><WField :label="t('admin.settings.smtp.sender')" :hint="t('admin.settings.smtp.sender-hint')"><WInput v-model="smtp.smtp_sender" type="email"/></WField><WField :label="t('admin.settings.smtp.use-tls')" :hint="t('admin.settings.smtp.tls-hint')"><WSwitch v-model="smtp.smtp_use_tls">{{t('admin.settings.smtp.use-tls')}}</WSwitch></WField></div></WFormSection></fieldset><footer><WButton type="submit" variant="primary" :loading="saving">{{t('button.save')}}</WButton></footer></form></WCard><WCard flush><WFormSection :title="t('admin.settings.smtp.test-title')"><form class="test-form" @submit.prevent="sendTestEmail"><p>{{t('admin.settings.smtp.test-description')}}</p><WField :label="t('admin.settings.smtp.test-recipient')"><WInput v-model="testEmail" type="email" required :placeholder="t('admin.settings.smtp.test-recipient-placeholder')"/></WField><WButton type="submit" :loading="testing" :disabled="saving">{{t('admin.settings.smtp.test-send')}}</WButton></form></WFormSection></WCard></template><IpAccessSettings ref="ipAccess"/></div></template><style scoped>.w-settings{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.section-nav{display:flex;flex-wrap:wrap;gap:8px}.section-nav a{padding:5px 12px;border:1px solid var(--w-border);border-radius:999px;color:var(--w-text-2);font-size:13px;text-decoration:none;background:var(--w-surface)}.section-nav a:hover{color:var(--w-primary)}.w-settings :deep([id^="s-"]){scroll-margin-top:76px}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0}p{font-size:13px;line-height:20px;color:var(--w-text-3);margin:4px 0 0}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;max-width:800px}fieldset{border:0;padding:0;margin:0;min-width:0}footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}.test-form{max-width:500px;display:flex;flex-direction:column;align-items:start;gap:12px}.test-form>.w-field{width:100%}@media(max-width:700px){.fields{grid-template-columns:minmax(0,1fr)}}</style>
