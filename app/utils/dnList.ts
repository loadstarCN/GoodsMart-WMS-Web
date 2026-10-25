/**
 * 发货单列表（设计稿 DnList.dc.html）每一行的显示规则：阶段的圆点颜色、9 段进度条、「下一步」、计划发货日。
 * 列表接口只给阶段（shipping_stage，与流程接口同一口径）、单据状态、是否报关件、承运商与运单号，
 * 这里按它们推出来；详细的状态以发货单详情（流程接口）为准。
 */

/** 发货阶段（列表的页签；与 composables/shipping/shippingFlow 的 ShippingStage 相同） */
export type DnStage =
  | 'preparing' | 'awaiting_waybill' | 'awaiting_number' | 'awaiting_pickup' | 'awaiting_handover'
  | 'in_transit' | 'exception' | 'delivered' | 'closed'

/** 圆点的语义：需处理琥珀 / 进行中紫 / 完成绿 / 异常红 / 未开始灰 */
export type DnTone = 'warn' | 'info' | 'ok' | 'bad' | 'none'

/** 页签顺序（全部在最前，由页面加） */
export const DN_STAGE_TABS: DnStage[] = [
  'preparing', 'awaiting_waybill', 'awaiting_number', 'awaiting_pickup', 'awaiting_handover', 'in_transit', 'exception',
  'delivered', 'closed',
]

/** 仓库要动手的阶段：页签名前加琥珀点 */
export const DN_ATTENTION_STAGES: DnStage[] = ['awaiting_waybill', 'awaiting_number', 'awaiting_pickup', 'awaiting_handover']

/** 单据状态（筛选下拉） */
export const DN_STATUSES = ['pending', 'in_progress', 'picked', 'packed', 'delivered', 'completed', 'closed'] as const

export const isDnStage = (value: unknown): value is DnStage => (DN_STAGE_TABS as string[]).includes(String(value))

/** 阶段的圆点：作业中按单据状态分（待处理灰、拣货 / 打包中紫） */
export function dnStageTone(stage: string | null | undefined, status?: string | null): DnTone {
  switch (stage) {
    case 'awaiting_waybill':
    case 'awaiting_number':
    case 'awaiting_pickup':
    case 'awaiting_handover':
      return 'warn'
    case 'preparing':
      return status === 'pending' ? 'none' : 'info'
    case 'in_transit':
      return 'info'
    case 'exception':
      return 'bad'
    case 'delivered':
      return 'ok'
    default:
      return 'none'
  }
}

/** 进度条一段：走过 / 当前 / 没到 / 不适用（国内件的报关单证） */
export type DnSegment = 'done' | 'current' | 'todo' | 'skip'

/** 9 段 = 下单 · 拣货 · 打包 · 报关单证 · 运单 · 揽收 · 交承运商 · 运输中 · 签收 */
export const DN_PROGRESS_STEPS = 9

/**
 * 当前走到第几段（0 起）；全部完成为 9，关闭为 -1。
 * 异常没有具体是哪一步：已发货算运输中，有运单号算揽收，否则算运单
 */
export function dnProgressIndex(stage: string | null | undefined, status?: string | null, hasTracking = false): number {
  switch (stage) {
    case 'preparing':
      return status === 'picked' ? 2 : 1
    case 'awaiting_waybill':
    case 'awaiting_number':
      return 4
    case 'awaiting_pickup':
      return 5
    case 'awaiting_handover':
      return 6
    case 'in_transit':
      return 7
    case 'delivered':
      return DN_PROGRESS_STEPS
    case 'exception':
      if (status === 'delivered' || status === 'completed') return 7
      return hasTracking ? 5 : 4
    default:
      return -1
  }
}

/** 9 段进度条：走过的 done、当前 current（未开始的作业中不点亮，算 todo）、国内件的报关单证 skip */
export function dnProgressSegments(stage: string | null | undefined, status?: string | null,
  options: { customs?: boolean; hasTracking?: boolean } = {}): DnSegment[] {
  const index = dnProgressIndex(stage, status, !!options.hasTracking)
  const tone = dnStageTone(stage, status)
  return Array.from({ length: DN_PROGRESS_STEPS }, (_, i) => {
    if (i === 3 && !options.customs) return 'skip'
    if (i < index) return 'done'
    if (i === index && tone !== 'none') return 'current'
    return 'todo'
  })
}

export interface DnCarrierInfo {
  id: number
  waybill_method?: string | null
  pickup_method?: string | null
  tracking_method?: string | null
  tracking_url_template?: string | null
}

/**
 * 「下一步」：
 * - action：要仓库做的事（按钮；progress 直接开始作业、export 直接导出、import 打开导回运单号，其余进详情）
 * - problem：异常（红字描边按钮，进详情）
 * - info：一行灰字（拣货中、签收日）
 * - link：承运商查询页（新标签页）
 * key 是 dn.list.next.* 的文案键
 */
export interface DnNextStep {
  kind: 'action' | 'problem' | 'info' | 'link' | 'none'
  key: string
  /** action 的做法 */
  run?: 'progress' | 'export' | 'import' | 'open'
  /** link 的地址 */
  href?: string
}

const fillTemplate = (template: string, tracking: string) =>
  template.replace(/\{tracking_number\}/g, encodeURIComponent(tracking))

export function dnNextStep(row: {
  shipping_stage?: string | null
  status?: string | null
  shipping?: { carrier_id?: number | null; tracking_number?: string | null } | null
  carrier_id?: number | null
}, carrier: DnCarrierInfo | null | undefined): DnNextStep {
  const stage = row.shipping_stage
  const status = row.status
  const tracking = String(row.shipping?.tracking_number || '').trim()
  switch (stage) {
    case 'preparing':
      if (status === 'pending') return { kind: 'action', key: 'start', run: 'progress' }
      return { kind: 'info', key: status === 'picked' ? 'packing' : 'picking' }
    case 'awaiting_waybill': {
      const method = carrier?.waybill_method
      if (!carrier) return { kind: 'action', key: 'choose-carrier', run: 'open' }
      if (method === 'file') return { kind: 'action', key: 'export', run: 'export' }
      if (method === 'api') return { kind: 'action', key: 'create-waybill', run: 'open' }
      return { kind: 'action', key: 'enter-tracking', run: 'open' }
    }
    case 'awaiting_number':
      return { kind: 'action', key: 'import', run: 'import' }
    case 'awaiting_pickup':
      return { kind: 'action', key: carrier?.pickup_method === 'manual' ? 'record-pickup' : 'book-pickup', run: 'open' }
    case 'awaiting_handover':
      return { kind: 'action', key: 'complete', run: 'open' }
    case 'in_transit':
      if (tracking && carrier?.tracking_url_template) {
        return { kind: 'link', key: 'tracking-page', href: fillTemplate(carrier.tracking_url_template, tracking) }
      }
      return { kind: 'none', key: '' }
    case 'exception':
      return { kind: 'problem', key: 'resolve', run: 'open' }
    case 'delivered':
      return { kind: 'info', key: 'signed' }
    default:
      return { kind: 'none', key: '' }
  }
}

export interface DnDateText {
  /** MM/DD（不是今年时 YYYY/MM/DD） */
  text: string
  isToday: boolean
}

/** 计划发货日（YYYY-MM-DD，仓库当地的日期）对照仓库的今天 */
export function dnPlannedDate(value: string | null | undefined, today: string): DnDateText | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return null
  const sameYear = today.slice(0, 4) === m[1]
  return { text: sameYear ? `${m[2]}/${m[3]}` : `${m[1]}/${m[2]}/${m[3]}`, isToday: `${m[1]}-${m[2]}-${m[3]}` === today }
}

/** 列表的筛选参数（URL 里的，不含页码、阶段）：页签数量按它请求 */
export const DN_FILTER_KEYS = ['keyword', 'status', 'carrier_id', 'dn_type', 'recipient_id'] as const

export function dnFilterParams(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of DN_FILTER_KEYS) {
    const raw = query[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value !== undefined && value !== null && String(value).trim() !== '') out[key] = String(value).trim()
  }
  return out
}

/** 勾选的发货单要一起导出：同一家承运商（返回它的 id）；没有承运商的、混了不同承运商的分别列出 */
export function dnExportCarrier(rows: { id: number; carrier_id?: number | null; shipping?: { carrier_id?: number | null } | null }[]): {
  carrierId: number | null
  missing: number[]
  mixed: boolean
} {
  const ids = rows.map((row) => {
    const id = row.shipping?.carrier_id ?? row.carrier_id
    return id === null || id === undefined ? null : Number(id)
  })
  const missing = rows.filter((_, i) => ids[i] === null).map((row) => row.id)
  const distinct = [...new Set(ids.filter((id): id is number => id !== null))]
  return { carrierId: distinct.length === 1 && missing.length === 0 ? distinct[0]! : null, missing, mixed: distinct.length > 1 }
}
