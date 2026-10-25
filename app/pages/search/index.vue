<script setup lang="ts">
/**
 * 搜索结果页（设计稿 SearchResults.dc.html）：/search?q=&type=&scope=&page=（参数见 utils/searchRoutes）。
 * - 关键词显示在顶栏搜索框里（ShellTopbar 的 query），改了回车刷新；页面里没有第二个搜索框
 * - 标题「搜索「…」」+ 结果数；页签：全部 + 有查看权限、有结果的各类（数量灰字）——可搜的类型有 11 种，0 条的都列出来
 *   会把有结果的挤到滚动区外，所以 0 条的不显示（设计稿是灰显不能点；正停在某一类上时这一类照常显示）；
 *   右侧范围切换「当前仓库｜全部仓库」（只在可访问多个仓库、页头选了某个仓库时出现）
 * - 全部：最佳匹配卡片置顶，下面按类型分组，每组前 5 条 +「查看全部」（最佳匹配不在组里重复）
 * - 单类型页签：表格（后端只搜一类时给的 columns）+ 分页
 * 页签上的数量取自不带 types 的请求（只搜一类时 counts 只有那一类）；换页签时它不重新请求。
 */
import type { WSegmentedOption } from '~/components/w/WSegmented.vue'
import type { WTabItem } from '~/components/w/WTabs.vue'
import type { GlobalSearchGroup, GlobalSearchItem, GlobalSearchResult, GlobalSearchScope, GlobalSearchType } from '~/utils/globalSearch'

const PER_PAGE = 20
const GROUP_ITEMS = 5

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const search = useGlobalSearch()
const recentSearches = useRecentSearches()
const navigation = useSearchNavigation()
const display = useSearchDisplay()
const warehouseStore = useWarehouseStore()
const uid = useId()
const panelId = `${uid}-panel`

const params = computed(() => parseSearchPageQuery(route.query))

// ---- 数据：overview = 不带 types 的请求（页签数量、「全部」的分组）；detail = 单类型的一页 ----
const overview = ref<GlobalSearchResult | null>(null)
const overviewKey = ref('')
const overviewLoading = ref(false)
const overviewFailed = ref(false)
const detail = ref<GlobalSearchGroup | null>(null)
const detailKey = ref('')
const detailLoading = ref(false)
const detailFailed = ref(false)
/** 最佳匹配那一条带列表列的版本（按它的类型另请求一次） */
const bestDetail = ref<GlobalSearchItem | null>(null)
let overviewSeq = 0
let detailSeq = 0

const keyOf = (...parts: (string | number)[]) => parts.join('\n')

const best = computed(() => pickBestMatch(overview.value))
const total = computed(() => searchResultTotal(overview.value))

const loadBestDetail = async (item: GlobalSearchItem, q: string, scope: GlobalSearchScope, seq: number) => {
  try {
    const data = await fetchGlobalSearch({ q, scope, types: [item.type], perPage: GROUP_ITEMS })
    if (seq !== overviewSeq) return
    bestDetail.value = data.groups[0]?.items.find((row) => sameSearchItem(row, item)) ?? null
  } catch {
    // 拿不到时卡片只显示基本信息
  }
}

const loadOverview = async (force: boolean) => {
  const { q, scope } = params.value
  const key = keyOf(scope, q)
  if (!force && overviewKey.value === key && (overview.value || overviewLoading.value)) return
  const seq = ++overviewSeq
  overviewKey.value = key
  overviewFailed.value = false
  bestDetail.value = null
  if (!q) {
    overview.value = null
    overviewLoading.value = false
    return
  }
  overviewLoading.value = true
  try {
    const data = await fetchGlobalSearch({ q, scope, limit: GROUP_ITEMS })
    if (seq !== overviewSeq) return
    overview.value = data
    recentSearches.add(q, { count: searchResultTotal(data) })
    const top = pickBestMatch(data)
    if (top) loadBestDetail(top, q, scope, seq)
  } catch {
    if (seq !== overviewSeq) return
    overview.value = null
    overviewFailed.value = true
  } finally {
    if (seq === overviewSeq) overviewLoading.value = false
  }
}

const loadDetail = async (force: boolean) => {
  const { q, scope, type, page } = params.value
  if (type === 'all' || !q) {
    detailSeq++
    detail.value = null
    detailKey.value = ''
    detailLoading.value = false
    return
  }
  const key = keyOf(scope, q, type, page)
  if (!force && detailKey.value === key && (detail.value || detailLoading.value)) return
  const seq = ++detailSeq
  detailKey.value = key
  detailFailed.value = false
  detailLoading.value = true
  try {
    const data = await fetchGlobalSearch({ q, scope, types: [type], page, perPage: PER_PAGE })
    if (seq !== detailSeq) return
    detail.value = data.groups[0] ?? null
  } catch {
    if (seq !== detailSeq) return
    detail.value = null
    detailFailed.value = true
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

const load = (force = false) => {
  loadOverview(force)
  loadDetail(force)
}
watch(() => route.query, () => load(), { immediate: true })
watch(search.refreshTick, () => load(true))

// 没有这一类的查看权限（地址里手写的 type）→ 回到全部
watch(overview, (data) => {
  const type = params.value.type
  if (data && type !== 'all' && !data.types.includes(type)) {
    router.replace(searchPageLocation({ q: params.value.q, scope: params.value.scope }))
  }
})

const go = (patch: Partial<{ type: GlobalSearchType | 'all'; scope: GlobalSearchScope; page: number }>) => {
  const next = { ...params.value, page: 1, ...patch }
  router.push(searchPageLocation(next))
}

// ---- 页签与范围 ----
const tabs = computed<WTabItem[]>(() => {
  const data = overview.value
  const list: WTabItem[] = [{ key: 'all', label: t('search.tab-all'), count: data ? total.value : null }]
  for (const type of data?.types ?? []) {
    const count = data?.counts[type] ?? 0
    if (count > 0 || params.value.type === type) list.push({ key: type, label: display.typeLabel(type), count })
  }
  return list
})
const activeTab = computed({
  get: () => params.value.type,
  set: (type: string) => go({ type: isGlobalSearchType(type) ? type : 'all' }),
})

const currentWarehouse = computed(() => warehouseStore.currentWarehouse)
/** 范围切换：可访问多个仓库、页头选了某个仓库时才有（选「全部仓库」时本来就搜全部） */
const showScope = computed(() => warehouseStore.warehouses.length > 1 && !!currentWarehouse.value)
const scopeOptions = computed<WSegmentedOption<GlobalSearchScope>[]>(() => [
  { value: 'warehouse', label: t('search.scope.warehouse', { name: currentWarehouse.value?.name || '' }) },
  { value: 'all', label: t('common.all-warehouse') },
])
const scope = computed({
  get: () => params.value.scope,
  set: (value: GlobalSearchScope) => go({ type: params.value.type, scope: value }),
})

// ---- 「全部」页签的分组 ----
const groups = computed(() => {
  const data = overview.value
  if (!data) return []
  return data.groups
    .map((group) => {
      const items = group.items.filter((item) => !sameSearchItem(item, best.value)).slice(0, GROUP_ITEMS)
      return { type: group.type, total: group.total, items, more: group.total > items.length }
    })
    .filter((group) => group.items.length > 0)
})

const onRowClick = (event: MouseEvent, item: GlobalSearchItem) => navigation.onLinkClick(event, item)

// ---- 单类型页签 ----
const detailType = computed(() => (params.value.type === 'all' ? null : params.value.type))
const detailPage = computed({
  get: () => params.value.page,
  set: (page: number) => go({ type: params.value.type, page }),
})

// ---- 文案与状态 ----
const emptyText = computed(() => (params.value.scope === 'all'
  ? t('search.empty.all', { q: params.value.q })
  : t('search.empty.warehouse', { q: params.value.q, warehouse: currentWarehouse.value?.name || t('common.all-warehouse') })))
const canSearchAll = computed(() => showScope.value && params.value.scope === 'warehouse')
const pageTitle = computed(() => (params.value.q ? t('search.title', { q: params.value.q }) : t('search.page-title')))
useHead({ title: pageTitle })
</script>

<template>
  <div class="w-search w-scope">
    <div class="w-search__head">
      <h1 class="w-search__title">{{ pageTitle }}</h1>
      <span v-if="overview && params.q" class="w-search__count">
        {{ t('search.result-count', { count: total.toLocaleString(locale) }, total) }}
      </span>
    </div>

    <template v-if="!params.q">
      <WCard>
        <WEmptyState :title="t('search.idle')" icon="search">
          <template #title>
            {{ t('search.idle') }}
            <WHelp :text="t('search.help')" />
          </template>
        </WEmptyState>
      </WCard>
    </template>

    <template v-else>
      <div class="w-search__bar">
        <WTabs v-model="activeTab" class="w-search__tabs" :items="tabs" :label="t('search.tabs-label')" :panel-id="panelId" />
        <div class="w-search__scope">
          <WSegmented v-if="showScope" v-model="scope" :options="scopeOptions" :label="t('search.scope.label')" />
          <WHelp :text="t('search.help')" placement="bottom" />
        </div>
      </div>

      <div :id="panelId" role="tabpanel" class="w-search__panel">
        <WAlert v-if="overviewFailed && !overviewLoading" tone="block" :title="t('search.failed')">
          <template #actions><WButton size="sm" @click="load(true)">{{ t('search.retry') }}</WButton></template>
        </WAlert>

        <!-- 全部 -->
        <template v-else-if="params.type === 'all'">
          <div v-if="overviewLoading && !overview" class="w-search__skeleton" aria-hidden="true">
            <span v-for="n in 4" :key="n" class="w-search__skeleton-row" />
          </div>
          <template v-else-if="overview">
            <WCard v-if="total === 0">
              <WEmptyState :title="emptyText" icon="search-off">
                <template #title>
                  {{ emptyText }}
                  <WHelp :text="t('search.help')" />
                </template>
                <template v-if="canSearchAll" #action>
                  <WButton size="sm" @click="go({ scope: 'all' })">{{ t('search.empty.search-all') }}</WButton>
                </template>
              </WEmptyState>
            </WCard>
            <template v-else>
              <SearchBestMatch v-if="best" :item="best" :detail="bestDetail" />
              <section v-for="group in groups" :key="group.type" class="w-search__group" :aria-labelledby="`${uid}-${group.type}`">
                <div class="w-search__group-head">
                  <WIcon :name="GLOBAL_SEARCH_TYPE_META[group.type].icon" :size="16" class="w-search__group-icon" />
                  <h2 :id="`${uid}-${group.type}`" class="w-search__group-title">{{ display.typeLabel(group.type) }}</h2>
                  <span class="w-search__group-count">{{ group.total.toLocaleString(locale) }}</span>
                  <NuxtLink v-if="group.more" :to="searchPageLocation({ q: params.q, type: group.type, scope: params.scope })"
                    class="w-search__more">
                    {{ t('search.view-all', { count: group.total.toLocaleString(locale) }) }}
                  </NuxtLink>
                </div>
                <ul class="w-search__list">
                  <li v-for="item in group.items" :key="`${item.type}-${item.id}`">
                    <SearchResultRow :item="item" :href="navigation.hrefOf(item)" @click="onRowClick($event, item)" />
                  </li>
                </ul>
              </section>
            </template>
          </template>
        </template>

        <!-- 单类型 -->
        <template v-else-if="detailType">
          <WAlert v-if="detailFailed && !detailLoading" tone="block" :title="t('search.failed')">
            <template #actions><WButton size="sm" @click="load(true)">{{ t('search.retry') }}</WButton></template>
          </WAlert>
          <WCard v-else flush>
            <SearchTypeTable :type="detailType" :items="detail?.items ?? []" :loading="detailLoading && !detail"
              :show-warehouse="params.scope === 'all' || !currentWarehouse"
              :caption="t('search.table-caption', { type: display.typeLabel(detailType) })" />
            <template v-if="detail && detail.total > 0" #footer>
              <WPagination v-model:page="detailPage" class="w-search__pager" :page-count="detail.pages" :total="detail.total"
                :page-size="detail.per_page" show-total />
            </template>
          </WCard>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 列表、表格类内容占满内容区宽度（不限最大宽度） */
.w-search {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-16);
}
.w-search__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.w-search__title {
  margin: 0;
  font-size: var(--w-fs-24);
  line-height: var(--w-lh-24);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
  overflow-wrap: anywhere;
}
.w-search__count {
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}

/* 页签行：左页签、右范围切换，底线贯通 */
.w-search__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  box-shadow: inset 0 -1px 0 var(--w-border);
}
.w-search__tabs { flex: 1 1 320px; min-width: 0; }
.w-search__scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}

.w-search__panel {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-16);
}
.w-search__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.w-search__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.w-search__group-icon { color: var(--w-text-2); }
.w-search__group-title {
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-search__group-count {
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-3);
}
.w-search__more {
  margin-left: 8px;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  font-weight: var(--w-fw-medium);
  color: var(--w-link);
  text-decoration: none;
  white-space: nowrap;
}
.w-search__more:hover { color: var(--w-link-hover); }
.w-search__more:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
.w-search__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
}
.w-search__list > li + li { border-top: 1px solid var(--w-line); }
.w-search__list :deep(.w-sr-row:hover) { background: var(--w-surface-2); }
.w-search__list :deep(.w-sr-row:focus-visible) { background: var(--w-sel-soft); }
.w-search__pager { width: 100%; }

.w-search__skeleton {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-line);
}
.w-search__skeleton-row {
  height: 58px;
  background: var(--w-surface) linear-gradient(var(--w-skeleton), var(--w-skeleton)) no-repeat 64px 50% / 40% 12px;
}
</style>
