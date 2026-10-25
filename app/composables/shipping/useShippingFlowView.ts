/**
 * 发货流程的数据与文案（原来写在 components/shipping/DnShippingFlow.vue 里；新的发货单详情页也要用，抽到这里两边共用）：
 * - 读 GET /dn/<id>/shipping-flow；要报关时再读 GET /dn/<id>/customs（报关视图：单证一步、运单的申告价额 / 补录收货人共用）
 * - 每一步的一行概要、问题文案、任务入口、各步详细内容要用的派生值（能否录箱子、能否填运单号、运单方式、服务选项……）
 * - provideTimeZone：DN 所属仓库的时区（接口顶层的 timezone → 仓库 → 页头 / 浏览器）给所有子组件
 * 状态不在界面推算，按后端给的；后端没列出某个操作时才按 DN 状态兜底。必须在组件 setup 里调用。
 */
import type { InjectionKey, MaybeRefOrGetter } from 'vue'
import {
  CUSTOMS_WORKFLOW_PROBLEMS,
  DN_LOCKED_STATUSES,
  DN_PACKAGE_EDITABLE_STATUSES,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'
import {
  formatServiceType,
  serviceNameOf,
  type CarrierShipment,
  type CarrierTracking,
  type DeclaredValueMode,
} from '~/composables/customs/carrierShipment'
import { pickupTimeWindow, type PickupSummary } from '~/composables/customs/carrierPickup'
import { fileExportInfoOf, normalizeShippingOptions } from '~/composables/shipping/carrierFile'
import {
  FILE_WAYBILL_ACTIONS,
  flowActionEnabled,
  flowActionOf,
  flowActionReasonText,
  normalizeShippingFlow,
  shippingFlowUrl,
  type FlowProblem,
  type FlowStep,
  type FlowStepKey,
  type PickupSchedule,
  type ShippingFlow,
} from '~/composables/shipping/shippingFlow'

export type ShippingFlowView = ReturnType<typeof useShippingFlowView>

/** 发货单详情页把流程数据提供给各卡片（进度、当前步骤、处理记录、右栏） */
export const SHIPPING_FLOW_VIEW: InjectionKey<ShippingFlowView> = Symbol('shipping-flow-view')

export interface FlowTaskLink {
  to: string
  text: string
}

export function useShippingFlowView(options: {
  dnId: MaybeRefOrGetter<number | string>
  /** DN 所属仓库（揽收按仓库约）；接口给了 warehouse_id 时以接口为准 */
  warehouseId?: MaybeRefOrGetter<number | string | null | undefined>
  /** 读到流程后（页头据此显示阶段、承运商、国内 / 跨境） */
  onLoaded?: (flow: ShippingFlow) => void
}) {
  const { t, te, localeProperties } = useI18n()
  const { bizErrorMessage } = useBizError()
  const staffStore = useStaffStore()
  const route = useRoute()

  const dnId = computed(() => toValue(options.dnId))
  const flow = ref<ShippingFlow | null>(null)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  let flowRequest = 0
  let customsRequest = 0
  /** 每次操作后加一：自己持有数据的详细内容（运单、箱子）据此重读 */
  const version = ref(0)

  const stepOf = (key: FlowStepKey): FlowStep | null => flow.value?.steps.find((s: FlowStep) => s.key === key) || null
  const locked = computed(() => DN_LOCKED_STATUSES.includes(String(flow.value?.dn_status || '')))
  const dnStatus = computed(() => String(flow.value?.dn_status || ''))
  const warehouse = computed(() => flow.value?.warehouse_id ?? toValue(options.warehouseId) ?? null)
  const carrier = computed(() => flow.value?.carrier || null)
  const tasks = computed(() => flow.value?.tasks || { picking: [], packing: [], delivery: null })
  const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)
  /** DN 所属仓库的时区（子组件的时刻显示 / 输入都用它） */
  const flowTimeZone = provideTimeZone(() => flow.value?.timezone, () => warehouse.value)

  // ------------------ 报关视图 ----------------------
  const customsView = ref<CustomsView | null>(null)
  const customsLoading = ref(false)
  const customsError = ref<string | null>(null)
  const needsCustoms = computed(() => {
    const documents = stepOf('documents')
    return !!flow.value && (flow.value.route.requires_customs || (!!documents && documents.state !== 'skipped'))
  })
  const loadCustoms = async () => {
    const request = ++customsRequest
    const id = dnId.value
    const current = () => request === customsRequest && id === dnId.value
    customsLoading.value = true
    customsError.value = null
    await httpRequest<CustomsView>(`/api/warehouse/dn/${id}/customs`, {
      method: 'GET',
      onSuccess: (data) => {
        if (current()) customsView.value = data
      },
      onError: (error) => {
        if (current()) customsError.value = bizErrorMessage(error)
      },
      onFinally: () => {
        if (current()) customsLoading.value = false
      },
    })
  }
  /** 「报关单证」一步列出的问题：运单一步不再重复 */
  const documentsProblemCodes = computed(() => (customsView.value?.problems || [])
    .filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code))
    .map((p: CustomsProblem) => p.code))
  /** 能补录报关快照：DN 未发货、有发货单编辑权限（PUT customs 需 dn_edit） */
  const canEditCustoms = computed(() => !locked.value && !!customsView.value?.customs && staffStore.hasPermission('dn_edit'))

  // ------------------ 读取 ----------------------
  const load = async () => {
    const request = ++flowRequest
    const id = dnId.value
    const current = () => request === flowRequest && id === dnId.value
    loading.value = true
    loadError.value = null
    await httpRequest<any>(shippingFlowUrl(id), {
      method: 'GET',
      onSuccess: (data) => {
        if (!current()) return
        const next = normalizeShippingFlow(data)
        flow.value = next
        if (next) options.onLoaded?.(next)
      },
      onError: (error) => {
        if (current()) loadError.value = bizErrorMessage(error)
      },
      onFinally: () => {
        if (current()) loading.value = false
      },
    })
    if (!current()) return
    if (needsCustoms.value) await loadCustoms()
    else {
      customsRequest++
      customsView.value = null
      customsError.value = null
      customsLoading.value = false
    }
  }
  /** 做了操作 / 页面自己做了操作：整体重读，让自己持有数据的详细内容（运单、箱子）也重读 */
  const reload = async () => {
    await load()
    version.value++
  }
  const reset = () => {
    flowRequest++
    customsRequest++
    flow.value = null
    customsView.value = null
    loading.value = false
    customsLoading.value = false
    loadError.value = null
    customsError.value = null
  }

  // ------------------ 各步的数据 ----------------------
  const packingStep = computed(() => stepOf('packing'))
  const waybillStep = computed(() => stepOf('waybill'))
  const waybillShipment = computed<CarrierShipment | null>(() => {
    const s = waybillStep.value?.summary?.shipment
    return s && typeof s === 'object' ? (s as CarrierShipment) : null
  })
  const canEditPackages = computed(() => flowActionEnabled(packingStep.value, 'edit_packages',
    !locked.value && DN_PACKAGE_EDITABLE_STATUSES.includes(dnStatus.value)))
  const packagesReadonlyReason = computed(() => {
    const action = flowActionOf(packingStep.value, 'edit_packages')
    if (action && !action.enabled && (action.reason || action.reason_code)) {
      return flowActionReasonText(action, t, te, { carrier: carrier.value?.name || t('customs.carrier.carrier-fallback') })
    }
    return locked.value ? t('customs.status.locked') : t('customs.packages.readonly-status')
  })
  const canEnterTracking = computed(() => flowActionEnabled(waybillStep.value, 'enter_tracking', !!tasks.value.delivery && !locked.value))
  /** 运单方式不是 api：运单一步只填运单号 */
  const waybillManualOnly = computed(() => !!carrier.value && carrier.value.methods.waybill !== 'api'
    && !flowActionOf(waybillStep.value, 'create_waybill'))
  /** 运单方式是文件（或后端给了文件方式的操作）：运单一步加导出 / 导回 */
  const waybillFileMode = computed(() => carrier.value?.methods.waybill === 'file'
    || FILE_WAYBILL_ACTIONS.some((key: string) => !!flowActionOf(waybillStep.value, key)))
  /** 运单服务选项（承运商声明了才有） */
  const waybillOptions = computed(() => normalizeShippingOptions(waybillStep.value?.summary?.options))
  const packageCount = computed(() => {
    const n = Number(packingStep.value?.summary?.package_count)
    return Number.isFinite(n) ? n : null
  })
  /** 申告价额提示：运单方式 api 时会随运单提交（建好后已提交），否则手工建单时填写 */
  const declaredMode = computed<DeclaredValueMode>(() => {
    if (carrier.value?.methods.waybill !== 'api') return 'manual'
    const w = waybillStep.value
    return w?.state === 'done' && w.summary?.source === 'api' ? 'submitted' : 'auto'
  })

  // ------------------ 文案 ----------------------
  const stepTitle = (key: string) => (te(`shipping.steps.${key}`) ? t(`shipping.steps.${key}`) : key)
  const actionText = (key: string) => (te(`shipping.actions.${key}`) ? t(`shipping.actions.${key}`) : key)
  const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
  const docTypeText = (type: string) => (te(`customs.doc-types.${type}`) ? t(`customs.doc-types.${type}`) : type)
  const weekdayText = (days: number[]) =>
    [...days].sort((a, b) => a - b).map((d) => t(`shipping.weekdays.${d}`)).join(t('shipping.list-separator'))

  const problemText = (p: FlowProblem): string => {
    // {message}：后端的原文（自动完成发货 / 签收被挡、跟踪异常的具体原因）
    const params = { carrier: carrier.value?.name || t('customs.carrier.carrier-fallback'), limit: '', tracking: '',
      message: p.message || '' }
    for (const key of [`shipping.problems.${p.code}`, `customs.carrier.blockers.${p.code}`, `customs.problems.${p.code}`]) {
      if (te(key)) return t(key, params)
    }
    return p.message || p.code
  }
  /** 这一步的问题 */
  const problemsOf = (key: string): FlowProblem[] => (flow.value?.problems || []).filter((p: FlowProblem) => p.step === key)
  /** 不属于哪一步的问题 */
  const generalProblems = computed(() => {
    const keys = (flow.value?.steps || []).map((s: FlowStep) => s.key as string)
    return (flow.value?.problems || []).filter((p: FlowProblem) => !p.step || !keys.includes(String(p.step)))
  })

  const trackingSummary = (tr: CarrierTracking | null): string => {
    if (!tr?.status) return ''
    const parts = [t(`customs.carrier.tracking.status.${tr.status}`, { carrier: carrier.value?.name || '' })]
    const latest = tr.events?.[0]
    if (latest && tr.status !== 'label_created') {
      parts.push(t('customs.carrier.tracking.latest', {
        event: [latest.description, latest.location].filter(Boolean).join(' · ') || latest.code || '—',
      }))
    }
    if (tr.status !== 'delivered' && tr.estimated_delivery) parts.push(t('customs.carrier.tracking.eta', { date: tr.estimated_delivery }))
    return parts.join(' · ')
  }

  /** 揽收概要；这一步已完成（货已交出）时揽收日过了是正常的，不再提示重约 */
  const pickupSummaryText = (p: PickupSummary | null, done = false): string => {
    if (!p || ['cancelled', 'failed', 'dismissed'].includes(p.status)) return t('customs.carrier.pickup.none')
    if (p.status === 'scheduled' && p.past && !done) return t('customs.carrier.pickup.past', { date: p.pickup_date })
    if (p.status === 'scheduled') {
      return t('customs.carrier.pickup.scheduled', { date: p.pickup_date, window: pickupTimeWindow(p), code: p.confirmation_code || '—' })
    }
    return t(p.status === 'pending' ? 'customs.carrier.pickup.pending' : 'customs.carrier.pickup.unknown')
  }

  /** 每一步的一行概要 */
  const summaryText = (step: FlowStep): string => {
    const s = step.summary || {}
    switch (step.key) {
      case 'ordered':
        return flow.value?.order_number ? t('shipping.summary.order-number', { number: flow.value.order_number }) : ''
      case 'picking': {
        const planned = num(s.planned)
        if (planned === null) return ''
        return t('shipping.summary.picking', { picked: num(s.picked) ?? 0, planned })
      }
      case 'packing': {
        const count = num(s.package_count) ?? 0
        if (count > 0) return t('shipping.summary.packing', { count, weight: num(s.gross_weight_kg) ?? '—' })
        if (step.state === 'todo' || step.state === 'blocked') return ''
        // 不需要录箱子（国内手工运单等，后端 packages_required = false）：显示打包进度，不说「还没录箱子」
        const planned = num(s.planned)
        if (s.packages_required === false && planned !== null) {
          return t('shipping.summary.packed', { packed: num(s.packed) ?? 0, planned })
        }
        return t('shipping.summary.packing-empty')
      }
      case 'documents': {
        if (step.state === 'skipped') return t('shipping.summary.documents-skipped')
        if (s.outdated) return t('shipping.summary.documents-outdated')
        const missing = Array.isArray(s.missing) ? s.missing.map((x: unknown) => String(x)) : []
        const version = num(s.version)
        if (missing.length && version) return t('shipping.summary.documents-missing', { docs: missing.map(docTypeText).join(t('shipping.list-separator')) })
        if (version) return t('shipping.summary.documents-version', { version })
        return step.state === 'todo' || step.state === 'blocked' ? '' : t('shipping.summary.documents-none')
      }
      case 'waybill': {
        if (step.state === 'skipped') return ''
        // 建单 / 取消请求进行中或结果不明（详细内容里有处理方法）
        const unresolved = s.unresolved && typeof s.unresolved === 'object' ? s.unresolved : null
        if (unresolved) {
          if (unresolved.status === 'pending' && !unresolved.reason) {
            return t('shipping.summary.waybill-pending', { carrier: carrier.value?.name || '' })
          }
          if (unresolved.status === 'cancelling') return t('shipping.summary.waybill-cancelling')
          return t('shipping.summary.waybill-unresolved')
        }
        const tracking = String(s.tracking_number || '')
        if (tracking) {
          const source = s.source && te(`shipping.waybill-sources.${s.source}`) ? t(`shipping.waybill-sources.${s.source}`) : ''
          // 服务显示名（service_name），没有时按运单记录 / 服务代码拼，不直接显示 INTERNATIONAL_ECONOMY 这样的代码
          const service = serviceNameOf(waybillShipment.value, locale.value) || String(s.service_name || '') || formatServiceType(s.service)
          return [tracking, source, service].filter(Boolean).join(' · ')
        }
        // 文件方式：已导出、等导回运单号
        const exported = fileExportInfoOf(s)
        if (exported) {
          return exported.exported_at
            ? t('shipping.summary.waybill-exported', { time: formatLocaleDateTime(exported.exported_at, locale.value, flowTimeZone.value) })
            : t('shipping.summary.waybill-exported-no-time')
        }
        if (!carrier.value) return t('shipping.summary.no-carrier')
        if (step.state === 'todo' || step.state === 'blocked') return ''
        const method = carrier.value.methods.waybill
        return t(method === 'api' ? 'shipping.summary.waybill-api'
          : method === 'file' ? 'shipping.summary.waybill-file' : 'shipping.summary.waybill-manual', { carrier: carrier.value.name })
      }
      case 'pickup': {
        const method = String(s.method || carrier.value?.methods.pickup || 'none')
        if (method === 'none') return t('shipping.summary.pickup-none')
        // 要约揽收的承运商，但没约就发货了 / DN 取消了：不适用
        if (step.state === 'skipped') return ''
        if (method === 'scheduled') {
          const sc = s.schedule as PickupSchedule | null | undefined
          return sc && Array.isArray(sc.weekdays) && sc.weekdays.length
            ? t('shipping.pickup.schedule', { days: weekdayText(sc.weekdays), window: pickupTimeWindow(sc) })
            : t('shipping.pickup.schedule-unset')
        }
        if (method === 'dropoff') return t('shipping.pickup.dropoff', { carrier: carrier.value?.name || '' })
        if (step.state === 'todo' || step.state === 'blocked') return ''
        return pickupSummaryText(s.pickup && typeof s.pickup === 'object' ? (s.pickup as PickupSummary) : null, step.state === 'done')
      }
      case 'handover':
        return step.state === 'current' || step.state === 'warning' ? t('shipping.summary.handover-ready') : ''
      case 'transit': {
        if (step.state === 'skipped') return carrier.value?.methods.tracking === 'none' ? t('shipping.summary.transit-none') : ''
        const tr = s.tracking && typeof s.tracking === 'object' ? (s.tracking as CarrierTracking) : null
        const text = trackingSummary(tr)
        if (text) return text
        // 经 API 跟踪、还没查到第一条
        if (s.tracked_by_api && (step.state === 'current' || step.state === 'warning')) return t('shipping.summary.transit-waiting')
        if (s.tracking_url || carrier.value?.tracking_url) return step.state === 'todo' || step.state === 'blocked' ? '' : t('shipping.summary.transit-link')
        return ''
      }
      case 'delivered': {
        if (step.state === 'done') {
          return step.source === 'rule' ? t('shipping.delivered.by-rule', { days: carrier.value?.auto_sign_days ?? '—' }) : ''
        }
        if (s.auto_sign_at) return t('shipping.delivered.auto-sign-at', { time: formatLocaleDateTime(String(s.auto_sign_at), locale.value, flowTimeZone.value) })
        if (s.estimated_delivery) return t('customs.carrier.tracking.eta', { date: s.estimated_delivery })
        return ''
      }
      default:
        return ''
    }
  }

  // ------------------ 任务入口 ----------------------
  const taskLinks = (key: string): FlowTaskLink[] => {
    const here = route.path.replace(/\/$/, '')
    let links: FlowTaskLink[] = []
    if (key === 'picking') links = tasks.value.picking.map((id: number) => ({ to: `/picking/detail/${id}`, text: `PICK-${id}` }))
    else if (key === 'packing') links = tasks.value.packing.map((id: number) => ({ to: `/packing/detail/${id}`, text: `PACK-${id}` }))
    else if (key === 'handover' && tasks.value.delivery) {
      links = [{ to: `/delivery/detail/${tasks.value.delivery}`, text: `DEL-${tasks.value.delivery}` }]
    }
    return links.filter((l) => l.to !== here)
  }

  return {
    flow, loading, loadError, version, load, reload, reset, stepOf, locked, dnStatus, warehouse, carrier, tasks, flowTimeZone,
    customsView, customsLoading, customsError, needsCustoms, loadCustoms, documentsProblemCodes, canEditCustoms,
    packingStep, waybillStep, waybillShipment, canEditPackages, packagesReadonlyReason, canEnterTracking, waybillManualOnly,
    waybillFileMode, waybillOptions, packageCount, declaredMode,
    stepTitle, actionText, problemText, problemsOf, generalProblems, summaryText, taskLinks, docTypeText,
  }
}
