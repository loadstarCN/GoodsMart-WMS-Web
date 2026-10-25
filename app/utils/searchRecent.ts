/**
 * 搜索面板的「最近搜索」：只存在这台浏览器里（localStorage，按用户分开存），后端不存。
 * 读写失败（隐私模式、存储被禁用、内容损坏）时当作没有，不影响搜索。
 * 每条记一个提示：打开了哪类结果（type，命中运单号时记 field）或结果页上的条数（count），显示时再翻译。
 */

export interface RecentSearchHint {
  type?: string
  field?: string
  count?: number
}

export interface RecentSearch {
  q: string
  hint?: RecentSearchHint
}

export const RECENT_SEARCH_MAX = 8
const MAX_QUERY_LENGTH = 100

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>

/** 存储的键：按用户分开（同一台电脑换人登录各看各的） */
export const recentSearchKey = (userId: string | number | null | undefined): string =>
  userId === null || userId === undefined || userId === '' ? 'w.search.recent' : `w.search.recent.${userId}`

const sameQuery = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const cleanHint = (raw: any): RecentSearchHint | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const hint: RecentSearchHint = {}
  if (typeof raw.type === 'string' && raw.type) hint.type = raw.type
  if (typeof raw.field === 'string' && raw.field) hint.field = raw.field
  if (typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count >= 0) hint.count = Math.trunc(raw.count)
  return Object.keys(hint).length ? hint : undefined
}

/** 存储里的 JSON → 列表（格式不对的条目丢掉、去重、最多 RECENT_SEARCH_MAX 条） */
export function parseRecentSearches(raw: string | null | undefined): RecentSearch[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const list: RecentSearch[] = []
  for (const entry of data) {
    const q = typeof entry?.q === 'string' ? entry.q.trim().slice(0, MAX_QUERY_LENGTH) : ''
    if (!q || list.some((item) => sameQuery(item.q, q))) continue
    const hint = cleanHint(entry.hint)
    list.push(hint ? { q, hint } : { q })
    if (list.length >= RECENT_SEARCH_MAX) break
  }
  return list
}

/** 记一次搜索：放到最前面（同一关键字不分大小写只留一条，提示换成这次的），超出上限的去掉 */
export function addRecentSearch(list: readonly RecentSearch[], q: string, hint?: RecentSearchHint, max = RECENT_SEARCH_MAX): RecentSearch[] {
  const query = q.trim().slice(0, MAX_QUERY_LENGTH)
  if (!query) return [...list]
  const cleaned = cleanHint(hint)
  const entry: RecentSearch = cleaned ? { q: query, hint: cleaned } : { q: query }
  return [entry, ...list.filter((item) => !sameQuery(item.q, query))].slice(0, Math.max(1, max))
}

/** 删掉一条 */
export function removeRecentSearch(list: readonly RecentSearch[], q: string): RecentSearch[] {
  return list.filter((item) => !sameQuery(item.q, q))
}

/** 读（存储不可用时空列表） */
export function readRecentSearches(storage: ReadableStorage | null | undefined, key: string): RecentSearch[] {
  try {
    return parseRecentSearches(storage?.getItem(key))
  } catch {
    return []
  }
}

/** 写（空列表时删掉这个键）；存储不可用时返回 false，只在本次打开期间有效 */
export function writeRecentSearches(storage: WritableStorage | null | undefined, key: string, list: readonly RecentSearch[]): boolean {
  if (!storage) return false
  try {
    if (list.length === 0) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(list.slice(0, RECENT_SEARCH_MAX)))
    return true
  } catch {
    return false
  }
}
