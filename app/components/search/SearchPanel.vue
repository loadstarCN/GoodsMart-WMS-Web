<script setup lang="ts">
/**
 * 全局搜索面板（设计稿 TopbarSpec「全局搜索（Ctrl K）」）：顶栏点搜索框或按 Ctrl K / ⌘K 打开，盖在顶栏搜索框上。
 * - 输入后约 250ms 搜索（每类前 5 条，面板每组显示前 3 条）。最佳匹配（完整单号 / 运单号 / 商品编码相同，见
 *   utils/globalSearch pickBestMatch）置顶并默认选中，下面的分组不再重复它；没有最佳匹配时不预选，Enter 去结果页
 * - 结果还没回来就按 Enter（扫码枪输入完自带回车）：等这次结果，有最佳匹配直接打开，没有去结果页
 * - 键盘：↑ ↓ 选择、Enter 打开、Esc 关闭；焦点一直在输入框，选中项用 aria-activedescendant 告诉读屏
 * - 空输入显示最近搜索（本机，可单条删 / 全部清除）；没有结果时可改搜全部仓库（只在可访问多个仓库、页头选了某个仓库时）
 * - 「查看全部 N 条」「全部结果 N 条」去结果页 /search
 * 打开时焦点进面板、Tab 不出面板、Esc 关闭、关闭后焦点回到原来的位置（useWOverlay）；换页时关闭。
 */
import type { GlobalSearchItem, GlobalSearchResult, GlobalSearchScope, GlobalSearchType } from '~/utils/globalSearch'
import type { RecentSearch } from '~/utils/searchRecent'

const props = withDefaults(defineProps<{
  /** 顶栏搜索框：面板与它左对齐、盖在它上面 */
  anchor?: HTMLElement | null
}>(), {
  anchor: null,
})

const PANEL_WIDTH = 640
const GROUP_ITEMS = 3
const DEBOUNCE_MS = 250

interface PanelOption {
  id: string
  item?: GlobalSearchItem
  recent?: RecentSearch
}
interface PanelSection {
  key: string
  label: string
  total?: number
  /** 「查看全部 N 条」去结果页的哪一类（null = 已经全部显示） */
  more?: GlobalSearchType | null
  options: PanelOption[]
}

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const search = useGlobalSearch()
const recentSearches = useRecentSearches()
const recentHint = useRecentSearchHint()
const navigation = useSearchNavigation()
const warehouseStore = useWarehouseStore()
const uid = useId()
const listboxId = `${uid}-listbox`
const panel = useTemplateRef<HTMLElement>('panel')
const input = useTemplateRef<HTMLInputElement>('input')

const query = ref('')
const scope = ref<GlobalSearchScope>('warehouse')
const result = ref<GlobalSearchResult | null>(null)
/** result 是哪个关键字 + 范围的结果 */
const resultKey = ref('')
const loading = ref(false)
const failed = ref(false)
const active = ref(-1)
const panelStyle = ref<Record<string, string>>({})
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
let running: Promise<void> | null = null

const trimmed = computed(() => query.value.trim())
const keyOf = (q: string, s: GlobalSearchScope) => `${s}\n${q}`
/** 当前结果就是输入框里这个关键字的 */
const fresh = computed(() => !!result.value && resultKey.value === keyOf(trimmed.value, scope.value))
const total = computed(() => searchResultTotal(result.value))
const best = computed(() => pickBestMatch(result.value))
const recent = computed(() => recentSearches.recent.value)
const currentWarehouse = computed(() => warehouseStore.currentWarehouse)
/** 「在全部仓库中搜索」：可访问多个仓库、页头选了某个仓库时才有意义（选「全部仓库」时本来就搜全部） */
const canSearchAll = computed(() => warehouseStore.warehouses.length > 1 && !!currentWarehouse.value)
const typeLabel = (type: GlobalSearchType) => t(GLOBAL_SEARCH_TYPE_META[type].label)

type Mode = 'recent' | 'idle' | 'loading' | 'results' | 'empty' | 'error'
const mode = computed<Mode>(() => {
  if (!trimmed.value) return recent.value.length ? 'recent' : 'idle'
  if (fresh.value) return total.value > 0 ? 'results' : 'empty'
  if (failed.value) return 'error'
  // 新关键字的结果还没回来：先留着上一次的（有结果时），没有就显示「搜索中」
  return result.value && total.value > 0 ? 'results' : 'loading'
})

const sections = computed<PanelSection[]>(() => {
  if (mode.value === 'recent') {
    return [{
      key: 'recent',
      label: t('search.recent.title'),
      options: recent.value.map((entry, index) => ({ id: `${uid}-recent-${index}`, recent: entry })),
    }]
  }
  if (mode.value !== 'results' || !result.value) return []
  const list: PanelSection[] = []
  const top = best.value
  if (top) {
    list.push({
      key: 'best',
      label: t('search.best', { type: typeLabel(top.type) }),
      options: [{ id: `${uid}-best`, item: top }],
    })
  }
  for (const group of result.value.groups) {
    const items = group.items.filter((item) => !sameSearchItem(item, top)).slice(0, GROUP_ITEMS)
    if (items.length === 0) continue
    list.push({
      key: group.type,
      label: typeLabel(group.type),
      total: group.total,
      more: group.total > items.length ? group.type : null,
      options: items.map((item) => ({ id: `${uid}-${item.type}-${item.id}`, item })),
    })
  }
  return list
})
const options = computed(() => sections.value.flatMap((section) => section.options))
const indexOf = computed(() => new Map(options.value.map((option, index) => [option.id, index])))
const activeId = computed(() => options.value[active.value]?.id)

// ---- 搜索 ----
const clearTimer = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

const run = (): Promise<void> => {
  clearTimer()
  const q = trimmed.value
  const s = scope.value
  if (!q) {
    seq++
    loading.value = false
    failed.value = false
    running = null
    return Promise.resolve()
  }
  if (result.value && resultKey.value === keyOf(q, s)) return running || Promise.resolve()
  const id = ++seq
  loading.value = true
  failed.value = false
  const task = (async () => {
    try {
      const data = await fetchGlobalSearch({ q, scope: s })
      if (id !== seq) return
      result.value = data
      resultKey.value = keyOf(q, s)
      active.value = pickBestMatch(data) ? 0 : -1
    } catch {
      if (id === seq) failed.value = true
    } finally {
      if (id === seq) {
        loading.value = false
        running = null
      }
    }
  })()
  running = task
  return task
}

watch(query, () => {
  if (!search.isOpen.value) return
  clearTimer()
  if (!trimmed.value) {
    run()
    active.value = recent.value.length ? 0 : -1
    return
  }
  if (result.value && resultKey.value === keyOf(trimmed.value, scope.value)) return
  timer = setTimeout(run, DEBOUNCE_MS)
})

// ---- 选择与打开 ----
const setActive = (index: number, scroll = true) => {
  active.value = index
  if (!scroll) return
  nextTick(() => {
    const id = activeId.value
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
  })
}

const close = () => search.close()

const openItem = (item: GlobalSearchItem) => {
  recentSearches.add(trimmed.value || item.code || '', {
    type: item.type,
    field: item.matched_field === 'tracking_number' ? 'tracking_number' : undefined,
  })
  close()
  navigation.open(item)
}

const resultsLocation = (type?: GlobalSearchType) => searchPageLocation({ q: trimmed.value, type, scope: scope.value })
const resultsHref = (type?: GlobalSearchType) => router.resolve(resultsLocation(type)).href

const goResults = (type?: GlobalSearchType) => {
  if (!trimmed.value) return
  recentSearches.add(trimmed.value, fresh.value ? { count: total.value } : undefined)
  close()
  router.push(resultsLocation(type))
}

const applyRecent = (entry: RecentSearch) => {
  query.value = entry.q
  run()
  input.value?.focus()
}

const activate = (option: PanelOption | undefined) => {
  if (option?.item) openItem(option.item)
  else if (option?.recent) applyRecent(option.recent)
}

const onEnter = async () => {
  if (!trimmed.value) {
    activate(options.value[active.value])
    return
  }
  if (!fresh.value) {
    const q = trimmed.value
    await run()
    if (trimmed.value !== q || !search.isOpen.value) return
    if (fresh.value && best.value) openItem(best.value)
    else goResults()
    return
  }
  const option = options.value[active.value]
  if (option) activate(option)
  else goResults()
}

const onKeydown = (event: KeyboardEvent) => {
  // 输入法组字中的方向键 / 回车不处理
  if (event.isComposing || event.keyCode === 229) return
  const count = options.value.length
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (count) setActive(active.value + 1 >= count ? 0 : active.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (count) setActive(active.value <= 0 ? count - 1 : active.value - 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    onEnter()
  }
}

const onItemClick = (event: MouseEvent, item: GlobalSearchItem) => {
  const target = navigation.targetOf(item)
  const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0
  // 新标签页打开：交给浏览器，面板不关；要切仓库的记录不能在新标签页里开（新标签页沿用当前仓库）
  if (modified && target && target.switchWarehouseId === null) return
  event.preventDefault()
  openItem(item)
}

const clearQuery = () => {
  query.value = ''
  input.value?.focus()
}
const removeRecent = (entry: RecentSearch) => {
  recentSearches.remove(entry.q)
  if (active.value >= recent.value.length) active.value = recent.value.length - 1
  input.value?.focus()
}
const clearRecent = () => {
  recentSearches.clear()
  active.value = -1
  input.value?.focus()
}
const searchAll = () => {
  scope.value = 'all'
  run()
  input.value?.focus()
}

// ---- 文案 ----
const emptyText = computed(() => (scope.value === 'all'
  ? t('search.empty.all', { q: trimmed.value })
  : t('search.empty.warehouse', { q: trimmed.value, warehouse: currentWarehouse.value?.name || t('common.all-warehouse') })))
const liveText = computed(() => {
  if (mode.value === 'results' && fresh.value) return t('search.result-count', { count: total.value.toLocaleString(locale.value) }, total.value)
  if (mode.value === 'empty') return emptyText.value
  return ''
})

// ---- 位置：盖在顶栏搜索框上，左对齐；窄屏铺满 ----
const place = () => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 768 || !props.anchor) {
    panelStyle.value = { left: '8px', right: '8px', top: '8px', maxHeight: `${vh - 16}px` }
    return
  }
  const rect = props.anchor.getBoundingClientRect()
  const width = Math.min(PANEL_WIDTH, vw - 32)
  const left = Math.max(16, Math.min(rect.left, vw - width - 16))
  // 面板顶部的输入行 48 高，与 36 高的搜索框中线对齐
  const top = Math.max(8, Math.round(rect.top + rect.height / 2 - 24))
  panelStyle.value = { left: `${Math.round(left)}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${vh - top - 16}px` }
}

// ---- 开关 ----
const onOpen = async () => {
  clearTimer()
  seq++
  scope.value = 'warehouse'
  result.value = null
  resultKey.value = ''
  loading.value = false
  failed.value = false
  recentSearches.reload()
  query.value = search.initialQuery.value
  active.value = trimmed.value ? -1 : (recent.value.length ? 0 : -1)
  place()
  window.addEventListener('resize', place)
  await nextTick()
  input.value?.focus()
  input.value?.select()
  if (trimmed.value) run()
}
const onClosed = () => {
  clearTimer()
  seq++
  loading.value = false
  window.removeEventListener('resize', place)
}

watch(search.isOpen, (open) => (open ? onOpen() : onClosed()))
watch(() => route.fullPath, () => { if (search.isOpen.value) close() })
onMounted(() => { if (search.isOpen.value) onOpen() })
onBeforeUnmount(() => {
  onClosed()
  if (search.isOpen.value) close()
})

useWOverlay(search.isOpen, panel, close)
</script>

<template>
  <Teleport to="body">
    <div v-if="search.isOpen.value" class="w-sp-layer w-scope" @mousedown.self="close">
      <div ref="panel" class="w-sp" role="dialog" aria-modal="true" :aria-label="t('search.dialog')" :style="panelStyle"
        tabindex="-1">
        <div class="w-sp__bar">
          <WIcon name="search" :size="16" :stroke-width="2" class="w-sp__bar-icon" />
          <input ref="input" v-model="query" type="text" class="w-sp__input" role="combobox" autofocus autocomplete="off"
            spellcheck="false" maxlength="100" aria-autocomplete="list" :aria-expanded="options.length > 0"
            :aria-controls="sections.length ? listboxId : undefined" :aria-activedescendant="activeId" :aria-label="t('search.input-label')"
            :placeholder="t('search.placeholder')" @keydown="onKeydown">
          <WTag v-if="scope === 'all'" tone="info">{{ t('common.all-warehouse') }}</WTag>
          <span v-if="loading" class="w-sp__spinner" aria-hidden="true" />
          <button v-if="query" type="button" class="w-sp__clear" :aria-label="t('search.clear')" @click="clearQuery">
            <WIcon name="close" :size="12" :stroke-width="2.4" />
          </button>
          <kbd class="w-sp-kbd">Esc</kbd>
        </div>

        <div class="w-sp__body">
          <div v-if="sections.length" :id="listboxId" role="listbox" class="w-sp__list" :aria-label="t('search.results-label')"
            :class="{ 'is-stale': !fresh && !!trimmed }">
            <div v-for="section in sections" :key="section.key" role="group" class="w-sp__group"
              :aria-labelledby="`${uid}-group-${section.key}`">
              <div class="w-sp__group-head">
                <span :id="`${uid}-group-${section.key}`" class="w-sp__group-label">{{ section.label }}</span>
                <span v-if="section.total" class="w-sp__group-count">{{ section.total.toLocaleString(locale) }}</span>
                <span class="w-sp__spacer" />
                <button v-if="section.key === 'recent'" type="button" class="w-sp__text-btn" @click="clearRecent">
                  {{ t('search.recent.clear') }}
                </button>
                <a v-else-if="section.more" :href="resultsHref(section.more)" class="w-sp__more"
                  @click.prevent="goResults(section.more)">{{ t('search.view-all', { count: (section.total || 0).toLocaleString(locale) }) }}</a>
              </div>
              <template v-for="option in section.options" :key="option.id">
                <SearchResultRow v-if="option.item" :id="option.id" role="option" tabindex="-1" size="sm" enter-hint
                  :item="option.item" :href="navigation.hrefOf(option.item)" :active="indexOf.get(option.id) === active"
                  :aria-selected="indexOf.get(option.id) === active" @click="onItemClick($event, option.item)"
                  @mousemove="setActive(indexOf.get(option.id) ?? -1, false)" />
                <div v-else-if="option.recent" :id="option.id" role="option" class="w-sp__recent"
                  :class="{ 'is-active': indexOf.get(option.id) === active }" :aria-selected="indexOf.get(option.id) === active"
                  @mousedown.prevent @click="applyRecent(option.recent)" @mousemove="setActive(indexOf.get(option.id) ?? -1, false)">
                  <WIcon name="clock" :size="15" :stroke-width="2" class="w-sp__recent-icon" />
                  <span class="w-sp__recent-q">{{ option.recent.q }}</span>
                  <span class="w-sp__recent-hint">{{ recentHint(option.recent) }}</span>
                  <button type="button" class="w-sp__recent-del" :aria-label="t('search.recent.remove', { q: option.recent.q })"
                    @click.stop="removeRecent(option.recent)">
                    <WIcon name="close" :size="12" :stroke-width="2.4" />
                  </button>
                </div>
              </template>
            </div>
          </div>

          <WEmptyState v-else-if="mode === 'empty'" :title="emptyText" icon="search-off" compact class="w-sp__empty">
            <template #title>
              {{ emptyText }}
              <WHelp :text="t('search.help')" placement="bottom" />
            </template>
            <template v-if="canSearchAll && scope === 'warehouse'" #action>
              <WButton size="sm" @click="searchAll">{{ t('search.empty.search-all') }}</WButton>
            </template>
          </WEmptyState>

          <div v-else-if="mode === 'error'" class="w-sp__note">
            <span>{{ t('search.failed') }}</span>
            <WButton size="sm" variant="text" @click="run()">{{ t('search.retry') }}</WButton>
          </div>
          <p v-else-if="mode === 'loading'" class="w-sp__note">{{ t('search.loading') }}</p>
          <p v-else class="w-sp__note w-sp__note--idle">
            {{ t('search.idle') }}
            <WHelp :text="t('search.help')" placement="bottom" />
          </p>
        </div>

        <div class="w-sp__foot">
          <span>{{ t('search.keys.select') }}</span>
          <span>{{ t('search.keys.open') }}</span>
          <span>{{ t('search.keys.close') }}</span>
          <span class="w-sp__spacer" />
          <a v-if="mode === 'results' && fresh" :href="resultsHref()" class="w-sp__more" @click.prevent="goResults()">
            {{ t('search.all-results', { count: total.toLocaleString(locale) }) }}
          </a>
        </div>
        <span class="w-sr-only" aria-live="polite">{{ liveText }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.w-sp-layer {
  position: fixed;
  inset: 0;
  z-index: var(--w-z-modal);
}
.w-sp {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-raised);
  color: var(--w-text-1);
}
.w-sp:focus { outline: none; }

.w-sp__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 48px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--w-line);
  color: var(--w-text-3);
}
.w-sp__bar-icon { flex: none; }
.w-sp__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--w-text-1);
  font: inherit;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
}
.w-sp__input::placeholder { color: var(--w-text-3); opacity: 1; }
.w-sp__clear {
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
.w-sp__clear:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-sp__clear:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-sp__spinner {
  flex: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--w-border-strong);
  border-right-color: transparent;
  border-radius: var(--w-radius-pill);
  animation: w-sp-spin 0.7s linear infinite;
}
@keyframes w-sp-spin { to { transform: rotate(360deg); } }
.w-sp-kbd {
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

.w-sp__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.w-sp__list {
  display: flex;
  flex-direction: column;
  padding: 4px 8px 8px;
  transition: opacity 0.12s;
}
.w-sp__list.is-stale { opacity: 0.6; }
.w-sp__group { display: flex; flex-direction: column; }
.w-sp__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 4px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-sp__group-label { font-weight: var(--w-fw-medium); }
.w-sp__spacer { flex: 1 1 0; }
.w-sp__more {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-link);
  text-decoration: none;
  white-space: nowrap;
}
.w-sp__more:hover { color: var(--w-link-hover); }
.w-sp__more:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
.w-sp__text-btn {
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-sel-text);
  font: inherit;
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  cursor: pointer;
}
.w-sp__text-btn:hover { background: var(--w-sel-soft); }
.w-sp__text-btn:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }

.w-sp__recent {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto 28px;
  gap: 10px;
  align-items: center;
  padding: 6px 4px 6px 10px;
  border-radius: var(--w-radius-control);
  cursor: pointer;
}
.w-sp__recent.is-active { background: var(--w-sel-soft); }
.w-sp__recent-icon { color: var(--w-nontext); }
.w-sp__recent-q {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
}
.w-sp__recent-hint {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  white-space: nowrap;
}
.w-sp__recent-del {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-nontext);
  cursor: pointer;
}
.w-sp__recent-del:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-sp__recent-del:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }

.w-sp__empty :deep(.w-empty__title) {
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
}
.w-sp__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 20px 16px;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-3);
}
.w-sp__note--idle { padding: 16px; }

.w-sp__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  flex: none;
  padding: 10px 16px;
  border-top: 1px solid var(--w-line);
  background: var(--w-bg);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
@media (prefers-reduced-motion: reduce) {
  .w-sp__spinner { animation-duration: 2s; }
}
</style>
