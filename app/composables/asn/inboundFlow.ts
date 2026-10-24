/**
 * 入库单的入库流程（后端 GET /warehouse/asn/<id>/flow，设计见后端 doc/shipping-flow.md §7.1）
 *
 * 一张入库单一条（轻量的）流程：创建 / 预计到货 → 在途（入库单的运单号）→ 到货收货 → 分拣 → 上架 → 完成。
 * 结构与出库流程相同（steps[].state / at / source / summary / actions，见 shippingFlow.ts），界面用同一套组件
 * （ShippingFlowStepper / ShippingFlowStep / FlowTransitDetail）。操作按 actions[].key 接到已有接口：
 * - refresh_tracking → POST /asn/<id>/track（只存跟踪结果，不自动收货）；open_tracking → 承运商公开查询页（新标签页）
 * - receive → PUT /asn/<id>/receive/
 * 分拣任务的入口在 sorting 一步的 summary.task_ids（/sorting/detail/<id>）。
 */
import {
  normalizeFlowProblems,
  normalizeFlowSteps,
  type FlowProblem,
  type FlowStageGroup,
  type FlowStepBase,
} from '~/composables/shipping/shippingFlow'

export type InboundStepKey = 'created' | 'in_transit' | 'received' | 'sorting' | 'putaway' | 'completed'

/** 列表用的阶段（ASN 列表 inbound_stage，与流程接口的 stage 同一口径） */
export type InboundStage =
  | 'expected' | 'in_transit' | 'receiving' | 'sorting' | 'putaway' | 'completed' | 'closed' | 'exception'

export type InboundStep = FlowStepBase<InboundStepKey>

export interface InboundCarrier {
  id: number
  name: string
  code: string | null
  /** 在线对接的插件代码（如 fedex）；没有对接为 null */
  integration: string | null
  tracking_method: 'api' | 'link' | 'none'
  /** 公开查询页（已带运单号）；没有为 null */
  tracking_url: string | null
}

export interface InboundFlow {
  asn_id: number
  asn_status: string
  asn_type: string | null
  order_number: string | null
  warehouse_id: number | null
  expected_arrival_date: string | null
  closed_at: string | null
  supplier: { id: number; name: string } | null
  carrier: InboundCarrier | null
  tracking_number: string | null
  stage: InboundStage
  steps: InboundStep[]
  problems: FlowProblem[]
  tasks: { sorting: number[] }
}

export const inboundFlowUrl = (asnId: number | string) => `/api/warehouse/asn/${asnId}/flow`
export const inboundTrackUrl = (asnId: number | string) => `/api/warehouse/asn/${asnId}/track`

export const INBOUND_STEP_KEYS: InboundStepKey[] = ['created', 'in_transit', 'received', 'sorting', 'putaway', 'completed']

/** 横向进度条：一步一个阶段（阶段名用 asn.flow.steps.*） */
export const INBOUND_STAGE_GROUPS: FlowStageGroup[] = INBOUND_STEP_KEYS.map((key) => ({ key, steps: [key] }))

/** 列表的工作队列（ASN 列表的页签） */
export const INBOUND_STAGE_TABS: InboundStage[] = [
  'expected', 'in_transit', 'receiving', 'sorting', 'putaway', 'exception', 'completed', 'closed',
]

const STAGE_COLORS: Record<string, string> = {
  expected: 'secondary',
  in_transit: 'primary',
  receiving: 'warning',
  sorting: 'info',
  putaway: 'info',
  exception: 'danger',
  completed: 'success',
  closed: 'light',
}

/** 阶段徽章的颜色（Bootstrap 主题色名） */
export const inboundStageColor = (stage: string | null | undefined): string => STAGE_COLORS[String(stage || '')] || 'light'

const toStringOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const toIdList = (v: unknown): number[] =>
  (Array.isArray(v) ? v : []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)

/** 接口返回 → 入库流程（缺的数组补空，状态不认识的按 todo），不是对象时返回 null */
export const normalizeInboundFlow = (data: any): InboundFlow | null => {
  if (!data || typeof data !== 'object') return null
  const carrier = data.carrier && typeof data.carrier === 'object' ? data.carrier : null
  const supplier = data.supplier && typeof data.supplier === 'object' ? data.supplier : null
  const tasks = data.tasks && typeof data.tasks === 'object' ? data.tasks : {}
  const method = toStringOrNull(carrier?.tracking_method)
  return {
    asn_id: Number(data.asn_id),
    asn_status: String(data.asn_status || ''),
    asn_type: toStringOrNull(data.asn_type),
    order_number: toStringOrNull(data.order_number),
    warehouse_id: data.warehouse_id === null || data.warehouse_id === undefined ? null : Number(data.warehouse_id),
    expected_arrival_date: toStringOrNull(data.expected_arrival_date),
    closed_at: toStringOrNull(data.closed_at),
    supplier: supplier ? { id: Number(supplier.id), name: String(supplier.name ?? '') } : null,
    carrier: carrier
      ? {
          id: Number(carrier.id),
          name: String(carrier.name ?? carrier.code ?? ''),
          code: toStringOrNull(carrier.code),
          integration: toStringOrNull(carrier.integration),
          tracking_method: (method === 'api' || method === 'none' ? method : 'link'),
          tracking_url: toStringOrNull(carrier.tracking_url),
        }
      : null,
    tracking_number: toStringOrNull(data.tracking_number),
    stage: String(data.stage || 'expected') as InboundStage,
    steps: normalizeFlowSteps<InboundStepKey>(data.steps),
    problems: normalizeFlowProblems(data.problems),
    tasks: { sorting: toIdList(tasks.sorting) },
  }
}
