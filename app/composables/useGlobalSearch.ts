/**
 * 全局搜索（顶栏搜索框 / Ctrl K 打开的面板 components/search/SearchPanel、结果页 pages/search）的共用状态与操作：
 * - useGlobalSearch：面板开关（可带初始关键字：在结果页按 Ctrl K 时带上当前关键字）、结果页的「再搜一次」
 * - fetchGlobalSearch：调接口 GET /api/warehouse/search（结果规整见 utils/globalSearch）
 * - useRecentSearches：最近搜索（utils/searchRecent，按用户存在本机）
 * - useSearchNavigation：打开一条结果（别的仓库的记录先切换页头仓库再整页加载，见 utils/searchRoutes）
 */
import type { GlobalSearchResult, GlobalSearchScope, GlobalSearchType, GlobalSearchUrlHint } from '~/utils/globalSearch'
import type { RecentSearch, RecentSearchHint } from '~/utils/searchRecent'
import type { HttpRequestError } from '~/utils/http'

export function useGlobalSearch() {
  const isOpen = useState<boolean>('w-search-open', () => false)
  const initialQuery = useState<string>('w-search-initial', () => '')
  /** 顶栏输入框回车但关键字没变时加一，结果页据此重新搜索 */
  const refreshTick = useState<number>('w-search-refresh', () => 0)
  return {
    isOpen,
    initialQuery,
    refreshTick,
    open: (q = '') => {
      initialQuery.value = q
      isOpen.value = true
    },
    close: () => { isOpen.value = false },
  }
}

export interface GlobalSearchParams {
  q: string
  types?: GlobalSearchType[]
  scope?: GlobalSearchScope
  /** 每类条数（默认 5，最多 50） */
  limit?: number
  /** 只搜一类时分页 */
  page?: number
  perPage?: number
}

/** 调搜索接口（仓库范围按页头当前仓库，同各列表）；失败时抛出 HttpRequestError */
export async function fetchGlobalSearch(params: GlobalSearchParams): Promise<GlobalSearchResult> {
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let failure = null as HttpRequestError | null
  const data = await httpRequest('/api/warehouse/search', {
    params: {
      q: params.q,
      types: params.types?.length ? params.types.join(',') : undefined,
      scope: params.scope === 'all' ? 'all' : undefined,
      limit: params.limit,
      page: params.page,
      per_page: params.perPage,
    },
    onError: (error) => { failure = error },
  })
  if (failure || !data) throw failure ?? ({ status: -1, message: 'Empty response' } as HttpRequestError)
  return normalizeSearchResult(data)
}

/** 最近搜索（本机，按用户）：面板打开时 reload 一次，之后增删直接写回 */
export function useRecentSearches() {
  const authStore = useAuthStore()
  const list = useState<RecentSearch[]>('w-search-recent', () => [])
  const loadedKey = useState<string | null>('w-search-recent-key', () => null)
  const key = () => recentSearchKey(authStore.userInfo?.id)
  const storage = (): Storage | null => {
    try {
      return window.localStorage
    } catch {
      return null
    }
  }
  const reload = () => {
    loadedKey.value = key()
    list.value = readRecentSearches(storage(), loadedKey.value)
  }
  const ensure = () => { if (loadedKey.value !== key()) reload() }
  const save = (next: RecentSearch[]) => {
    list.value = next
    writeRecentSearches(storage(), key(), next)
  }
  return {
    recent: list,
    reload,
    add: (q: string, hint?: RecentSearchHint) => {
      ensure()
      save(addRecentSearch(list.value, q, hint))
    },
    remove: (q: string) => {
      ensure()
      save(removeRecentSearch(list.value, q))
    },
    clear: () => save([]),
  }
}

/** 打开结果：在 setup 里调用（拿路由与仓库 store） */
export function useSearchNavigation() {
  const router = useRouter()
  const warehouseStore = useWarehouseStore()

  const targetOf = (item: { url_hint?: GlobalSearchUrlHint | null; type?: GlobalSearchType; id?: number; warehouse_id: number | null }) =>
    searchItemTarget(item, warehouseStore.currentWarehouse?.id ?? null)

  /** 链接的地址（新标签页打开用；记录在别的仓库时新标签页沿用当前仓库，所以普通点击走 open） */
  const hrefOf = (item: Parameters<typeof targetOf>[0]): string | undefined => {
    const target = targetOf(item)
    return target ? router.resolve(target.path).href : undefined
  }

  /** 打开；记录在别的仓库时先把页头仓库切过去，再整页加载（同页头切换仓库后重新加载） */
  const open = (item: Parameters<typeof targetOf>[0]): boolean => {
    const target = targetOf(item)
    if (!target) return false
    if (target.switchWarehouseId !== null) {
      const warehouse = warehouseStore.warehouses.find((w: WarehouseSimple) => w.id === target.switchWarehouseId)
      if (warehouse) {
        warehouseStore.selectWarehouse(warehouse)
        window.location.assign(router.resolve(target.path).href)
        return true
      }
    }
    router.push(target.path)
    return true
  }

  /** 链接的点击：带 Ctrl / ⌘ / Shift / 中键、且不用切仓库时交给浏览器（新标签页），否则走 open */
  const onLinkClick = (event: MouseEvent, item: Parameters<typeof targetOf>[0]) => {
    const target = targetOf(item)
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0
    if (modified && target && target.switchWarehouseId === null) return
    event.preventDefault()
    open(item)
  }

  return { hrefOf, open, onLinkClick, targetOf }
}

/** 最近搜索那一条的提示：命中运单号 / 打开了哪类 / 结果条数 */
export function useRecentSearchHint() {
  const { t } = useI18n()
  return (entry: RecentSearch): string => {
    const hint = entry.hint
    if (!hint) return ''
    if (hint.field === 'tracking_number') return t('search.fields.tracking_number')
    if (hint.type && isGlobalSearchType(hint.type)) return t(GLOBAL_SEARCH_TYPE_META[hint.type].label)
    if (typeof hint.count === 'number') return t('search.recent.count', { count: hint.count }, hint.count)
    return ''
  }
}

/** 结果的显示：类型名、状态 / 发货阶段的译名（找不到时原值）、日期（只有日期的值；今天标出来） */
export function useSearchDisplay() {
  const { t, te } = useI18n()
  const typeLabel = (type: GlobalSearchType) => t(GLOBAL_SEARCH_TYPE_META[type].label)
  const statusLabel = (status: string | null | undefined) => {
    if (!status) return ''
    const key = searchStatusKey(status)
    return te(key) ? t(key) : status
  }
  const stageLabel = (stage: string | null | undefined) => {
    if (!stage) return ''
    const key = `shipping.stage.${stage}`
    return te(key) ? t(key) : stage
  }
  /** 计划发货 / 预计到货（YYYY-MM-DD，仓库当地的业务日期）：今年的写 MM/DD，今天前面加「今天」；today 用来加粗 */
  const dateLabel = (value: unknown, warehouseId: number | null | undefined): { text: string; today: boolean } | null => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
    const date = value.slice(0, 10)
    const today = zonedToday(resolveTimeZone(warehouseId ?? null))
    const short = date.slice(0, 4) === today.slice(0, 4) ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : date
    return date === today ? { text: `${t('search.today')} ${short}`, today: true } : { text: short, today: false }
  }
  /** exact 命中的是哪一项（完整单号 / 完整运单号） */
  const exactFieldLabel = (field: string | null | undefined) =>
    (field === 'tracking_number' ? t('search.fields.tracking_number') : field === 'number' ? t('search.fields.number') : '')
  return { typeLabel, statusLabel, stageLabel, dateLabel, exactFieldLabel }
}
