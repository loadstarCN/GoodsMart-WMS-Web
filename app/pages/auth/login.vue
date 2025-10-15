<script lang="ts" setup>
/********************
 * 模块导入
 ​********************/

// 组件库
import CryptoJS from 'crypto-js';
import { Swiper, SwiperSlide } from "swiper/vue";
import { Navigation, Pagination, Keyboard } from 'swiper/modules';
import type { PaginationOptions } from 'swiper/types';
import "swiper/swiper-bundle.css";

// 获取国际化方法
const { t } = useI18n();

/********************
 * Swiper配置模块
 ​********************/
const modules = ref([Navigation, Pagination, Keyboard]);
const pagination = ref<PaginationOptions>({
  clickable: true,
  type: 'bullets',
  dynamicBullets: true
});

// 从环境变量获取加密密钥（需在.env.local配置）
const runtimeConfig = useRuntimeConfig();
const ENCRYPTION_KEY = runtimeConfig.public.clientEncryptionKey || 'fallback-key-32bytes';

/********************
 * 记住密码模块
 ​********************/
const rememberMe = ref(false);
const isStorageSupported = ref(true); // 本地存储可用性状态

// 存储检测函数
const checkStorage = () => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

// 加密函数
const encrypt = (text: string) => {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

// 解密函数
const decrypt = (ciphertext: string) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error(t('login.errors.decryption-failed'), e);
    return ''
  }
}

// 初始化凭证
const initCredentials = () => {
  if (!isStorageSupported.value) return
  
  const storedData = localStorage.getItem('userCredentials')
  if (storedData) {
    try {
      const decrypted = decrypt(storedData);
      const { account, password } = JSON.parse(decrypted);
      user.account = account;
      user.password = password;
      rememberMe.value = true;
    } catch (e) {
      console.error(t('login.errors.credential-parse-failed'), e);
      clearCredentials();
    }
  }
}

// 清除凭证
const clearCredentials = () => {
  localStorage.removeItem('userCredentials');
  rememberMe.value = false;
}

/********************
 * 认证模块改造
 ​********************/
 interface LoginForm {
  account: string;
  password: string;
}

const router = useRouter();
const authStore = useAuthStore();
const user = reactive<LoginForm>({
  account: '',
  password: ''
});

const login = async () => {
  try {
    if (rememberMe.value && !isStorageSupported.value) {
      showToast(t('login.errors.browser-not-support'), 'warning');
      return
    }

    const data = await authStore.authenticateUser(user)
    if (data?.authenticated) {
      // getCurrentStaffInfo();
      // 处理记住密码逻辑
      handleRememberPassword();
      await router.push('/');
      showToast('LoggedIn', 'success');
    } else {
      clearCredentials()
      showToast(t('login.errors.invalid-credentials'), 'error');
    }
  } catch (error) {
    clearCredentials();
    showToast(t('login.errors.login-failed'), 'error');
  }
};

// 记住密码处理
const handleRememberPassword = () => {
  if (!isStorageSupported.value) return

  if (rememberMe.value) {
    const encrypted = encrypt(
      JSON.stringify({
        account: user.account,
        password: user.password,
        timestamp: Date.now()
      })
    );
    localStorage.setItem('userCredentials', encrypted);
  } else {
    clearCredentials();
  }
}


/********************
 * 生命周期管理
 ​********************/
 onMounted(() => {
  document.body.classList.add('bg-white')
  isStorageSupported.value = checkStorage()
  initCredentials()
})
onUnmounted(() => document.body.classList.remove('bg-white'));

/********************
 * 页面元数据
 ​********************/
definePageMeta({
  layout: 'custom',
  middleware: ["auth"]
});
</script>



<template>
  <div class="row authentication mx-0">

      <div class="col-xxl-7 col-xl-7 col-lg-7">
          <div class="row justify-content-center align-items-center h-100">
              <div class="col-xxl-6 col-xl-7 col-lg-7 col-md-7 col-sm-8 col-12">
                  <div class="p-5">
                      <div class="mb-3">
                          <NuxtLink to='/'>
                              <img src="/images/brand-logos/desktop-logo.svg" alt=""
                                  class="authentication-brand desktop-logo">
                              <img src="/images/brand-logos/desktop-dark.svg" alt=""
                                  class="authentication-brand desktop-dark">
                          </NuxtLink>
                      </div>
                      <p class="h5 fw-semibold mb-2">{{ $t('login.title') }}</p>
                      <p class="mb-3 text-muted op-7 fw-normal">{{ $t('login.welcome-message') }}</p>
                      
                      <div class="row gy-3">
                        <form @submit.prevent="login" class="col-12">
                          <div class="col-xl-12">
                            <label for="signin-username" class="form-label text-default">{{ $t('common.account') }}</label>
                            <input v-model="user.account" name="uname" type="text" class="form-control form-control-lg"
                              id="signin-username" :placeholder="$t('common.account')" :required="true">
                          </div>
                          <div class="col-xl-12 mb-2">
                            <label for="signin-password" class="form-label text-default d-block">{{ $t('common.password') }}<NuxtLink
                                to="/authentication/reset-password/basic" class="float-end text-danger">{{ $t('login.forgot-password') }}</NuxtLink></label>
                            <div class="input-group">
                              <passwordInput v-model="user.password" name="psw" id="password" :placeholder="$t('common.password')"  required />
                            </div>
                            <div class="mt-2" v-if="isStorageSupported">
                              <div class="form-check">
                                <input 
                                  class="form-check-input" 
                                  type="checkbox" 
                                  v-model="rememberMe"
                                  id="rememberPasswordCheck"
                                >
                                <label 
                                  class="form-check-label text-muted fw-normal" 
                                  for="rememberPasswordCheck"
                                >
                                  {{ $t('login.remember-me') }}
                                </label>
                              </div>
                            </div>
                          </div>
                          <div class="col-xl-12 d-grid mt-2">
                            <button type="submit" class="btn btn-lg btn-primary">{{ $t('login.sign-in') }}</button>
                          </div>
                        </form>
                      </div>
                  </div>
              </div>
          </div>
      </div>
      <div class="col-xxl-5 col-xl-5 col-lg-5 d-lg-block d-none px-0">
          <div class="authentication-cover">
              <div class="aunthentication-cover-content rounded">
                  <swiper :navigation="true" :pagination="pagination" :keyboard="{ enabled: true, }" :modules="modules"
                      class="swiper-wrapper">
                      <swiper-slide>
                          <div class="text-fixed-white text-center p-5 d-flex align-items-center justify-content-center">
                              <div>
                                  <div class="mb-5">
                                      <img src="/images/media/magician.svg" class="authentication-image" alt="">
                                  </div>
                                  <h6 class="fw-semibold text-fixed-white">{{ $t("login.marketing.dare-to-dream-title") }}</h6>
                                  <p class="fw-normal fs-14 op-7">{{ $t("login.marketing.dare-to-dream") }}</p>
                              </div>
                          </div>
                      </swiper-slide>
                      <swiper-slide>
                          <div class="text-fixed-white text-center p-5 d-flex align-items-center justify-content-center">
                              <div>
                                  <div class="mb-5">
                                      <img src="/images/media/station.svg" class="authentication-image" alt="">
                                  </div>
                                  <h6 class="fw-semibold text-fixed-white">{{ $t("login.marketing.path-to-success-title") }}</h6>
                                  <p class="fw-normal fs-14 op-7">{{ $t("login.marketing.path-to-success") }}</p>
                              </div>
                          </div>
                      </swiper-slide>
                      <swiper-slide>
                          <div class="text-fixed-white text-center p-5 d-flex align-items-center justify-content-center">
                              <div>
                                  <div class="mb-5">
                                      <img src="/images/media/people.svg" class="authentication-image" alt="">
                                  </div>
                                  <h6 class="fw-semibold text-fixed-white">{{ $t("login.marketing.fearless-journey-title") }}</h6>
                                  <p class="fw-normal fs-14 op-7">{{ $t("login.marketing.fearless-journey") }}</p>
                              </div>
                          </div>
                      </swiper-slide>
                  </swiper>
              </div>
          </div>
      </div>

  </div>
</template>

<style scoped></style>
