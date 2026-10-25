/**
 * 发货单详情（设计稿 Main.dc.html）的流程显示规则：三段进度（仓内作业 / 发货准备 / 交接与运输，每段三步）、
 * 当前步骤卡的「第 N 步，共 M 步」、处理记录的顺序、同时能做的其它步骤、商品数量差异。
 * 步骤的状态由后端给（流程接口），这里只做显示上的归并。
 */

export type FlowStateLike = 'done' | 'current' | 'todo' | 'warning' | 'blocked' | 'skipped'

export interface StepLike {
  key: string
  state: FlowStateLike | string
  at?: string | null
  actions?: { key: string; enabled: boolean }[]
}

/** 三段，每段三步（国内件的报关单证、不约揽收的揽收等「不适用」的步照样占位，显示成不适用） */
export const FLOW_PHASES: { key: string; steps: string[] }[] = [
  { key: 'warehouse', steps: ['ordered', 'picking', 'packing'] },
  { key: 'prepare', steps: ['documents', 'waybill', 'pickup'] },
  { key: 'handover', steps: ['handover', 'transit', 'delivered'] },
]

/** 一段的状态：有要处理的 → warn；都完成（不适用的不算）→ done；有进行中或部分完成 → current；都不适用 → skipped；否则 todo */
export function phaseState(states: string[]): 'warn' | 'done' | 'current' | 'todo' | 'skipped' {
  const relevant = states.filter((s) => s !== 'skipped')
  if (!relevant.length) return 'skipped'
  if (relevant.includes('warning')) return 'warn'
  if (relevant.every((s) => s === 'done')) return 'done'
  if (relevant.some((s) => s === 'current' || s === 'done')) return 'current'
  return 'todo'
}

/** 进度节点：完成绿勾 / 当前紫圈 / 要处理琥珀「!」/ 没到灰圈序号 / 不适用 */
export function nodeState(state: string): 'done' | 'current' | 'warn' | 'todo' | 'skip' {
  if (state === 'done') return 'done'
  if (state === 'current') return 'current'
  if (state === 'warning') return 'warn'
  if (state === 'skipped') return 'skip'
  return 'todo'
}

/** 这一步是第几步、共几步（不适用的步不算） */
export function stepPosition(steps: StepLike[], key: string | null | undefined): { index: number; total: number } | null {
  const relevant = steps.filter((s) => s.state !== 'skipped')
  const index = relevant.findIndex((s) => s.key === key)
  return index < 0 ? null : { index: index + 1, total: relevant.length }
}

/** 处理记录：已完成的步，最近的在前（按实际时刻；没有时刻的按流程顺序靠后） */
export function historySteps<S extends StepLike>(steps: S[]): S[] {
  const order = new Map(steps.map((s, i) => [s.key, i]))
  const time = (s: S) => {
    const ms = s.at ? Date.parse(s.at) : NaN
    return Number.isFinite(ms) ? ms : null
  }
  return steps
    .filter((s) => s.state === 'done')
    .sort((a, b) => {
      const ta = time(a)
      const tb = time(b)
      if (ta !== null && tb !== null && ta !== tb) return tb - ta
      if (ta === null && tb !== null) return 1
      if (tb === null && ta !== null) return -1
      return (order.get(b.key) ?? 0) - (order.get(a.key) ?? 0)
    })
}

/**
 * 当前步骤卡之外，现在也能做的步：现在该做 / 要处理的步；运输中时签收能做也算（承运商不跟踪时手工确认签收）
 */
export function otherActionableSteps<S extends StepLike>(steps: S[], shownKey: string | null | undefined): S[] {
  return steps.filter((s) => s.key !== shownKey && (s.state === 'current' || s.state === 'warning'
    || (s.key === 'delivered' && s.state !== 'done' && s.state !== 'skipped' && !!s.actions?.some((a) => a.key === 'sign' && a.enabled))))
}

export interface DetailQty {
  quantity?: number | null
  picked_quantity?: number | null
  packed_quantity?: number | null
  delivered_quantity?: number | null
}

/**
 * 有数量差异的商品行数：拣完（已拣货之后）比已拣、打完（已打包之后）比已打包、发货后比已发货；
 * 还没到这一步的不比。返回 null 表示还没开始拣货（不说有没有差异）
 */
export function goodsDifferences(details: DetailQty[], status: string | null | undefined): number | null {
  const s = String(status || '')
  const picked = ['picked', 'packed', 'delivered', 'completed'].includes(s)
  const packed = ['packed', 'delivered', 'completed'].includes(s)
  const shipped = ['delivered', 'completed'].includes(s)
  if (!picked) return null
  const n = (v: unknown) => Number(v) || 0
  return details.filter((d) => {
    const qty = n(d.quantity)
    return (picked && n(d.picked_quantity) !== qty) || (packed && n(d.packed_quantity) !== qty)
      || (shipped && n(d.delivered_quantity) !== qty)
  }).length
}
