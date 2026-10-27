<script lang="ts" setup>
import AuthFrame from "~/components/auth/AuthFrame.vue"
import { languages } from '~/data/headerData.js'
import type { HttpRequestError } from '~/utils/http'

definePageMeta({
  layout: 'custom',
});

const { t, setLocale: setI18nLocale } = useI18n();
const { bizErrorMessage } = useBizError();
const router = useRouter();
const cookieLang = useCookie('i18n_lang', { maxAge: 2592000 });
const currentLang = ref(cookieLang.value || 'en');

const setLocale = async (lang: string) => {
  await setI18nLocale(lang as 'en' | 'zh' | 'ja');
  cookieLang.value = lang;
  currentLang.value = lang;
};

// Step: 1 = enter email, 2 = enter code + new password
const step = ref(1);
const loading = ref(false);
const email = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const startCountdown = () => {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
};

/**
 * 发送验证码失败的提示：后端对存在 / 不存在的邮箱都返回 200（防账号枚举），所以出错就是真的失败——
 * 限流（429：每分钟 5 次 / 每小时 30 次）、邮箱为空、网络错误等，按错误显示，不进入下一步
 */
const sendCodeErrorMessage = (error: HttpRequestError) =>
  error.status === 429 ? t('forgot-password.rate-limited') : bizErrorMessage(error);

const sendCode = async () => {
  if(loading.value)return;
  if (!email.value.trim()) {
    showToast(t('forgot-password.email-required'), 'error');
    return;
  }
  loading.value = true;
  // 成功时无论邮箱是否存在都只显示通用文案，避免账号枚举
  await httpRequest('/api/system/user/forgot-password', {
    method: 'POST',
    body: { email: email.value.trim() },
    onSuccess: () => {
      showToast(t('forgot-password.code-sent-generic'), 'success');
      step.value = 2;
      startCountdown();
    },
    onError: (error) => {
      showToast(sendCodeErrorMessage(error), 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

const resendCode = async () => {
  if(loading.value)return;
  if (countdown.value > 0) return;
  loading.value = true;
  await httpRequest('/api/system/user/forgot-password', {
    method: 'POST',
    body: { email: email.value.trim() },
    onSuccess: () => {
      showToast(t('forgot-password.code-sent-generic'), 'success');
      startCountdown();
    },
    onError: (error) => {
      showToast(sendCodeErrorMessage(error), 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

const resetPassword = async () => {
  if(loading.value)return;
  if (!code.value.trim()) {
    showToast(t('forgot-password.code-required'), 'error');
    return;
  }
  if (!newPassword.value) {
    showToast(t('forgot-password.password-required'), 'error');
    return;
  }
  // 与修改密码页、后端（10015）同一套密码规则
  if (!isValidPassword(newPassword.value)) {
    showToast(t('common.validation.password-policy', passwordPolicyParams()), 'error');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    showToast(t('forgot-password.password-mismatch'), 'error');
    return;
  }
  loading.value = true;
  await httpRequest('/api/system/user/reset-password', {
    method: 'POST',
    body: {
      email: email.value.trim(),
      code: code.value.trim(),
      new_password: newPassword.value,
    },
    onSuccess: () => {
      showToast(t('forgot-password.reset-success'), 'success');
      router.push('/auth/login');
    },
    onError: (error) => {
      // 验证码错误 / 过期、密码不合规（10015）、限流等：有三语文案的业务码用文案，否则后端原文
      showToast(error.status === 429 ? t('forgot-password.rate-limited') : bizErrorMessage(error), 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

onMounted(() => {
  document.body.classList.add('bg-white');
});
onUnmounted(() => {
  document.body.classList.remove('bg-white');
  if (timer) clearInterval(timer);
});
</script><template><AuthFrame><form @submit.prevent="step===1?sendCode():resetPassword()"><h2>{{t('forgot-password.title')}}</h2><p>{{t('forgot-password.subtitle')}}</p><WField v-if="step===1" :label="t('common.fields.email')"><WInput v-model="email" type="email" autocomplete="email" required :disabled="loading" :placeholder="t('forgot-password.email-placeholder')"/></WField><template v-else><WField :label="t('forgot-password.verification-code')" :hint="t('forgot-password.code-sent-to',{email})"><div class="code"><WInput v-model="code" maxlength="6" autocomplete="one-time-code" required :disabled="loading" :placeholder="t('forgot-password.code-placeholder')"/><WButton :disabled="loading||countdown>0" @click="resendCode">{{countdown>0?countdown+'s':t('forgot-password.resend')}}</WButton></div></WField><WField :label="t('forgot-password.new-password')"><WInput v-model="newPassword" type="password" autocomplete="new-password" required :disabled="loading"/></WField><WField :label="t('forgot-password.confirm-password')"><WInput v-model="confirmPassword" type="password" autocomplete="new-password" required :disabled="loading"/></WField></template><WButton type="submit" variant="primary" block :loading="loading">{{t(step===1?'forgot-password.send-code':'forgot-password.reset-btn')}}</WButton><NuxtLink class="back" to="/auth/login">{{t('forgot-password.back-to-login')}}</NuxtLink></form></AuthFrame></template><style scoped>.code{display:flex;gap:8px;align-items:center}.code>.w-input{flex:1;min-width:0}.back{text-align:center}</style>