/**
 * 搜索结果 → 页面的对应表（url_hint = {page, id}，page 即类型），以及搜索结果页 /search 的路由参数。
 * 现有的 11 类都有详情页 /<模块>/detail/<id>；新页面做好、路由变了时只改 SEARCH_DETAIL_ROUTES。
 */
import type { LocationQuery, RouteLocationRaw } from 'vue-router'
import type { GlobalSearchItem, GlobalSearchScope, GlobalSearchType, GlobalSearchUrlHint } from '~/utils/globalSearch'
import { isGlobalSearchType } from '~/utils/globalSearch'

/** url_hint.page → 详情页路径 */
export const SEARCH_DETAIL_ROUTES: Record<GlobalSearchType, (id: number) => string> = {
  dn: (id) => `/dn/detail/${id}`,
  asn: (id) => `/asn/detail/${id}`,
  sorting: (id) => `/sorting/detail/${id}`,
  picking: (id) => `/picking/detail/${id}`,
  packing: (id) => `/packing/detail/${id}`,
  delivery: (id) => `/delivery/detail/${id}`,
  cyclecount: (id) => `/cyclecount/detail/${id}`,
  adjustment: (id) => `/adjustment/detail/${id}`,
  goods: (id) => `/goods/detail/${id}`,
  location: (id) => `/location/detail/${id}`,
  recipient: (id) => `/recipient/detail/${id}`,
}

/** url_hint（结果本身，或任务列 related_url_hint 指向的关联单据）→ 页面路径；不认识的 page 返回 null */
export function searchHintPath(hint: Partial<GlobalSearchUrlHint> | null | undefined): string | null {
  if (!hint || !isGlobalSearchType(hint.page)) return null
  const id = Number(hint.id)
  if (!Number.isInteger(id) || id <= 0) return null
  return SEARCH_DETAIL_ROUTES[hint.page](id)
}

export interface SearchOpenTarget {
  path: string
  /** 要先把页头当前仓库切到这个仓库（null = 不用切） */
  switchWarehouseId: number | null
}

/**
 * 打开一条结果（或任务的关联单据：url_hint 传 related_url_hint、warehouse_id 传任务的仓库）去哪里。
 * 仓库级记录（有 warehouse_id）不在页头的当前仓库时（「全部仓库」范围搜到的），详情页的接口按当前仓库校验归属
 * （别的仓库 403），要先切到记录所在的仓库；当前是「全部仓库」（null）时不用切。
 */
export function searchItemTarget(
  item: Partial<Pick<GlobalSearchItem, 'type' | 'id' | 'url_hint'>> & Pick<GlobalSearchItem, 'warehouse_id'>,
  currentWarehouseId: number | string | null | undefined,
): SearchOpenTarget | null {
  const path = searchHintPath(item.url_hint ?? (item.type ? { page: item.type, id: item.id } : null))
  if (!path) return null
  const current = currentWarehouseId === null || currentWarehouseId === undefined || currentWarehouseId === ''
    ? null : String(currentWarehouseId)
  const switchWarehouseId = item.warehouse_id !== null && current !== null && String(item.warehouse_id) !== current
    ? item.warehouse_id : null
  return { path, switchWarehouseId }
}

/** 结果页的路由参数：q 关键字、type 页签（all / 某一类）、scope 范围、page 页码（单类型页签） */
export interface SearchPageParams {
  q: string
  type: GlobalSearchType | 'all'
  scope: GlobalSearchScope
  page: number
}

const first = (value: LocationQuery[string] | undefined): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === null || raw === undefined ? '' : String(raw)
}

/** 路由 query → 结果页参数（不认识的值按默认） */
export function parseSearchPageQuery(query: LocationQuery): SearchPageParams {
  const type = first(query.type)
  const page = Number.parseInt(first(query.page), 10)
  return {
    q: first(query.q).trim(),
    type: isGlobalSearchType(type) ? type : 'all',
    scope: first(query.scope) === 'all' ? 'all' : 'warehouse',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** 结果页的路由（默认值不写进地址） */
export function searchPageLocation(params: Partial<SearchPageParams> & { q: string }): RouteLocationRaw {
  const query: Record<string, string> = { q: params.q.trim() }
  if (params.type && params.type !== 'all') query.type = params.type
  if (params.scope === 'all') query.scope = 'all'
  if (params.page && params.page > 1 && params.type && params.type !== 'all') query.page = String(params.page)
  return { path: '/search', query }
}
