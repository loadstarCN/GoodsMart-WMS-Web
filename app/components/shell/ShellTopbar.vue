<script setup lang="ts">
/**
 * 顶栏（设计稿 Topbar.dc.html，严格 56 高，按钮和账户区都是 36）：
 * 收起菜单 · 全局搜索（Ctrl K） · 仓库（含时区）| 语言 · 深色模式 · 账户。
 * 平台管理员没有仓库、不搜单据：不显示仓库按钮和搜索框。
 * 搜索：点搜索框或 Ctrl K / ⌘K 打开搜索面板（components/search/SearchPanel）。在搜索结果页（传 query）搜索框是输入框，
 * 显示当前关键词、可清除，改了回车刷新结果；Ctrl K 照常打开面板（带上当前关键词）。窄屏时搜索框收进账户菜单。
 */
import { SHELL_FEATURES } from '~/data/navigation'

const props = withDefaults(defineProps<{
  variant?: 'wms' | 'admin'
  /** 侧栏是否展开（宽屏 = 没收起；窄屏 = 抽屉打开） */
  sidebarExpanded: boolean
  /** 窄屏：按钮打开 / 关闭侧栏抽屉 */
  mobile?: boolean
  sidebarId: string
  /** 搜索结果页的当前关键词（不在结果页时 null：搜索框是打开面板的按钮） */
  query?: string | null
}>(), {
  variant: 'wms',
  mobile: false,
  query: null,
})

const emit = defineEmits<{ 'toggle-sidebar': [] }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const search = useGlobalSearch()
const { theme, setTheme } = useUiPrefs()
const searchButton = useTemplateRef<HTMLButtonElement>('searchButton')
const searchBox = useTemplateRef<HTMLElement>('searchBox')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')

const showSearch = computed(() => props.variant === 'wms')
const inResults = computed(() => props.query !== null)
/** 面板对齐的元素：按钮或结果页的输入框 */
const searchAnchor = computed(() => (inResults.value ? searchBox.value : searchButton.value) ?? null)
const isMac = ref(false)
const shortcut = computed(() => (isMac.value ? '⌘ K' : 'Ctrl K'))

const toggleLabel = computed(() => {
  if (props.mobile) return props.sidebarExpanded ? t('shell.close-menu') : t('shell.open-menu')
  return props.sidebarExpanded ? t('shell.collapse-menu') : t('shell.expand-menu')
})

// ---- 结果页的搜索框：显示当前关键词，回车按新关键词搜（没变时让结果页再搜一次） ----
const draft = ref('')
watch(() => props.query, (q) => { draft.value = q ?? '' }, { immediate: true })
const submitQuery = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) return
  const q = draft.value.trim()
  if (!q) return
  const current = parseSearchPageQuery(route.query)
  if (q === current.q) search.refreshTick.value++
  else router.push(searchPageLocation({ q, scope: current.scope }))
}
const clearDraft = () => {
  draft.value = ''
  searchInput.value?.focus()
}

/** 打开搜索面板（结果页上带着搜索框里的关键词） */
const openSearch = () => search.open(inResults.value ? draft.value.trim() : '')

/** Ctrl K / ⌘ K：打开搜索（在输入框里也生效，浏览器默认的 Ctrl K 是聚焦地址栏搜索） */
const onKeydown = (event: KeyboardEvent) => {
  if (!showSearch.value) return
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (!search.isOpen.value) openSearch()
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

    <template v-if="showSearch">
      <div v-if="inResults" ref="searchBox" role="search" class="w-topbar__search is-input">
        <WIcon name="search" :size="16" :stroke-width="2" />
        <input ref="searchInput" v-model="draft" type="search" class="w-topbar__search-input" maxlength="100"
          autocomplete="off" spellcheck="false" :aria-label="t('shell.search.label', { shortcut })"
          :placeholder="t('shell.search.placeholder')" @keydown.enter="submitQuery">
        <button v-if="draft" type="button" class="w-topbar__search-clear" :aria-label="t('search.clear')" @click="clearDraft">
          <WIcon name="close" :size="12" :stroke-width="2.4" />
        </button>
        <kbd class="w-topbar__kbd">{{ shortcut }}</kbd>
      </div>
      <button v-else ref="searchButton" type="button" class="w-topbar__search" aria-haspopup="dialog"
        :aria-expanded="search.isOpen.value" :aria-label="t('shell.search.label', { shortcut })" @click="openSearch">
        <WIcon name="search" :size="16" :stroke-width="2" />
        <span class="w-topbar__search-text">{{ t('shell.search.placeholder') }}</span>
        <kbd class="w-topbar__kbd">{{ shortcut }}</kbd>
      </button>
      <SearchPanel :anchor="searchAnchor" />
    </template>

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
.w-topbar__search:focus-visible {
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
/* 结果页：输入框（白底、控件描边，聚焦时强调描边 + 焦点环） */
.w-topbar__search.is-input {
  border-color: var(--w-border-strong);
  background: var(--w-surface);
  cursor: text;
}
.w-topbar__search.is-input:focus-within {
  border-color: var(--w-sel);
  box-shadow: var(--w-focus-ring);
}
.w-topbar__search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--w-text-1);
  font: inherit;
}
.w-topbar__search-input::placeholder { color: var(--w-text-3); opacity: 1; }
.w-topbar__search-input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
.w-topbar__search-clear {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-topbar__search-clear:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-topbar__search-clear:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
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
