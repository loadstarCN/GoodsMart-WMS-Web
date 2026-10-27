<script lang="ts" setup>

// 工具库



definePageMeta({
  // 平台管理员（type=user）使用 admin 布局，员工使用默认布局
  middleware: [
    () => {
      const authStore = useAuthStore();
      if (authStore.userInfo?.type === 'user') {
        setPageLayout('admin');
      }
    },
  ],
})
// 获取国际化方法
const { t } = useI18n();
const { bizErrorMessage } = useBizError();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.reset-password'),
  list: [t('nav.home'), t('nav.reset-password')]
}))

const formState = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const errors = ref<Record<string, any>>({
  current_password: null,
  new_password: null,
  confirm_password: null
})

// 密码规则见 utils/passwordPolicy.ts（与后端 10015 一致，找回密码页共用）

// 校验规则
const validatePasswords = () => {
  let isValid = true;
  
  // 重置错误信息
  errors.value = {
    current_password: null,
    new_password: null,
    confirm_password: null
  }
  
  // 当前密码验证
  if (!formState.currentPassword) {
    errors.value.current_password = t('common.validation.current-password-required');
    isValid = false;
  }
  
  // 新密码验证
  if (!formState.newPassword) {
    errors.value.new_password = t('common.validation.new-password-required');
    isValid = false;
  } else if (!isValidPassword(formState.newPassword)) {
    errors.value.new_password = t('common.validation.password-policy', passwordPolicyParams());
    isValid = false;
  }
  
  // 确认密码验证
  if (!formState.confirmPassword) {
    errors.value.confirm_password = t('common.validation.confirm-password-required');
    isValid = false;
  } else if (formState.newPassword !== formState.confirmPassword) {
    errors.value.confirm_password = t('common.validation.password-mismatch');
    isValid = false;
  }
  
  // 新旧密码一致性验证
  if (formState.newPassword && formState.newPassword === formState.currentPassword) {
    errors.value.new_password = t('common.validation.password-same-as-old');
    isValid = false;
  }
  
  return isValid;
}

const saving = ref(false)
const handleSubmit = async () => {
  if (saving.value) return
  // 前端验证
  if (!validatePasswords()) {
    return;
  }

  saving.value = true
  try {
    await httpRequest('/api/system/user/change-password', {
      method: 'PUT',
      body: {
        old_password: formState.currentPassword,
        new_password: formState.newPassword
      },
      onSuccess: () => {
        showToast(t('action-results.success'), 'success')
        // 重置表单状态
        formState.currentPassword = '';
        formState.newPassword = '';
        formState.confirmPassword = '';
        // 改密后用新密码重新登录：先登出（清本地令牌并通知后端吊销），否则带着旧 token 去登录页会被
        // auth.global 中间件转回首页
        setTimeout(async () => {
          await useAuthStore().logUserOut();
          await navigateTo('/auth/login');
        }, 1000);
      },
      onError: (error) => {
        // 展示后端返回的具体原因（有三语文案的业务码用文案，如 10013 新密码为空；否则后端原文，如旧密码错误）
        showToast(bizErrorMessage(error), 'error')
      }
    });
  } catch (error) {
    // 处理网络级错误
    showToast(t('action-results.failed'), 'error')
    console.error('API请求失败:', error);
  } finally {
    saving.value = false
  }
}

useHead({title:()=>t('nav.reset-password')})
</script>

<template>
  <div class="w-password-page w-scope">
    <header><h1>{{t('nav.reset-password')}}</h1></header>
    <WCard flush><form @submit.prevent="handleSubmit"><WFormSection :title="t('nav.reset-password')"><div class="w-password-fields">
      <WField :label="t('profile.current-password')" required :error="errors.current_password"><WInput v-model="formState.currentPassword" type="password" autocomplete="current-password" :disabled="saving" /></WField>
      <WField :label="t('profile.new-password')" required :error="errors.new_password" :hint="t('common.validation.password-policy',passwordPolicyParams())"><WInput v-model="formState.newPassword" type="password" autocomplete="new-password" :disabled="saving" /></WField>
      <WField :label="t('profile.confirm-password')" required :error="errors.confirm_password"><WInput v-model="formState.confirmPassword" type="password" autocomplete="new-password" :disabled="saving" /></WField>
    </div></WFormSection><footer><WButton type="submit" variant="primary" :loading="saving">{{t('button.submit')}}</WButton></footer></form></WCard>
  </div>
</template>
<style scoped>
.w-password-page{display:flex;flex-direction:column;gap:16px}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.w-password-fields{display:flex;flex-direction:column;gap:16px;max-width:440px}footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}
</style>
