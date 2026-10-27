<script lang="ts" setup>
import AuthFrame from "~/components/auth/AuthFrame.vue"
/********************
 * 模块导入
 ​********************/

// 组件库
import CryptoJS from 'crypto-js';


// 国际化与语言切换
import { languages } from '~/data/headerData.js'
const { t, setLocale: setI18nLocale } = useI18n();
const cookieLang = useCookie('i18n_lang', { maxAge: 2592000 });
const currentLang = ref(cookieLang.value || 'en');

const setLocale = async (lang: string) => {
  await setI18nLocale(lang as 'en' | 'zh' | 'ja');
  cookieLang.value = lang;
  currentLang.value = lang;
};

/********************
 * Swiper配置模块
 ​********************/


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

// 初始化凭证（仅恢复账号，不存储密码）
const initCredentials = () => {
  if (!isStorageSupported.value) return

  const storedData = localStorage.getItem('userCredentials')
  if (storedData) {
    try {
      const decrypted = decrypt(storedData);
      const { account } = JSON.parse(decrypted);
      user.account = account;
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
const staffStore = useStaffStore();
const warehouseStore = useWarehouseStore();
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
      // 无条件重新拉取员工信息，并用新的可访问仓库列表校验当前仓库（不在列表里就清掉），
      // 免得沿用上一个登录者缓存的公司和仓库；非员工（平台管理员）清掉员工缓存
      await nextTick(); // 等新 token 写入 cookie
      if (authStore.userInfo?.type === 'staff') {
        await staffStore.refreshStaffInfo();
      } else {
        staffStore.clearStaffInfo();
        warehouseStore.reset();
      }
      // 处理记住密码逻辑
      handleRememberPassword();
      await router.push('/');
      showToast(t('login.logged-in'), 'success');
    } else {
      clearCredentials()
      // 优先展示后端返回的失败原因（如账号被停用、租户过期）
      showToast(data?.message || t('login.errors.invalid-credentials'), 'error');
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
    // 仅存储账号，不存储密码（加密密钥为客户端可见的公钥，存密码存在安全风险）
    const encrypted = encrypt(
      JSON.stringify({
        account: user.account,
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
});

const showPassword=ref(false)
useHead({title:()=>t('login.sign-in')})
</script><template><AuthFrame><form @submit.prevent="login"><h2>{{t('login.sign-in')}}</h2><WField :label="t('common.account')"><WInput v-model="user.account" autocomplete="username" required :disabled="authStore.loading"/></WField><div class="password"><NuxtLink class="recover" to="/auth/forgot-password">{{t('login.forgot-password')}}</NuxtLink><WField :label="t('common.password')"><WInput v-model="user.password" :type="showPassword?'text':'password'" autocomplete="current-password" required :disabled="authStore.loading"><template #suffix><button type="button" class="show-password" :aria-label="t(showPassword?'auth-design.hide-password':'auth-design.show-password')" @click="showPassword=!showPassword"><WIcon :name="showPassword?'eye-off':'eye'" :size="18"/></button></template></WInput></WField></div><WCheckbox v-if="isStorageSupported" v-model="rememberMe">{{t('login.remember-me')}}</WCheckbox><WButton type="submit" variant="primary" block :loading="authStore.loading">{{t('login.sign-in')}}</WButton></form></AuthFrame></template><style scoped>.password{position:relative}.recover{position:absolute;right:0;top:0;z-index:1}.show-password{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:var(--w-text-3)}</style>