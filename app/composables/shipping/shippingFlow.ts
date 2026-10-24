/**
 * 出库单的发货流程（后端 GET /warehouse/dn/<id>/shipping-flow，设计见后端 doc/shipping-flow.md §5）
 *
 * 一张出库单一条流程：下单 → 拣货 → 打包 →（跨境时）报关单证 → 运单 → 揽收 → 交承运商 → 运输中 → 签收。
 * 每一步的状态、实际发生时刻、来源和能做的操作都由后端给（界面不自己推算状态），操作按 actions[].key 接到已有接口：
 * - create_waybill / cancel_waybill / dismiss_waybill / print_label → /dn/<id>/carrier-shipment（CarrierShipmentPanel）
 * - enter_tracking → PUT /delivery/<task>/tracking {tracking_number, carrier_id}
 * - book_pickup → 承运商在线预约（CarrierPickupModal）；record_pickup → POST /dn/carrier-pickups/manual；
 *   cancel_pickup → POST /dn/carrier-pickups/<id>/cancel
 * - complete_shipping → PUT /delivery/<task>/process/（还没开始时）→ PUT /delivery/<task>/complete/（可带 shipped_at）
 * - refresh_tracking → POST /dn/<id>/carrier-shipment/track；open_tracking → 承运商公开查询页（新标签页）
 * - sign → PUT /delivery/<task>/sign/ {signed_at}
 * - issue_documents → POST /dn/<id>/customs-documents/issue；edit_packages → PUT /dn/<id>/packages（DnPackagesEditor）
 * - export_file → POST /dn/carrier-files/export（文件下载）；import_numbers → POST /dn/carrier-files/import（预览 → 确认）；
 *   discard_export → POST /dn/<id>/carrier-shipment/discard-export（FlowWaybillFileDetail，文件方式见 carrierFile.ts）
 */

export type FlowStepKey =
  | 'ordered' | 'picking' | 'packing' | 'documents' | 'waybill' | 'pickup' | 'handover' | 'transit' | 'delivered'

/** done 已完成 / current 现在该做 / todo 还没到 / warning 要人处理 / blocked 前一步没完成 / skipped 不适用 */
export type FlowStepState = 'done' | 'current' | 'todo' | 'warning' | 'blocked' | 'skipped'

/** 这一步由谁完成：仓库（人工）/ 承运商（跟踪）/ 规则（如自动视为签收）/ 来源系统（下单方）/ 系统 */
export type FlowSource = 'warehouse' | 'carrier' | 'rule' | 'api' | 'system'

/** 列表用的阶段（DN 列表 shipping_stage，与流程接口的 stage 同一口径） */
export type ShippingStage =
  | 'preparing' | 'awaiting_waybill' | 'awaiting_number' | 'awaiting_pickup' | 'awaiting_handover'
  | 'in_transit' | 'exception' | 'delivered' | 'closed'

export type WaybillMethod = 'api' | 'file' | 'manual'
export type PickupMethod = 'api' | 'manual' | 'scheduled' | 'dropoff' | 'none'
export type TrackingMethod = 'api' | 'link' | 'none'

export interface FlowAction {
  key: string
  enabled: boolean
  /** enabled = false 时为什么不能做（后端的英文句子） */
  reason?: string | null
  /** enabled = false 时的原因码（界面按它翻译，见 flowActionReasonKeys）；旧后端没有 */
  reason_code?: string | null
  /** 操作带的其它字段（delivery_task_id、document_id、pickup_id、url……） */
  [extra: string]: unknown
}

/** 流程的一步（出库 / 入库流程共用的结构；key 由各自的流程定） */
export interface FlowStepBase<K extends string = string> {
  key: K
  state: FlowStepState
  /** 这一步实际发生的时刻（带时区偏移的 ISO 8601）；没发生为 null */
  at: string | null
  source: FlowSource | null
  summary: Record<string, any>
  actions: FlowAction[]
}

/** 出库流程的一步 */
export type FlowStep = FlowStepBase<FlowStepKey>

/** 横向进度条的一个阶段：合并哪几步（key 为文案键名） */
export interface FlowStageGroup {
  key: string
  steps: string[]
}

export interface FlowProblem {
  code: string
  level: 'error' | 'warning'
  message?: string | null
  /** 问题出在哪一步 */
  step?: FlowStepKey | string | null
  /** 问题带的其它字段（goods_code、field、date……） */
  [extra: string]: unknown
}

export interface FlowRoute {
  origin_country: string | null
  destination_country: string | null
  /** 发货国 ≠ 收件国（任一方未知时按国内） */
  international: boolean
  /** 跨境且不在同一关税同盟（或有报关快照）：要报关单证 */
  requires_customs: boolean
}

/** 定期集荷（pickup_method = scheduled）：ISO 星期（1 = 周一）与时间段 */
export interface PickupSchedule {
  weekdays: number[]
  ready_time: string | null
  close_time: string | null
}

export interface FlowCarrier {
  id: number
  name: string
  code: string | null
  /** 在线对接的插件代码（如 fedex）；没有对接为 null */
  integration: string | null
  methods: { waybill: WaybillMethod; pickup: PickupMethod; tracking: TrackingMethod }
  /** 交承运商后 N 天自动视为签收；null = 关 */
  auto_sign_days: number | null
  /** 公开查询页（已带运单号）；没有为 null */
  tracking_url: string | null
}

export interface ShippingFlow {
  dn_id: number
  dn_status: string
  order_number: string | null
  route: FlowRoute
  carrier: FlowCarrier | null
  stage: ShippingStage
  steps: FlowStep[]
  problems: FlowProblem[]
  tasks: { picking: number[]; packing: number[]; delivery: number | null }
  /** DN 所属仓库（揽收按仓库约）；接口没给时由页面传入 */
  warehouse_id?: number | null
}

export const shippingFlowUrl = (dnId: number | string) => `/api/warehouse/dn/${dnId}/shipping-flow`

export const FLOW_STEP_KEYS: FlowStepKey[] = [
  'ordered', 'picking', 'packing', 'documents', 'waybill', 'pickup', 'handover', 'transit', 'delivered',
]

/** 横向进度条的阶段：「发货准备」合并单证、运单、揽收三步 */
export const FLOW_STAGE_GROUPS: FlowStageGroup[] = [
  { key: 'ordered', steps: ['ordered'] },
  { key: 'picking', steps: ['picking'] },
  { key: 'packing', steps: ['packing'] },
  { key: 'preparing', steps: ['documents', 'waybill', 'pickup'] },
  { key: 'handover', steps: ['handover'] },
  { key: 'transit', steps: ['transit'] },
  { key: 'delivered', steps: ['delivered'] },
]

/** 列表的工作队列（DN 列表的页签；awaiting_number = 文件方式已导出、等导回运单号） */
export const SHIPPING_STAGE_TABS: ShippingStage[] = [
  'preparing', 'awaiting_waybill', 'awaiting_number', 'awaiting_pickup', 'awaiting_handover', 'in_transit', 'exception',
  'delivered', 'closed',
]

/** 文件方式的批量操作所在的页签：待建运单（批量导出）、待导回（批量导入） */
export const FILE_BATCH_STAGES: ShippingStage[] = ['awaiting_waybill', 'awaiting_number']

/** 界面不显示的操作（现在没有；留着给以后还没接上的操作用） */
export const HIDDEN_ACTIONS: string[] = []

/** 文件方式的运单操作 */
export const FILE_WAYBILL_ACTIONS = ['export_file', 'import_numbers', 'discard_export']

const STAGE_COLORS: Record<string, string> = {
  preparing: 'secondary',
  awaiting_waybill: 'warning',
  awaiting_number: 'warning',
  awaiting_pickup: 'info',
  awaiting_handover: 'primary',
  in_transit: 'primary',
  exception: 'danger',
  delivered: 'success',
  closed: 'light',
}

/** 阶段徽章的颜色（Bootstrap 主题色名） */
export const shippingStageColor = (stage: string | null | undefined): string => STAGE_COLORS[String(stage || '')] || 'light'

const STATE_ORDER: FlowStepState[] = ['done', 'current', 'todo', 'warning', 'blocked', 'skipped']
const toState = (value: unknown): FlowStepState =>
  (STATE_ORDER as string[]).includes(String(value)) ? (value as FlowStepState) : 'todo'

const toStringOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

const toIdList = (v: unknown): number[] =>
  (Array.isArray(v) ? v : []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)

export const normalizeFlowActions = (v: unknown): FlowAction[] =>
  (Array.isArray(v) ? v : [])
    .filter((a: any) => a && typeof a === 'object' && a.key)
    .map((a: any) => ({
      ...a,
      key: String(a.key),
      enabled: !!a.enabled,
      reason: toStringOrNull(a.reason),
      reason_code: toStringOrNull(a.reason_code),
    }))

/** 接口返回的 steps → 流程的步骤（状态不认识的按 todo；出库 / 入库流程共用） */
export const normalizeFlowSteps = <K extends string = string>(v: unknown): FlowStepBase<K>[] =>
  (Array.isArray(v) ? v : [])
    .filter((s: any) => s && typeof s === 'object' && s.key)
    .map((s: any) => ({
      key: String(s.key) as K,
      state: toState(s.state),
      at: toStringOrNull(s.at),
      source: (toStringOrNull(s.source) as FlowSource | null),
      summary: s.summary && typeof s.summary === 'object' ? s.summary : {},
      actions: normalizeFlowActions(s.actions),
    }))

/** 接口返回的 problems → 流程的问题（出库 / 入库流程共用） */
export const normalizeFlowProblems = (v: unknown): FlowProblem[] =>
  (Array.isArray(v) ? v : [])
    .filter((p: any) => p && typeof p === 'object' && p.code)
    .map((p: any) => ({
      ...p,
      code: String(p.code),
      level: p.level === 'error' ? 'error' : 'warning',
      message: toStringOrNull(p.message),
      step: toStringOrNull(p.step),
    }))

/** 接口返回 → 流程（缺的数组补空，状态不认识的按 todo），不是对象时返回 null */
export const normalizeShippingFlow = (data: any): ShippingFlow | null => {
  if (!data || typeof data !== 'object') return null
  const steps: FlowStep[] = normalizeFlowSteps<FlowStepKey>(data.steps)
  const route = data.route && typeof data.route === 'object' ? data.route : {}
  const tasks = data.tasks && typeof data.tasks === 'object' ? data.tasks : {}
  const carrier = data.carrier && typeof data.carrier === 'object' ? data.carrier : null
  const methods = carrier?.methods && typeof carrier.methods === 'object' ? carrier.methods : {}
  return {
    dn_id: Number(data.dn_id),
    dn_status: String(data.dn_status || ''),
    order_number: toStringOrNull(data.order_number),
    route: {
      origin_country: toStringOrNull(route.origin_country),
      destination_country: toStringOrNull(route.destination_country),
      international: !!route.international,
      requires_customs: !!route.requires_customs,
    },
    carrier: carrier
      ? {
          id: Number(carrier.id),
          name: String(carrier.name ?? carrier.code ?? ''),
          code: toStringOrNull(carrier.code),
          integration: toStringOrNull(carrier.integration),
          methods: {
            waybill: (toStringOrNull(methods.waybill) || 'manual') as WaybillMethod,
            pickup: (toStringOrNull(methods.pickup) || 'none') as PickupMethod,
            tracking: (toStringOrNull(methods.tracking) || 'none') as TrackingMethod,
          },
          auto_sign_days: carrier.auto_sign_days === null || carrier.auto_sign_days === undefined
            ? null : Number(carrier.auto_sign_days),
          tracking_url: toStringOrNull(carrier.tracking_url),
        }
      : null,
    stage: String(data.stage || 'preparing') as ShippingStage,
    steps,
    problems: normalizeFlowProblems(data.problems),
    tasks: {
      picking: toIdList(tasks.picking),
      packing: toIdList(tasks.packing),
      delivery: tasks.delivery === null || tasks.delivery === undefined || tasks.delivery === '' ? null : Number(tasks.delivery),
    },
    warehouse_id: data.warehouse_id === null || data.warehouse_id === undefined ? null : Number(data.warehouse_id),
  }
}

/** 某一步的某个操作（没有为 null） */
export const flowActionOf = (step: FlowStepBase | null | undefined, key: string): FlowAction | null =>
  step?.actions.find((a: FlowAction) => a.key === key) || null

/**
 * 操作不能做的原因（actions[].reason_code）按顺序查的文案：流程自己的原因码、建运单的拦截码、预约揽收的拦截码、报关问题码；
 * 都没有时显示后端的英文原因
 */
export const flowActionReasonKeys = (code: string | null | undefined): string[] => (code
  ? [`shipping.action-reasons.${code}`, `customs.carrier.blockers.${code}`, `delivery.pickup.blockers.${code}`,
      `customs.problems.${code}`]
  : [])

/** 某个操作能不能做：后端给了这个操作按 enabled；没给时用 fallback（旧后端 / 没列出的） */
export const flowActionEnabled = (step: FlowStepBase | null | undefined, key: string, fallback = false): boolean => {
  const action = flowActionOf(step, key)
  return action ? action.enabled : fallback
}

/**
 * 几步合成一个阶段（横向进度条）的状态：有要人处理的 → warning；有现在该做的或部分完成 → current；
 * 都完成（不适用的不算）→ done；都被挡着 → blocked；都不适用 → skipped；否则 todo
 */
export const groupState = (states: FlowStepState[]): FlowStepState => {
  const relevant = states.filter((s) => s !== 'skipped')
  if (relevant.length === 0) return 'skipped'
  if (relevant.includes('warning')) return 'warning'
  if (relevant.includes('current')) return 'current'
  if (relevant.every((s) => s === 'done')) return 'done'
  if (relevant.some((s) => s === 'done')) return 'current'
  if (relevant.every((s) => s === 'blocked')) return 'blocked'
  return 'todo'
}

/** 默认展开的一步：第一个要人处理 / 现在该做的；都没有时最后一个已完成的 */
export const activeStepKey = <S extends FlowStepBase>(steps: S[]): S['key'] | null => {
  const pending = steps.find((s: S) => s.state === 'warning' || s.state === 'current')
  if (pending) return pending.key
  const done = steps.filter((s: S) => s.state === 'done')
  return done.length ? (done[done.length - 1] as S).key : null
}

/** 运单来源（api / file / manual） */
export type WaybillSource = 'api' | 'file' | 'manual'

/** ISO 星期（1 = 周一 … 7 = 周日） */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

/** 'HH:MM' 的时间（定期集荷、揽收时间段）：合法返回 true */
export const isTimeText = (value: string | null | undefined): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim())
