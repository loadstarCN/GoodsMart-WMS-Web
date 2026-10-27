<script setup lang="ts">
/**
 * 新外壳：左侧侧栏 + 右侧（顶栏 + 内容区）。layouts/default（员工）和 layouts/admin（平台管理）都用它。
 * - 宽屏：侧栏固定在左边，可收起成图标栏（记在本机）；窄屏（< 992）：侧栏变抽屉，顶栏按钮打开
 * - 内容区 .w-page：旧页面直接放进来，样式靠 assets/styles/legacy-bridge.css 向新规范靠拢
 * - <html> 上的 lang、data-density（显示密度）、data-theme（深色模式，开关暂未开放）在这里设置
 * - 打开页面时刷新员工信息、校验当前仓库（原来在 common/Header 里，逻辑不变）
 * - 内容区底部的版权行、右下角的回到顶部：沿用原来外壳的 common/Footer、common/BackToTop
 */
import { ADMIN_NAV, SHELL_FEATURES, WMS_NAV } from '~/data/navigation'

const props = withDefaults(defineProps<{
  variant?: 'wms' | 'admin'
}>(), {
  variant: 'wms',
})

const { t, localeProperties } = useI18n()
const year = new Date().getFullYear()
const route = useRoute()
const authStore = useAuthStore()
const staffStore = useStaffStore()
const warehouseStore = useWarehouseStore()
const { sidebarCollapsed, setSidebarCollapsed, density, theme, reloadDensity } = useUiPrefs()
const warehouseCookie = useCookie<string | number | null>('warehouse_id')

const sidebarId = 'w-sidebar'
const groups = computed(() => (props.variant === 'admin' ? ADMIN_NAV : WMS_NAV))
/** 搜索结果页：顶栏搜索框显示当前关键词 */
const searchQuery = computed(() =>
  (route.path.replace(/\/+$/, '') === '/search' ? parseSearchPageQuery(route.query).q : null))

// ---- 宽屏收起 / 窄屏抽屉 ----
const mobile = ref(false)
const drawerOpen = ref(false)
let mql: MediaQueryList | null = null
const onMediaChange = () => {
  mobile.value = !!mql?.matches
  drawerOpen.value = false
}
const collapsed = computed(() => !mobile.value && sidebarCollapsed.value)
const sidebarExpanded = computed(() => (mobile.value ? drawerOpen.value : !sidebarCollapsed.value))
const toggleSidebar = () => {
  if (mobile.value) drawerOpen.value = !drawerOpen.value
  else setSidebarCollapsed(!sidebarCollapsed.value)
}
watch(() => route.fullPath, () => { drawerOpen.value = false })
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && drawerOpen.value) drawerOpen.value = false
}

useHead({
  htmlAttrs: {
    lang: computed(() => String(localeProperties.value?.iso || '') || undefined),
    'data-density': density,
    'data-theme': computed(() => (SHELL_FEATURES.themeToggle ? theme.value : 'light')),
  },
})

onMounted(async () => {
  mql = window.matchMedia('(max-width: 991.98px)')
  onMediaChange()
  mql.addEventListener('change', onMediaChange)
  document.addEventListener('keydown', onKeydown)
  reloadDensity()

  // 员工信息：每次打开页面都从后端刷新一次（登录时刚刷新过的不再重复），公司、可访问仓库可能已被改过
  if (authStore.authenticated && authStore.userInfo?.type === 'staff') {
    if (!staffStore.staffInfo || !staffStore.refreshed) {
      await staffStore.getCurrentStaffInfo()
    }
  }
  // 用最新的仓库列表校验当前仓库（cookie）：不在列表里（已停用 / 无权访问）就清掉；
  // 非公司管理员没有当前仓库时自动选第一个可访问的仓库。自动选了 / 换了仓库时，本页已发出的请求
  // 没带或带错了 X-WAREHOUSE-ID，重新加载一次（重新加载后 cookie 已是有效仓库，不会循环）
  const before = warehouseStore.currentWarehouse?.id ?? warehouseCookie.value ?? null
  warehouseStore.syncWarehouses()
  const after = warehouseStore.currentWarehouse?.id ?? null
  if (after !== null && String(after) !== String(before ?? '')) {
    location.reload()
  }
})
onBeforeUnmount(() => {
  mql?.removeEventListener('change', onMediaChange)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="w-shell" :class="{ 'is-collapsed': collapsed, 'is-mobile': mobile, 'is-drawer-open': drawerOpen }">
    <a href="#w-main" class="w-shell__skip">{{ t('shell.skip-to-content') }}</a>
    <aside :id="sidebarId" class="w-shell__sidebar">
      <ShellSidebar :groups="groups" :variant="variant" :collapsed="collapsed" @navigate="drawerOpen = false" />
    </aside>
    <div v-if="mobile && drawerOpen" class="w-shell__backdrop" aria-hidden="true" @click="drawerOpen = false" />
    <div class="w-shell__main">
      <ShellTopbar class="w-shell__topbar" :variant="variant" :sidebar-expanded="sidebarExpanded" :mobile="mobile"
        :sidebar-id="sidebarId" :query="variant === 'wms' ? searchQuery : null" @toggle-sidebar="toggleSidebar" />
      <main id="w-main" class="w-main" tabindex="-1">
        <div class="w-page">
          <slot />
        </div>
        <footer class="w-shell__footer">
          {{ t('footer.copyright', { year, company: t('footer.company'), developer: t('footer.developer') }) }}
        </footer>
      </main>
    </div>
    <ShellBackToTop />
  </div>
</template>

<style scoped>
.w-shell {
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: var(--w-bg);
  color: var(--w-text-1);
  font-family: var(--w-font);
}
.w-shell__skip {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: calc(var(--w-z-sidebar) + 2);
  padding: 8px 12px;
  border-radius: var(--w-radius-control);
  background: var(--w-pri);
  color: var(--w-on-pri);
  transform: translateY(-200%);
}
.w-shell__skip:focus { transform: none; outline: none; box-shadow: var(--w-focus-ring); }

.w-shell__sidebar {
  position: sticky;
  top: 0;
  align-self: flex-start;
  flex: none;
  width: var(--w-sidebar-w);
  height: 100vh;
  z-index: var(--w-z-sidebar);
  transition: width 0.15s ease;
}
.w-shell.is-collapsed .w-shell__sidebar { width: var(--w-sidebar-w-collapsed); }

.w-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.w-shell__topbar {
  position: sticky;
  top: 0;
  z-index: var(--w-z-sticky);
}
.w-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: var(--w-page-pad-top) var(--w-page-pad-x) var(--w-sp-24);
}
.w-page { flex: 1 0 auto; min-width: 0; }
.w-main:has(.dn-form, .asn-form, .asn-detail, .w-dnd) { padding-top: 20px; }
.w-main:focus { outline: none; }
/* 版权行：内容区最下面，弱化小字 */
.w-shell__footer {
  margin-top: var(--w-sp-48);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  text-align: center;
}

/* 窄屏：侧栏变抽屉 */
.w-shell.is-mobile .w-shell__sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 264px;
  max-width: 85vw;
  transform: translateX(-100%);
  visibility: hidden;
  transition: transform 0.18s ease, visibility 0.18s;
}
.w-shell.is-mobile.is-drawer-open .w-shell__sidebar {
  transform: none;
  visibility: visible;
}
.w-shell__backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--w-z-sidebar) - 1);
  background: var(--w-backdrop);
}
@media (max-width: 991.98px) {
  .w-main { padding: 16px 16px var(--w-sp-24); }
}
@media (prefers-reduced-motion: reduce) {
  .w-shell__sidebar { transition: none !important; }
}
@media print {
  .w-shell__sidebar, .w-shell__topbar, .w-shell__skip, .w-shell__footer { display: none !important; }
  .w-main { padding: 0; }
}
</style>
