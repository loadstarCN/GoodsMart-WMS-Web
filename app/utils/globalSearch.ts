/**
 * 全局搜索（顶栏搜索面板 Ctrl K、搜索结果页 /search）的接口结构与共用规则。
 *
 * 接口 GET /api/warehouse/search（后端 warehouse/search/，README「Global Search」）：按类型分组，每组 total + 前几条；
 * 只指定一类时可分页，每条另带列表列 columns。只返回调用方有查看权限的类型。
 * 高亮切分见 utils/searchHighlight，跳转见 utils/searchRoutes，最近搜索见 utils/searchRecent。
 */
import type { WIconName } from '~/utils/icons'

/** 类型（= url_hint.page），也是默认的分组 / 页签顺序 */
export const GLOBAL_SEARCH_TYPES = [
  'dn', 'asn', 'sorting', 'picking', 'packing', 'delivery', 'cyclecount', 'adjustment', 'goods', 'location', 'recipient',
] as const
export type GlobalSearchType = typeof GLOBAL_SEARCH_TYPES[number]
export type GlobalSearchScope = 'warehouse' | 'all'

export interface GlobalSearchHighlight {
  /** code / title / subtitle / columns.<列> */
  field: string
  /** UTF-16 码元下标（与 JS 字符串下标一致），end 不含 */
  start: number
  end: number
}

export interface GlobalSearchUrlHint {
  page: string
  id: number
}

export interface GlobalSearchItem {
  type: GlobalSearchType
  id: number
  /** 单号（DN-163、PICK-5 …）/ 商品、库位编码；收货方没有 */
  code: string | null
  title: string | null
  /** 次要信息，各部分用「 · 」连接；命中在明细商品时带出该商品（编码 名称） */
  subtitle: string | null
  /** 原始状态值（单据 / 任务）；主数据为 null */
  status: string | null
  /** 仓库级记录的仓库；商品、收货方为 null */
  warehouse_id: number | null
  url_hint: GlobalSearchUrlHint | null
  matched_field: string | null
  /** 完整单号（带前缀）或完整运单号 */
  exact: boolean
  highlights: GlobalSearchHighlight[]
  /** 列表列：只在只搜一类（分页）时有 */
  columns: Record<string, any> | null
}

export interface GlobalSearchGroup {
  type: GlobalSearchType
  total: number
  page: number
  per_page: number
  pages: number
  items: GlobalSearchItem[]
}

export interface GlobalSearchResult {
  q: string
  scope: GlobalSearchScope
  /** 实际搜了的类型（请求的 ∩ 有权限的），按默认顺序 */
  types: GlobalSearchType[]
  counts: Partial<Record<GlobalSearchType, number>>
  exact_matches: GlobalSearchItem[]
  /** 每类一组；有完整单号 / 运单号命中的组排前面 */
  groups: GlobalSearchGroup[]
}

/** 每类的图标与名称（名称沿用侧栏菜单的译名 nav.*） */
export const GLOBAL_SEARCH_TYPE_META: Record<GlobalSearchType, { icon: WIconName; label: string }> = {
  dn: { icon: 'dn', label: 'nav.DN' },
  asn: { icon: 'asn', label: 'nav.ASN' },
  sorting: { icon: 'sorting', label: 'nav.sorting' },
  picking: { icon: 'picking', label: 'nav.picking' },
  packing: { icon: 'packing', label: 'nav.packing' },
  delivery: { icon: 'delivery', label: 'nav.delivery' },
  cyclecount: { icon: 'cycle', label: 'nav.cyclecount' },
  adjustment: { icon: 'adjust', label: 'nav.adjustment' },
  goods: { icon: 'goods', label: 'nav.goods' },
  location: { icon: 'location', label: 'nav.location' },
  recipient: { icon: 'recipient', label: 'nav.recipient' },
}

export const isGlobalSearchType = (value: unknown): value is GlobalSearchType =>
  typeof value === 'string' && (GLOBAL_SEARCH_TYPES as readonly string[]).includes(value)

const toInt = (value: unknown, fallback = 0): number => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}
const toText = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value))

const normalizeItem = (raw: any): GlobalSearchItem | null => {
  if (!raw || typeof raw !== 'object' || !isGlobalSearchType(raw.type)) return null
  const hint = raw.url_hint && typeof raw.url_hint === 'object' && raw.url_hint.page
    ? { page: String(raw.url_hint.page), id: toInt(raw.url_hint.id) }
    : null
  return {
    type: raw.type,
    id: toInt(raw.id),
    code: toText(raw.code),
    title: toText(raw.title),
    subtitle: toText(raw.subtitle),
    status: toText(raw.status),
    warehouse_id: raw.warehouse_id === null || raw.warehouse_id === undefined ? null : toInt(raw.warehouse_id),
    url_hint: hint,
    matched_field: toText(raw.matched_field),
    exact: raw.exact === true,
    highlights: (Array.isArray(raw.highlights) ? raw.highlights : [])
      .filter((h: any) => h && typeof h.field === 'string')
      .map((h: any) => ({ field: h.field, start: toInt(h.start), end: toInt(h.end) })),
    columns: raw.columns && typeof raw.columns === 'object' ? raw.columns : null,
  }
}

const normalizeItems = (list: unknown): GlobalSearchItem[] =>
  (Array.isArray(list) ? list : []).map(normalizeItem).filter((item): item is GlobalSearchItem => item !== null)

/** 接口返回的结果规整一遍（缺字段给默认值、去掉不认识的类型），界面只认规整后的结构 */
export function normalizeSearchResult(data: any): GlobalSearchResult {
  const groups: GlobalSearchGroup[] = (Array.isArray(data?.groups) ? data.groups : [])
    .filter((g: any) => g && isGlobalSearchType(g.type))
    .map((g: any) => ({
      type: g.type,
      total: Math.max(0, toInt(g.total)),
      page: Math.max(1, toInt(g.page, 1)),
      per_page: Math.max(1, toInt(g.per_page, 5)),
      pages: Math.max(0, toInt(g.pages)),
      items: normalizeItems(g.items),
    }))
  const types: GlobalSearchType[] = (Array.isArray(data?.types) ? data.types : groups.map((g) => g.type)).filter(isGlobalSearchType)
  const counts: Partial<Record<GlobalSearchType, number>> = {}
  for (const type of types) {
    const value = data?.counts?.[type]
    counts[type] = value === undefined ? (groups.find((g) => g.type === type)?.total ?? 0) : Math.max(0, toInt(value))
  }
  return {
    q: String(data?.q ?? ''),
    scope: data?.scope === 'all' ? 'all' : 'warehouse',
    types: GLOBAL_SEARCH_TYPES.filter((type) => types.includes(type)),
    counts,
    exact_matches: normalizeItems(data?.exact_matches),
    groups,
  }
}

/** 结果总数（各类合计） */
export function searchResultTotal(result: Pick<GlobalSearchResult, 'counts'> | null | undefined): number {
  if (!result) return 0
  return Object.values(result.counts).reduce<number>((sum, count) => sum + (count || 0), 0)
}

/** 同一条（类型 + id） */
export const sameSearchItem = (a: GlobalSearchItem | null | undefined, b: GlobalSearchItem | null | undefined): boolean =>
  !!a && !!b && a.type === b.type && a.id === b.id

/** 某个显示字段（code / title …）整段被高亮：商品编码 / 名称与关键字完全相同 */
const fullyHighlighted = (item: GlobalSearchItem, field: 'code' | 'title'): boolean => {
  const text = item[field]
  if (!text) return false
  return item.highlights.some((h) => h.field === field && h.start <= 0 && h.end >= text.length)
}

/**
 * 最佳匹配（面板、结果页置顶，Enter 直接打开）：完整单号 / 完整运单号（exact_matches 第一项）；
 * 没有时，商品组第一条的编码或名称与关键字完全相同也算（后端商品编码相同不标 exact，按高亮是否整段判断）。
 */
export function pickBestMatch(result: GlobalSearchResult | null | undefined): GlobalSearchItem | null {
  if (!result) return null
  const exact = result.exact_matches[0]
  if (exact) return exact
  const goods = result.groups.find((g) => g.type === 'goods')?.items[0]
  if (goods && (fullyHighlighted(goods, 'code') || fullyHighlighted(goods, 'title'))) return goods
  return null
}

/** 命中在单据 / 任务的明细商品上（副标题里带出的是该商品，界面在它前面写「含」） */
export const matchedInDetailGoods = (item: GlobalSearchItem): boolean =>
  item.type !== 'goods' && (item.matched_field === 'goods_code' || item.matched_field === 'goods_name')

export type SearchStatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'none'

/** 单据 / 任务状态 → 状态点的语义（未开始灰、进行中紫、完成绿） */
const STATUS_TONES: Record<string, SearchStatusTone> = {
  pending: 'none',
  in_progress: 'info',
  received: 'info',
  picked: 'info',
  packed: 'info',
  delivered: 'info',
  approved: 'info',
  completed: 'ok',
  signed: 'ok',
  closed: 'none',
  cancelled: 'none',
}
export const searchStatusTone = (status: string | null | undefined): SearchStatusTone =>
  STATUS_TONES[String(status || '')] || 'none'

/** 发货阶段（DN 的 shipping_stage）→ 状态点：待仓库处理的琥珀、异常红、已签收绿 */
const STAGE_TONES: Record<string, SearchStatusTone> = {
  preparing: 'info',
  awaiting_waybill: 'warn',
  awaiting_number: 'warn',
  awaiting_pickup: 'warn',
  awaiting_handover: 'warn',
  in_transit: 'info',
  exception: 'bad',
  delivered: 'ok',
  closed: 'none',
}
export const shippingStageTone = (stage: string | null | undefined): SearchStatusTone =>
  STAGE_TONES[String(stage || '')] || 'none'

/** 状态译名的 key：common.status.<值>，下划线换成短横线（同各列表页） */
export const searchStatusKey = (status: string): string => `common.status.${status.replace(/_/g, '-')}`
