<script setup lang="ts">
/**
 * 账户菜单（设计稿 TopbarSpec「账户菜单」）：头像、名字和公司；菜单里有修改密码、全屏、显示密度、退出登录。
 * 窄屏（< 768）时顶栏没有搜索框，「搜索」收进这里（打开同一个搜索面板）。
 * PDA 下载与版本信息读取平台公共设置；未配置下载地址时不显示。
 */
const props = withDefaults(defineProps<{
  variant?: 'wms' | 'admin'
}>(), {
  variant: 'wms',
})

const { t, te, locale, locales, setLocale } = useI18n()
const languageCookie = useCookie<string | null>('i18n_lang', { maxAge: 2592000 })
const languages = computed(() => locales.value.map(item => typeof item === 'string' ? { code:item, name:item } : item))
const chooseLanguage = async (code: string) => { await setLocale(code as 'zh'|'en'|'ja'); languageCookie.value = code }
const router = useRouter()
const authStore = useAuthStore()
const staffStore = useStaffStore()
const warehouseStore = useWarehouseStore()
const { density, setDensity } = useUiPrefs()
const search = useGlobalSearch()
const { data: presentation } = usePresentation()
const pda = computed(() => presentation.value.pda || {})
const pdaSize = computed(() => Number(pda.value.sizeBytes) > 0 ? `${(Number(pda.value.sizeBytes) / 1024 / 1024).toFixed(1)} MiB` : '')

const userName = computed(() => authStore.userInfo?.user_name || '')
const initial = computed(() => (userName.value.trim().charAt(0) || '?').toUpperCase())
const avatar = computed(() => authStore.userInfo?.avatar || '')
const company = computed(() =>
  props.variant === 'admin' ? t('shell.account.platform') : (staffStore.staffInfo?.company?.name || ''))
/** 菜单头部第二行：公司 · 角色（内置角色显示译名） */
const subtitle = computed(() => {
  if (props.variant === 'admin') return authStore.userInfo?.email || t('shell.account.platform')
  const role = staffStore.staffInfo?.roles?.[0]
  const roleName = role ? (te(`roles.${role}`) ? t(`roles.${role}`) : role) : ''
  return [company.value, roleName].filter(Boolean).join(' · ')
})

// ---- 全屏 ----
const isFullScreen = ref(false)
const onFullscreenChange = () => { isFullScreen.value = !!document.fullscreenElement }
const toggleFullScreen = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // 浏览器不允许（如在 iframe 里）时忽略
  }
}
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

const toggleDensity = () => setDensity(density.value === 'compact' ? 'comfortable' : 'compact')

const loggingOut = ref(false)
const logout = async () => {
  if (loggingOut.value) return
  loggingOut.value = true
  if (!await confirmUnsavedFormsForReload()) { loggingOut.value = false; return }
  authStore.logUserOut()
  staffStore.clearStaffInfo()
  warehouseStore.clearWarehouse()
  await router.push('/')
}
</script>

<template>
  <WDropdown :label="t('shell.account.menu')" placement="bottom-end" width="272px">
    <template #trigger="{ attrs }">
      <button v-bind="attrs" type="button" class="w-account-btn" :aria-label="t('shell.account.label', { name: userName })">
        <span class="w-avatar" aria-hidden="true">
          <img v-if="avatar" :src="avatar" alt="">
          <template v-else>{{ initial }}</template>
        </span>
        <span class="w-account-btn__text">
          <span class="w-account-btn__name">{{ userName }}</span>
          <span v-if="company" class="w-account-btn__company">{{ company }}</span>
        </span>
        <WIcon name="chevron-down" :size="14" :stroke-width="2" class="w-account-btn__chevron" />
      </button>
    </template>

    <div class="w-account-head">
      <span class="w-avatar w-avatar--lg" aria-hidden="true">
        <img v-if="avatar" :src="avatar" alt="">
        <template v-else>{{ initial }}</template>
      </span>
      <span class="w-account-head__text">
        <span class="w-account-head__name">{{ userName }}</span>
        <span v-if="subtitle" class="w-account-head__sub">{{ subtitle }}</span>
      </span>
    </div>
    <div class="w-menu-divider" role="separator" />
    <button v-if="variant === 'wms'" type="button" class="w-menu-item w-account-search" role="menuitem" @click="search.open()">
      <WIcon name="search" :size="17" />
      <span class="w-menu-item__label">{{ t('search.dialog') }}</span>
    </button>
    <NuxtLink to="/authentication/reset-password" class="w-menu-item" role="menuitem">
      <WIcon name="lock" :size="17" />
      <span class="w-menu-item__label">{{ t('shell.account.change-password') }}</span>
    </NuxtLink>
    <button type="button" class="w-menu-item" role="menuitem" @click="toggleFullScreen">
      <WIcon :name="isFullScreen ? 'fullscreen-exit' : 'fullscreen'" :size="17" />
      <span class="w-menu-item__label">{{ isFullScreen ? t('shell.account.exit-fullscreen') : t('shell.account.fullscreen') }}</span>
    </button>
    <button type="button" class="w-menu-item" role="menuitem" data-keep-open @click="toggleDensity">
      <WIcon name="rows" :size="17" />
      <span class="w-menu-item__label">{{ t('shell.account.density') }}</span>
      <span class="w-menu-item__sub">{{ density === 'compact' ? t('shell.account.density-compact') : t('shell.account.density-comfortable') }}</span>
    </button>
    <div class="w-account-languages">
      <div class="w-menu-divider" role="separator" />
      <button v-for="language in languages" :key="language.code" type="button" class="w-menu-item" role="menuitemradio" :aria-checked="locale===language.code" :lang="language.code" @click="chooseLanguage(language.code)">
        <span class="w-menu-item__label">{{language.name}}</span><WIcon v-if="locale===language.code" name="check" :size="14"/>
      </button>
    </div>
    <template v-if="pda.header && pda.url">
      <div class="w-menu-divider" role="separator" />
      <div class="w-pda-meta">
        <strong>{{ t('presentation.pda') }}</strong>
        <span>{{ [pda.version, pda.releaseDate, pdaSize].filter(Boolean).join(' · ') }}</span>
        <small v-if="pda.sha256">SHA-256 <code>{{ pda.sha256 }}</code></small>
      </div>
      <a :href="pda.url" target="_blank" rel="noopener noreferrer" class="w-menu-item" role="menuitem">
        <span class="w-menu-item__label">{{ t('presentation.download') }}</span>
      </a>
    </template>
    <div class="w-menu-divider" role="separator" />
    <button type="button" class="w-menu-item is-danger" role="menuitem" @click="logout">
      <WIcon name="logout" :size="17" />
      <span class="w-menu-item__label">{{ t('shell.account.logout') }}</span>
    </button>
  </WDropdown>
</template>

<style scoped>
.w-pda-meta{display:flex;flex-direction:column;gap:4px;padding:10px 12px;font-size:12px;line-height:18px;color:var(--w-text-3);overflow-wrap:anywhere}.w-pda-meta strong{font-weight:500;color:var(--w-text-1)}.w-pda-meta code{display:block;font-size:12px;line-height:18px;color:inherit;user-select:all}
.w-account-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 6px 0 2px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.w-account-btn:hover { background: var(--w-surface-2); }
.w-account-btn:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-account-btn__text { display: flex; flex-direction: column; min-width: 0; max-width: 180px; }
.w-account-btn__name,
.w-account-btn__company {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-account-btn__name {
  font-size: var(--w-fs-13);
  line-height: 18px;
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-account-btn__company {
  font-size: var(--w-fs-12);
  line-height: 16px;
  color: var(--w-text-3);
}
.w-account-btn__chevron { color: var(--w-text-3); }

.w-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border-radius: var(--w-radius-pill);
  background: var(--w-pri);
  color: var(--w-on-pri);
  font-size: var(--w-fs-13);
  font-weight: var(--w-fw-semibold);
}
.w-avatar img { width: 100%; height: 100%; object-fit: cover; }
.w-avatar--lg { width: 40px; height: 40px; font-size: var(--w-fs-14); }

.w-account-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
}
.w-account-head__text { display: flex; flex-direction: column; min-width: 0; }
.w-account-head__name {
  font-size: var(--w-fs-14);
  line-height: 20px;
  font-weight: var(--w-fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
}
.w-account-head__sub {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
/* 「搜索」只在窄屏出现（宽屏用顶栏的搜索框） */
.w-account-search,.w-account-languages { display: none; }
@media (max-width: 767.98px) {
  .w-account-btn__text, .w-account-btn__chevron { display: none; }
  .w-account-search { display: flex; }
  .w-account-languages { display:block; }
}
</style>
