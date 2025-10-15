<script lang="ts" setup>
import PasswordInput from '@/components/UI/passwordInput.vue';
// 工具库
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

definePageMeta({
    middleware: ["auth"],
})
// 获取国际化方法
const { t } = useI18n();

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

const errors = ref({
  current_password: null,
  new_password: null,
  confirm_password: null
})

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,16}$/

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
  } else if (!PASSWORD_REGEX.test(formState.newPassword)) {
    errors.value.new_password = t('common.validation.password-complexity', { min: 8 });
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

const handleSubmit = async () => {
  // 前端验证
  if (!validatePasswords()) {
    return;
  }

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
        // 重定向到登录页面
        setTimeout(() => {
          navigateTo('/auth/login');
        }, 1000);
      },
      onError: (error) => {
        showToast(t('action-results.failed'), 'error')
      }
    });
  } catch (error) {
    // 处理网络级错误
    showToast(t('action-results.failed'), 'error')
    console.error('API请求失败:', error);
  }
}

</script>

<template>
  <PageHeader :propData="dataToPass" />
  <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body add-products p-0">
          <div class="p-4">
            <div class="row gx-5">
              <div class="col-xxl-6 col-xl-12">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3 mb-3">
                      <div class="col-xl-12">
                        <label for="reset-password" class="form-label text-default">{{ t('profile.current-password') }}</label>
                        <div class="input-group">
                            <PasswordInput initialValue="" name="currentpassword" id="currentpassword" v-model="formState.currentPassword"
                                :placeholder="t('profile.current-password')" />
                        </div>
                        <div v-if="errors.current_password" class="invalid-feedback d-block">{{ errors.current_password }}</div>
                      </div>
                      <div class="col-xl-12">
                        <label for="reset-newpassword" class="form-label text-default">{{ t('profile.new-password') }}</label>
                        <div class="input-group">
                            <PasswordInput initialValue="" name="newpassword" id="newpassword" v-model="formState.newPassword"
                                :placeholder="t('profile.new-password') " />
                        </div>
                        <div v-if="errors.new_password" class="invalid-feedback d-block">{{ errors.new_password }}</div>
                      </div>
                      <div class="col-xl-12 mb-2">
                        <label for="reset-confirmpassword" class="form-label text-default">{{ t('profile.confirm-password') }}</label>
                        <div class="input-group">
                            <PasswordInput initialValue="" name="confirmpassword" id="confirmpassword"  v-model="formState.confirmPassword" 
                                :placeholder="t('profile.confirm-password')" />
                        </div>
                        <div v-if="errors.confirm_password" class="invalid-feedback d-block">{{ errors.confirm_password }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click.prevent="handleSubmit">{{ t('button.submit') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>