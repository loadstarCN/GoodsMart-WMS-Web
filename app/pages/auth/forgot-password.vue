<script lang="ts" setup>
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
</script>

<template>
  <div class="row authentication mx-0">

    <div class="col-xxl-7 col-xl-7 col-lg-7 position-relative">
      <!-- 语言切换 - 右上角 -->
      <div class="position-absolute top-0 end-0 p-3" style="z-index: 10;">
        <div class="dropdown">
          <a href="javascript:void(0);" class="btn btn-sm btn-light dropdown-toggle" data-bs-toggle="dropdown">
            <img :src="`/images/flags/${currentLang}_flag.jpg`" :alt="currentLang" class="rounded-circle me-1" style="width:16px;height:16px;">{{ languages[currentLang as keyof typeof languages] }}
          </a>
          <ul class="dropdown-menu dropdown-menu-end">
            <li v-for="lang in ['en', 'zh', 'ja']" :key="lang">
              <a @click="setLocale(lang)" class="dropdown-item" href="javascript:void(0);">
                <img :src="`/images/flags/${lang}_flag.jpg`" class="rounded-circle me-2" style="width:16px;height:16px;">{{ languages[lang] }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="row justify-content-center align-items-center h-100">
        <div class="col-xxl-6 col-xl-7 col-lg-7 col-md-7 col-sm-8 col-12">
          <div class="p-5">
            <div class="mb-3">
              <NuxtLink to='/auth/login'>
                <img src="/images/brand-logos/desktop-logo.svg" alt="" class="authentication-brand desktop-logo">
                <img src="/images/brand-logos/desktop-dark.svg" alt="" class="authentication-brand desktop-dark">
              </NuxtLink>
            </div>

            <p class="h5 fw-semibold mb-2">{{ t('forgot-password.title') }}</p>
            <p class="mb-3 text-muted op-7 fw-normal">{{ t('forgot-password.subtitle') }}</p>

            <!-- Step 1: Enter email -->
            <form v-if="step === 1" @submit.prevent="sendCode">
              <div class="mb-3">
                <label class="form-label text-default">{{ t('common.fields.email') }}</label>
                <input v-model="email" type="email" class="form-control form-control-lg" :placeholder="t('forgot-password.email-placeholder')" required>
              </div>
              <div class="d-grid mb-3">
                <button type="submit" class="btn btn-lg btn-primary" :disabled="loading">
                  <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
                  {{ t('forgot-password.send-code') }}
                </button>
              </div>
              <div class="text-center">
                <NuxtLink to="/auth/login" class="text-primary">{{ t('forgot-password.back-to-login') }}</NuxtLink>
              </div>
            </form>

            <!-- Step 2: Enter code + new password -->
            <form v-else @submit.prevent="resetPassword">
              <div class="mb-3">
                <label class="form-label text-default">{{ t('forgot-password.verification-code') }}</label>
                <div class="input-group">
                  <input v-model="code" type="text" class="form-control form-control-lg" maxlength="6" :placeholder="t('forgot-password.code-placeholder')" required>
                  <button type="button" class="btn btn-outline-primary" :disabled="countdown > 0 || loading" @click="resendCode">
                    {{ countdown > 0 ? `${countdown}s` : t('forgot-password.resend') }}
                  </button>
                </div>
                <small class="text-muted">{{ t('forgot-password.code-sent-to', { email: email }) }}</small>
              </div>
              <div class="mb-3">
                <label class="form-label text-default">{{ t('forgot-password.new-password') }}</label>
                <passwordInput v-model="newPassword" id="new-password" autocomplete="new-password" :placeholder="t('forgot-password.new-password-placeholder')" required />
                <small class="text-muted">{{ t('common.validation.password-policy', passwordPolicyParams()) }}</small>
              </div>
              <div class="mb-3">
                <label class="form-label text-default">{{ t('forgot-password.confirm-password') }}</label>
                <passwordInput v-model="confirmPassword" id="confirm-password" autocomplete="new-password" :placeholder="t('forgot-password.confirm-password-placeholder')" required />
              </div>
              <div class="d-grid mb-3">
                <button type="submit" class="btn btn-lg btn-primary" :disabled="loading">
                  <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
                  {{ t('forgot-password.reset-btn') }}
                </button>
              </div>
              <div class="text-center">
                <NuxtLink to="/auth/login" class="text-primary">{{ t('forgot-password.back-to-login') }}</NuxtLink>
              </div>
            </form>

          </div>
        </div>
      </div>
    </div>
    <div class="col-xxl-5 col-xl-5 col-lg-5 d-lg-block d-none px-0">
      <div class="authentication-cover">
        <div class="aunthentication-cover-content rounded">
          <div class="text-fixed-white text-center p-5 d-flex align-items-center justify-content-center">
            <div>
              <div class="mb-5">
                <img src="/images/media/station.svg" class="authentication-image" alt="">
              </div>
              <h6 class="fw-semibold text-fixed-white">{{ t('forgot-password.cover-title') }}</h6>
              <p class="fw-normal fs-14 op-7">{{ t('forgot-password.cover-text') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.dropdown-toggle::after) {
  font-family: inherit;
  content: "";
  border-top: 0.3em solid;
  border-right: 0.3em solid transparent;
  border-bottom: 0;
  border-left: 0.3em solid transparent;
}
</style>
