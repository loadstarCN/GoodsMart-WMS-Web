<script setup lang="ts">
/**
 * 顶栏（设计稿 Topbar.dc.html，严格 56 高，按钮和账户区都是 36）：
 * 收起菜单 · 全局搜索（Ctrl K） · 仓库（含时区）| 语言 · 深色模式 · 账户。
 * 平台管理员没有仓库、不搜单据：不显示仓库按钮和搜索框。
 * 搜索：这一步只有入口和快捷键（useGlobalSearch），搜索面板与结果页下一步做。
 */
import { SHELL_FEATURES } from '~/data/navigation'

const props = withDefaults(defineProps<{
  variant?: 'wms' | 'admin'
  /** 侧栏是否展开（宽屏 = 没收起；窄屏 = 抽屉打开） */
  sidebarExpanded: boolean
  /** 窄屏：按钮打开 / 关闭侧栏抽屉 */
  mobile?: boolean
  sidebarId: string
}>(), {
  variant: 'wms',
  mobile: false,
})

const emit = defineEmits<{ 'toggle-sidebar': [] }>()
const { t } = useI18n()
const search = useGlobalSearch()
const { theme, setTheme } = useUiPrefs()
const searchButton = useTemplateRef<HTMLButtonElement>('searchButton')

const showSearch = computed(() => props.variant === 'wms')
const isMac = ref(false)
const shortcut = computed(() => (isMac.value ? '⌘ K' : 'Ctrl K'))

const toggleLabel = computed(() => {
  if (props.mobile) return props.sidebarExpanded ? t('shell.close-menu') : t('shell.open-menu')
  return props.sidebarExpanded ? t('shell.collapse-menu') : t('shell.expand-menu')
})

// 搜索面板还没有：先只记开关状态并把焦点放到搜索框上（离开搜索框即关闭）；面板做好后由面板管理开关
const openSearch = () => {
  search.open()
  searchButton.value?.focus()
}

/** Ctrl K / ⌘ K：打开搜索（在输入框里也生效，浏览器默认的 Ctrl K 是聚焦地址栏搜索） */
const onKeydown = (event: KeyboardEvent) => {
  if (!showSearch.value) return
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
}
onMounted(() => {
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="w-topbar">
    <button type="button" class="w-topbar__icon-btn" :aria-label="toggleLabel" :aria-expanded="sidebarExpanded"
      :aria-controls="sidebarId" @click="emit('toggle-sidebar')">
      <WIcon :name="sidebarExpanded && !mobile ? 'menu' : 'menu-full'" :size="20" />
    </button>

    <button v-if="showSearch" ref="searchButton" type="button" class="w-topbar__search" aria-haspopup="dialog"
      :aria-expanded="search.isOpen.value" :aria-label="t('shell.search.label', { shortcut })" @click="openSearch"
      @blur="search.close()">
      <WIcon name="search" :size="16" :stroke-width="2" />
      <span class="w-topbar__search-text">{{ t('shell.search.placeholder') }}</span>
      <kbd class="w-topbar__kbd">{{ shortcut }}</kbd>
    </button>

    <div class="w-topbar__spacer" />

    <template v-if="variant === 'wms'">
      <ShellWarehouseMenu />
      <span class="w-topbar__sep" aria-hidden="true" />
    </template>

    <ShellLanguageMenu />

    <button v-if="SHELL_FEATURES.themeToggle" type="button" class="w-topbar__icon-btn" :aria-label="t('shell.theme.dark')"
      :aria-pressed="theme === 'dark'" @click="setTheme(theme === 'dark' ? 'light' : 'dark')">
      <WIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />
    </button>

    <ShellAccountMenu :variant="variant" />
  </header>
</template>

<style scoped>
.w-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--w-topbar-h);
  padding: 0 20px 0 12px;
  border-bottom: 1px solid var(--w-border);
  background: var(--w-surface);
  color: var(--w-text-1);
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
}
.w-topbar__icon-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-2);
  cursor: pointer;
}
.w-topbar__icon-btn:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-topbar__icon-btn:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }

.w-topbar__search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 400px;
  min-width: 220px;
  height: 36px;
  padding: 0 6px 0 12px;
  border: 1px solid var(--w-surface-2);
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  color: var(--w-text-3);
  font: inherit;
  font-size: var(--w-fs-13);
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.w-topbar__search:hover { border-color: var(--w-border-strong); }
.w-topbar__search:focus-visible,
.w-topbar__search[aria-expanded="true"] {
  outline: none;
  border-color: var(--w-sel);
  background: var(--w-surface);
  box-shadow: var(--w-focus-ring);
}
.w-topbar__search-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-topbar__kbd {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-3);
  font-family: inherit;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  box-shadow: none;
}
.w-topbar__spacer { flex: 1 1 0; }
.w-topbar__sep {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  flex: none;
  background: var(--w-border);
}
@media (max-width: 767.98px) {
  .w-topbar { padding: 0 8px; gap: 4px; }
  .w-topbar__search, .w-topbar__sep { display: none; }
}
</style>
