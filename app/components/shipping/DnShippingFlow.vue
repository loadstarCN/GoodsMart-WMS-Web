<script lang="ts" setup>
/**
 * 出库单的发货流程（出库单详情的主区域；打包 / 配送任务页用 compact）。
 *
 * 读 GET /dn/<id>/shipping-flow：上面是横向进度条（下单 / 拣货 / 打包 / 发货准备 / 交承运商 / 运输中 / 签收），
 * 下面是逐步清单。每一步显示状态、实际发生时刻（按界面语言、DN 所属仓库的时区：接口顶层的 timezone → 仓库下拉里该仓库的
 * → 页头 / 浏览器；与浏览器不同时标题旁标出时区，各详细内容 useTimeZone() 用同一个）、来源（仓库 / 承运商 / 规则 / 来源系统）、
 * 一行概要和操作；
 * 点开看这一步的详细内容，用已有的组件做事：
 * - 打包：DnPackagesEditor（录箱子）
 * - 报关单证：FlowDocumentsDetail（CI / PL、签发、历史、报关问题、补录、报关数据明细）
 * - 运单：CarrierShipmentPanel（在线建单 / 面单 / 取消 / 结果不明的处理，或手工填运单号）；运单方式是文件时上面加
 *   FlowWaybillFileDetail（导出文件 / 导回运单号 / 作废导出）；承运商声明了服务选项时下面加 ShippingOptionsEditor
 * - 揽收：FlowPickupDetail（在线预约 / 手工记录 / 定期集荷 / 自送）
 * - 交承运商：FlowHandoverDetail（完成发货，可填实际时刻）
 * - 运输中：FlowTransitDetail（跟踪、扫描记录、刷新、承运商查询页）
 * - 签收：FlowDeliveredDetail（确认签收，可填实际时刻；自动视为签收的说明）
 * 状态不在界面推算，按后端给的；后端没列出某个操作时才按 DN 状态兜底。
 *
 * mode：full = 要处理 / 现在该做的步骤展开；compact = 只展开当前这一步，不列不适用的步骤，给出库单详情的入口。
 * 每次操作后整体重读（流程、报关视图、运单、箱子），并 emit changed 让页面刷新自己的数据。
 * 详细内容第一次展开时才挂载，之后收起只隐藏（箱子没保存的修改不会丢）。
 */
import {
  CUSTOMS_WORKFLOW_PROBLEMS,
  DN_LOCKED_STATUSES,
  DN_PACKAGE_EDITABLE_STATUSES,
  useCustomsPdfActions,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'
import {
  isActiveShipment,
  isPdfLabel,
  formatServiceType,
  labelDocumentOf,
  serviceNameOf,
  type CarrierShipment,
  type CarrierTracking,
  type DeclaredValueMode,
} from '~/composables/customs/carrierShipment'
import { pickupTimeWindow, type PickupSummary } from '~/composables/customs/carrierPickup'
import { fileExportInfoOf, normalizeShippingOptions } from '~/composables/shipping/carrierFile'
import {
  FILE_WAYBILL_ACTIONS,
  HIDDEN_ACTIONS,
  activeStepKey,
  flowActionEnabled,
  flowActionOf,
  flowActionReasonText,
  normalizeShippingFlow,
  shippingFlowUrl,
  type FlowAction,
  type FlowProblem,
  type FlowStep,
  type FlowStepKey,
  type PickupSchedule,
  type ShippingFlow,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  mode?: 'full' | 'compact'
  /** DN 所属仓库（揽收按仓库约）；接口给了 warehouse_id 时以接口为准 */
  warehouseId?: number | string | null
  /** 配送任务页：完成发货时一起提交的页面字段（运费、承运商、运输方式、备注）；返回 null 表示页面校验没过 */
  completeExtras?: (() => Record<string, any> | null | Promise<Record<string, any> | null>) | null
}>(), {
  mode: 'full',
  warehouseId: null,
  completeExtras: null,
})

const emit = defineEmits<{
  /** 做了操作（流程已重读）：页面刷新自己的数据 */
  (e: 'changed'): void
  /** 读到流程（出库单详情的页头据此显示阶段、承运商、国内 / 跨境） */
  (e: 'loaded', flow: ShippingFlow): void
}>()

const { t, te, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
const route = useRoute()
const { busyDocId, viewDoc, downloadRawDoc } = useCustomsPdfActions()

const flow = ref<ShippingFlow | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
/** 每次操作后加一：自己持有数据的详细内容（运单、箱子）据此重读 */
const version = ref(0)

const stepOf = (key: FlowStepKey): FlowStep | null => flow.value?.steps.find((s: FlowStep) => s.key === key) || null
const locked = computed(() => DN_LOCKED_STATUSES.includes(String(flow.value?.dn_status || '')))
const dnStatus = computed(() => String(flow.value?.dn_status || ''))
const warehouse = computed(() => flow.value?.warehouse_id ?? props.warehouseId ?? null)
const carrier = computed(() => flow.value?.carrier || null)
const tasks = computed(() => flow.value?.tasks || { picking: [], packing: [], delivery: null })
const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)
/** DN 所属仓库的时区（子组件的时刻显示 / 输入都用它） */
const flowTimeZone = provideTimeZone(() => flow.value?.timezone, () => warehouse.value)

// ------------------ 报关视图（要报关的出库单：单证一步、运单的申告价额 / 补录收货人共用） ----------------------
const customsView = ref<CustomsView | null>(null)
const customsLoading = ref(false)
const customsError = ref<string | null>(null)
const needsCustoms = computed(() => {
  const documents = stepOf('documents')
  return !!flow.value && (flow.value.route.requires_customs || (!!documents && documents.state !== 'skipped'))
})
const loadCustoms = async () => {
  customsLoading.value = true
  customsError.value = null
  await httpRequest<CustomsView>(`/api/warehouse/dn/${props.dnId}/customs`, {
    method: 'GET',
    onSuccess: (data) => {
      customsView.value = data
    },
    onError: (error) => {
      customsError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      customsLoading.value = false
    },
  })
}
/** 「报关单证」一步列出的问题：运单一步不再重复 */
const documentsProblemCodes = computed(() => (customsView.value?.problems || [])
  .filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code))
  .map((p: CustomsProblem) => p.code))
const editorOpen = ref(false)
const staffStore = useStaffStore()
/** 能补录报关快照：DN 未发货、有出库单编辑权限（PUT customs 需 dn_edit） */
const canEditCustoms = computed(() => !locked.value && !!customsView.value?.customs && staffStore.hasPermission('dn_edit'))

// ------------------ 读取 ----------------------
const load = async () => {
  loading.value = true
  loadError.value = null
  await httpRequest<any>(shippingFlowUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      const next = normalizeShippingFlow(data)
      flow.value = next
      if (next) emit('loaded', next)
    },
    onError: (error) => {
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
  if (needsCustoms.value) await loadCustoms()
  syncExpanded()
}

/** 做了操作：整体重读，通知页面 */
const refresh = async () => {
  await load()
  version.value++
  emit('changed')
}

onMounted(load)
watch(() => props.dnId, () => {
  flow.value = null
  customsView.value = null
  expanded.value = []
  mounted.value = []
  autoKey = null
  load()
})

// ------------------ 展开 / 收起 ----------------------
/** 展开着的步骤 */
const expanded = ref<string[]>([])
/** 挂载过详细内容的步骤（收起只隐藏） */
const mounted = ref<string[]>([])
/** 用户自己点开的步骤：当前步骤变了也不收起 */
const userOpened = new Set<string>()
/** 上次自动展开的步骤 */
let autoKey: string | null = null

const DETAIL_KEYS: FlowStepKey[] = ['packing', 'documents', 'waybill', 'pickup', 'handover', 'transit', 'delivered']
const expandable = (step: FlowStep): boolean => {
  if (!DETAIL_KEYS.includes(step.key) || step.state === 'skipped') return false
  // 已交承运商 / 已签收：没有要做的事
  if ((step.key === 'handover' || step.key === 'delivered') && step.state === 'done') return false
  return true
}
const isExpanded = (key: string) => expanded.value.includes(key)
const expand = (key: string) => {
  if (!expanded.value.includes(key)) expanded.value = [...expanded.value, key]
  if (!mounted.value.includes(key)) mounted.value = [...mounted.value, key]
}
const collapse = (key: string) => {
  expanded.value = expanded.value.filter((k: string) => k !== key)
}
const toggle = (step: FlowStep) => {
  if (isExpanded(step.key)) {
    collapse(step.key)
    userOpened.delete(step.key)
  } else {
    expand(step.key)
    userOpened.add(step.key)
  }
}

/**
 * 当前步骤变了（如打包完成后轮到单证 / 运单）：展开新的当前步骤，收起上次自动展开、用户没点过的。
 * full 第一次读到时，要人处理的步骤也一起展开
 */
const syncExpanded = () => {
  const steps = flow.value?.steps || []
  const active = activeStepKey(steps)
  const activeStep = active ? steps.find((s: FlowStep) => s.key === active) : null
  const firstTime = autoKey === null && expanded.value.length === 0
  if (active !== autoKey) {
    if (autoKey && !userOpened.has(autoKey)) collapse(autoKey)
    if (activeStep && expandable(activeStep)) expand(activeStep.key)
    autoKey = active
  }
  if (firstTime && props.mode === 'full') {
    steps.filter((s: FlowStep) => s.state === 'warning' && expandable(s)).forEach((s: FlowStep) => expand(s.key))
  }
  // 不能再展开的（如已完成的交承运商）收起
  expanded.value = expanded.value.filter((key: string) => {
    const step = steps.find((s: FlowStep) => s.key === key)
    return !!step && expandable(step)
  })
}

/** 显示的步骤：compact 不列不适用的 */
const visibleSteps = computed(() =>
  (flow.value?.steps || []).filter((s: FlowStep) => props.mode === 'full' || s.state !== 'skipped'))

// ------------------ 详细内容的组件（运单、箱子自己持有数据；揽收 / 运输 / 交接 / 签收给标题行的操作按钮调用） ----------------------
const carrierRef = ref<{ reload: () => Promise<void> } | null>(null)
const packagesRef = ref<{ reload: () => Promise<void>; dirty: boolean } | null>(null)
const runners: Record<string, { run: (key: string) => void } | null> = {}
const setRunner = (key: string, el: any) => {
  runners[key] = el && typeof el.run === 'function' ? el : null
}
const setCarrierRef = (el: any) => {
  carrierRef.value = el && typeof el.reload === 'function' ? el : null
}
const setPackagesRef = (el: any) => {
  packagesRef.value = el && typeof el.reload === 'function' ? el : null
}
const packagesDirty = computed(() => !!packagesRef.value?.dirty)

watch(version, async () => {
  await carrierRef.value?.reload()
  // 有没保存的修改时不覆盖
  if (packagesRef.value && !packagesRef.value.dirty) await packagesRef.value.reload()
})

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
/** 这一步标题行下面列出的问题：单证、运单展开时由详细内容自己列（带补的入口） */
const stepProblems = (step: FlowStep): FlowProblem[] => {
  if ((step.key === 'documents' || step.key === 'waybill') && isExpanded(step.key)) return []
  return (flow.value?.problems || []).filter((p: FlowProblem) => p.step === step.key)
}
/** 不属于哪一步的问题：列在最上面 */
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
        // 文件方式的服务名称按界面语言（service_label）；其它用 service_name
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

// ------------------ 标题行的操作按钮（收起时显示；展开后由详细内容提供） ----------------------
/** 只是展开到详细内容去做的操作 */
const EXPAND_ACTIONS = ['create_waybill', 'enter_tracking', 'cancel_waybill', 'dismiss_waybill', 'issue_documents',
  'edit_packages', 'complete_shipping', 'sign']
/** 展开后直接执行的操作（详细内容的 run） */
const RUN_ACTIONS = ['book_pickup', 'record_pickup', 'cancel_pickup', 'refresh_tracking', 'export_file', 'import_numbers']
const headerActions = (step: FlowStep): FlowAction[] => {
  if (isExpanded(step.key)) return []
  return step.actions.filter((a: FlowAction) => a.enabled && !HIDDEN_ACTIONS.includes(a.key)
    && (EXPAND_ACTIONS.includes(a.key) || RUN_ACTIONS.includes(a.key) || a.key === 'print_label' || a.key === 'open_tracking'))
    // 取消类的放到详细内容里（要看清楚再取消）
    .filter((a: FlowAction) => !['cancel_waybill', 'dismiss_waybill', 'cancel_pickup', 'discard_export'].includes(a.key))
}
const PRIMARY_ACTIONS = ['create_waybill', 'enter_tracking', 'book_pickup', 'record_pickup', 'complete_shipping', 'sign',
  'issue_documents', 'edit_packages', 'export_file', 'import_numbers']
const ACTION_ICONS: Record<string, string> = {
  create_waybill: 'ri-file-add-line',
  enter_tracking: 'ri-edit-line',
  print_label: 'ri-printer-line',
  book_pickup: 'ri-truck-line',
  record_pickup: 'ri-edit-box-line',
  complete_shipping: 'ri-check-double-line',
  refresh_tracking: 'ri-refresh-line',
  open_tracking: 'ri-external-link-line',
  sign: 'ri-checkbox-circle-line',
  issue_documents: 'ri-file-text-line',
  edit_packages: 'ri-inbox-archive-line',
  export_file: 'ri-file-download-line',
  import_numbers: 'ri-file-upload-line',
}

const trackingUrlOf = (step: FlowStep): string => String(step.summary?.tracking_url || carrier.value?.tracking_url || '').trim()

const printLabel = () => {
  const shipment = waybillShipment.value
  const id = num(waybillStep.value?.summary?.label_document_id)
  const doc = labelDocumentOf(shipment) || (id ? { id, sha256: null, file_name: null } : null)
  if (!doc) return
  if (!shipment || isPdfLabel(shipment)) viewDoc(props.dnId, doc)
  else downloadRawDoc(props.dnId, doc)
}

const onHeaderAction = async (step: FlowStep, key: string) => {
  if (key === 'print_label') return printLabel()
  if (key === 'open_tracking') {
    const url = String(flowActionOf(step, 'open_tracking')?.url || '').trim() || trackingUrlOf(step)
    if (url) window.open(url, '_blank', 'noopener')
    return
  }
  expand(step.key)
  userOpened.add(step.key)
  await nextTick()
  if (RUN_ACTIONS.includes(key)) runners[step.key]?.run(key)
  else document.getElementById(`shipping-step-${step.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ------------------ 任务入口 ----------------------
const taskLinks = (step: FlowStep): { to: string; text: string }[] => {
  const here = route.path.replace(/\/$/, '')
  let links: { to: string; text: string }[] = []
  if (step.key === 'picking') links = tasks.value.picking.map((id: number) => ({ to: `/picking/detail/${id}`, text: `#PICK-${id}` }))
  else if (step.key === 'packing') links = tasks.value.packing.map((id: number) => ({ to: `/packing/detail/${id}`, text: `#PACK-${id}` }))
  else if (step.key === 'handover' && tasks.value.delivery) {
    links = [{ to: `/delivery/detail/${tasks.value.delivery}`, text: `#DEL-${tasks.value.delivery}` }]
  }
  return links.filter((l) => l.to !== here)
}
const dnLink = computed(() => `/dn/detail/${props.dnId}`)
const onDnPage = computed(() => route.path.replace(/\/$/, '') === dnLink.value)

/** 页面自己做了操作（如完成打包、取消 DN）后重读流程：不再 emit changed（页面已经在刷新自己的数据） */
const reload = async () => {
  await load()
  version.value++
}

defineExpose({ reload })
</script>

<template>
  <div class="card custom-card shipping-flow" :class="`is-${mode}`" id="shipping-flow">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="card-title d-flex flex-wrap align-items-center gap-2">
        <span><i class="ri-route-line me-1 align-middle"></i>{{ t('shipping.title') }}</span>
        <ShippingStageBadge :stage="flow?.stage" />
        <span class="badge bg-light text-default fw-normal" v-if="flow?.carrier">
          <i class="ri-truck-line me-1"></i>{{ flow.carrier.name }}
        </span>
        <TimeZoneBadge v-if="flow" :zone="flowTimeZone" />
      </div>
      <div class="d-flex align-items-center gap-2">
        <NuxtLink :to="dnLink" class="fs-12" v-if="mode === 'compact' && !onDnPage">
          {{ t('shipping.view-on-dn') }}<i class="ri-arrow-right-s-line align-middle"></i>
        </NuxtLink>
        <button type="button" class="btn btn-sm btn-icon btn-light" :disabled="loading" :title="t('shipping.refresh')"
          :aria-label="t('shipping.refresh')" @click="refresh">
          <span class="spinner-border spinner-border-sm" v-if="loading && flow"></span>
          <i class="ri-refresh-line" v-else></i>
        </button>
      </div>
    </div>

    <div class="card-body">
      <div class="d-flex justify-content-center py-4" v-if="loading && !flow">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
      </div>
      <div class="alert alert-danger-transparent mb-0" v-else-if="loadError && !flow">{{ loadError }}</div>

      <template v-else-if="flow">
        <ShippingFlowStepper :steps="flow.steps" class="mb-3" />

        <ul class="list-unstyled fs-13 mb-3" v-if="generalProblems.length">
          <li v-for="(p, i) in generalProblems" :key="`gp-${i}`" :class="p.level === 'error' ? 'text-danger' : 'text-warning'">
            <i class="me-1" :class="p.level === 'error' ? 'ri-close-circle-line' : 'ri-error-warning-line'"></i>{{ problemText(p) }}
          </li>
        </ul>

        <ShippingFlowStep v-for="(step, index) in visibleSteps" :key="step.key" :step="step" :index="index + 1"
          :title="stepTitle(step.key)" :summary="summaryText(step)" :expandable="expandable(step)"
          :expanded="isExpanded(step.key)" :problems="stepProblems(step)" :problem-text="problemText"
          :last="index === visibleSteps.length - 1" @toggle="toggle(step)">
          <template #meta v-if="taskLinks(step).length">
            <NuxtLink v-for="link in taskLinks(step)" :key="link.to" :to="link.to">{{ link.text }}</NuxtLink>
          </template>
          <template #actions v-if="headerActions(step).length">
            <button type="button" class="btn btn-sm" v-for="a in headerActions(step)" :key="a.key"
              :class="PRIMARY_ACTIONS.includes(a.key) ? 'btn-primary-light' : 'btn-light'"
              :disabled="a.key === 'print_label' && busyDocId !== null" @click="onHeaderAction(step, a.key)">
              <i class="me-1" :class="ACTION_ICONS[a.key] || 'ri-arrow-right-line'"></i>{{ actionText(a.key) }}
            </button>
          </template>

          <template #default v-if="mounted.includes(step.key)">
            <!-- 打包：录箱子 -->
            <template v-if="step.key === 'packing'">
              <DnPackagesEditor :ref="setPackagesRef" :dn-id="dnId" :editable="canEditPackages"
                :readonly-reason="packagesReadonlyReason" @saved="refresh" />
              <p class="fs-12 text-muted mb-0 mt-1" v-if="!flow.route.requires_customs && canEditPackages">
                {{ t('customs.packages.domestic-tip') }}
              </p>
            </template>

            <!-- 报关单证 -->
            <FlowDocumentsDetail v-else-if="step.key === 'documents'" :dn-id="dnId" :step="step" :view="customsView"
              :loading="customsLoading" :load-error="customsError" :dn-status="dnStatus" :warehouse-id="warehouse"
              :packages-dirty="packagesDirty" :declared-mode="declaredMode"
              @changed="refresh" @edit-customs="editorOpen = true" />

            <!-- 运单 -->
            <template v-else-if="step.key === 'waybill'">
              <!-- 文件方式：导出文件 / 导回运单号 / 作废导出 -->
              <FlowWaybillFileDetail v-if="waybillFileMode" class="mb-2" :ref="(el: any) => setRunner('waybill', el)"
                :dn-id="dnId" :step="step" :carrier="carrier" :warehouse-id="warehouse" :locked="locked" @changed="refresh" />
              <CarrierShipmentPanel :ref="setCarrierRef" :dn-id="dnId" :locked="locked" :customs="customsView?.customs ?? null"
                :packages-dirty="packagesDirty" :warehouse-id="warehouse" :package-count="packageCount"
                :task-id="tasks.delivery" :tracking-editable="canEnterTracking" :hidden-blocker-codes="documentsProblemCodes"
                :can-edit-customs="canEditCustoms" :show-pickup="false" :show-tracking="false" :tracking-refresh="false"
                :manual-only="waybillManualOnly" :file-mode="waybillFileMode" @changed="refresh" @edit-customs="editorOpen = true" />
              <!-- 运单服务选项（配送日、时间带……）：建运单 / 导出后锁定 -->
              <ShippingOptionsEditor v-if="waybillOptions && waybillOptions.schema.length" :dn-id="dnId" :options="waybillOptions"
                :locked="locked" @saved="refresh" />
              <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier?.name"
                :tracking-number="step.summary?.tracking_number" v-if="!locked" />
            </template>

            <!-- 揽收 -->
            <FlowPickupDetail v-else-if="step.key === 'pickup'" :ref="(el: any) => setRunner('pickup', el)" :dn-id="dnId"
              :step="step" :carrier="carrier" :shipment="isActiveShipment(waybillShipment) ? waybillShipment : null"
              :warehouse-id="warehouse" :locked="locked" @changed="refresh" />

            <!-- 交承运商 -->
            <FlowHandoverDetail v-else-if="step.key === 'handover'" :ref="(el: any) => setRunner('handover', el)"
              :step="step" :task-id="tasks.delivery" :carrier="carrier" :locked="locked" :complete-extras="completeExtras"
              @changed="refresh" />

            <!-- 运输中 -->
            <FlowTransitDetail v-else-if="step.key === 'transit'" :ref="(el: any) => setRunner('transit', el)" :dn-id="dnId"
              :step="step" :carrier-name="carrier?.name" :tracking-url="carrier?.tracking_url" @changed="refresh" />

            <!-- 签收 -->
            <FlowDeliveredDetail v-else-if="step.key === 'delivered'" :ref="(el: any) => setRunner('delivered', el)"
              :step="step" :task-id="tasks.delivery" :carrier="carrier" :dn-status="dnStatus"
              :handover-at="stepOf('handover')?.at ?? null" @changed="refresh" />
          </template>
        </ShippingFlowStep>

        <CustomsSnapshotEditor v-if="customsView" v-model:open="editorOpen" :dn-id="dnId" :customs="customsView.customs"
          :lines="customsView.lines" :fallback-consignee="customsView.consignee" @saved="refresh" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.shipping-flow.is-compact .card-body {
  padding-top: 0.875rem;
  padding-bottom: 0.875rem;
}
</style>
