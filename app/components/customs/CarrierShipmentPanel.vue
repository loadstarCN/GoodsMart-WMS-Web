<script lang="ts" setup>
/**
 * 发货流程 · 运单（「运单」这一步的内容，国内 / 跨境共用；DN 已发货时只读 locked）
 *
 * 按 DN 当前的承运商（发货任务的，没有用 DN 的）走两条路：
 * - 承运商设了在线对接（status.integration）且运单方式是 api：「创建运单」+ 面单打印方式（本机记住上次的选择 → 对接设置的默认 → A4），
 *   不能建时列出原因（报关数据类的问题由「报关单证」一步列，这里不重复：hiddenBlockerCodes）；
 *   对接临时不可用时也可以改成手工填运单号
 * - 没有对接，或运单方式是手工（manualOnly）：在承运商网站 / 软件建好运单后手工填运单号（有发货任务时直接填）
 * - 运单方式是文件（fileMode）：导出 / 导回由外层 FlowWaybillFileDetail 做，这里只显示导回的运单；
 *   手工填运单号收起，作为退路（导出后等导回的 exported 记录不算「已取消」）
 * 已建运单：运单号、服务、运费；打印 / 下载面单（PDF 新标签页打开；ZPL / EPL 下载指令文件）；取消运单（二次确认）
 * 结果不明（unresolved：超时 / 补偿失败 / 响应异常）：一句话说明 + 可展开的处理步骤（到承运商后台核对），
 *   给「重试取消」（can_cancel）/「已处理，解除锁定」（can_dismiss，二次确认）；pending / cancelling（别人正在建 / 取消）
 *   只显示进行中并定时刷新。建单 504 16074 / 409 16079 / 5xx / 断网后立即重新读取状态
 * 取消 / 解除：弹确认框前先重新读取，确认框展示最新的运单号，请求带上该目标（运单号 / 记录 id）；
 *   目标已变（409 16093）时提示并重新读取。取消请求结果不明（502 / 504 maybe_processed）时重新读取并提示核对 / 重试；
 *   确认作废带运单号的记录时后端先请承运商取消，没确认 → 16094 弹窗
 * 箱子有未保存的修改时不建单（会用已保存的旧箱子），提示先保存
 * 运单变了（建单 / 取消 / 手工存运单号，或轮询、刷新时发现运单、结果不明的记录有变化）通知父组件刷新单证
 */
import type { HttpRequestError } from '~/utils/http'
import { formatMoney, formatUserRef, useCustomsPdfActions } from '~/composables/customs/customsDocuments'
import {
  CARRIER_BIZ_CODES,
  carrierShipmentUrl,
  declaredAmountOrNull,
  extractCarrierAlerts,
  extractCarrierErrors,
  hasAuxiliaryLabel,
  isActiveShipment,
  isCancellingShipment,
  isCarrierTimeout,
  isPdfLabel,
  isUnresolvedInProgress,
  LABEL_FORMATS,
  labelDocumentOf,
  labelFileExtension,
  labelFormatImageType,
  labelImageTypeOf,
  labelPrinterBridge,
  loadLabelFormat,
  normalizeCarrierStatus,
  saveLabelFormat,
  serviceNameOf,
  shouldReloadAfterCreateFailure,
  toLabelFormat,
  trackingPlaceholderKey,
  unresolvedFromError,
  type CarrierAlert,
  type CarrierRequestFailure,
  type CarrierShipmentBlocker,
  type CarrierShipment,
  type CarrierShipmentStatus,
  type CarrierWarning,
  type LabelFormat,
} from '~/composables/customs/carrierShipment'
import { isExportedShipment } from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  dnId: number | string
  /** 只读（DN 已发货，或在出库单详情只看）：不能建单、取消、解除，也不能填运单号 */
  locked?: boolean
  /** 箱数（建单确认文案用） */
  packageCount?: number | null
  /** 报关快照：申告价额、币种 */
  customs?: Record<string, any> | null
  /** DN 所属仓库：发货地址有问题时给仓库编辑页的入口 */
  warehouseId?: number | string | null
  /** 箱子有未保存的修改：此时建单会用已保存的旧箱子，要先保存 */
  packagesDirty?: boolean
  /** 当前配送任务（配送任务页传）：没有对接时可以在这里直接填运单号 */
  taskId?: number | string | null
  /** 配送任务还能改运单号（pending / in_progress） */
  trackingEditable?: boolean
  /** 外层问题清单已经列出的问题码：不在这里重复 */
  hiddenBlockerCodes?: string[]
  /** 能补录报关数据（收货人缺电话等时给「补录」） */
  canEditCustoms?: boolean
  /** 运单卡片里显示揽收一行（配送页的步骤清单有单独的「预约揽收」一步，那里不重复） */
  showPickup?: boolean
  /** 给「刷新跟踪」：刷新可能当场完成发货 / 签收 */
  trackingRefresh?: boolean
  /** 运单卡片里显示跟踪一行（发货流程有单独的「运输中」一步，那里不重复） */
  showTracking?: boolean
  /** 承运商的运单方式不是 api（手工 / 文件）：不给「创建运单」，直接填运单号（已有的在线运单照常显示、可取消） */
  manualOnly?: boolean
  /** 运单方式是文件：说明与导出 / 导回在外层，手工填运单号默认收起 */
  fileMode?: boolean
}>(), {
  locked: false,
  packageCount: null,
  customs: null,
  warehouseId: null,
  packagesDirty: false,
  taskId: null,
  trackingEditable: false,
  hiddenBlockerCodes: () => [],
  canEditCustoms: false,
  showPickup: true,
  trackingRefresh: true,
  showTracking: true,
  manualOnly: false,
  fileMode: false,
})

const emit = defineEmits<{
  /** 运单变了（建单 / 取消 / 存运单号成功，或重新读取时发现运单、结果不明的运单有变化）：父组件要刷新单证 */
  (e: 'changed'): void
  /** 读到新的状态（父组件据此显示这一步的概要） */
  (e: 'status', status: CarrierShipmentStatus | null): void
  /** 收货人等报关数据要补录 */
  (e: 'edit-customs'): void
}>()

const { t, te, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
/** 时刻按流程提供的时区（DN 所属仓库）显示；流程卡片标题旁已标出时区，这里不再逐个标 */
const { timeZone: panelTimeZone, format: formatZoned } = useTimeZone()
const zonedTime = (value: unknown, pattern: string) => formatZoned(value, pattern, { withZone: false })
const { busyDocId, viewDoc, downloadDoc, downloadRawDoc, fetchFile } = useCustomsPdfActions()
const staffStore = useStaffStore()

const loading = ref(false)
const loadError = ref<string | null>(null)
/** 后端还没有这个接口（旧版本）：整块不显示 */
const unsupported = ref(false)
const status = ref<CarrierShipmentStatus | null>(null)
type TradeDocument = { document_type: string; name: string; required: boolean; support_type?: string | null;
  document_url?: string | null; message?: string | null }
type TradeRequirements = { documents: TradeDocument[]; missing_documents: TradeDocument[];
  paper_documents: TradeDocument[]; upload_packing_list: boolean; messages?: string[] }
const tradeRequirements = ref<TradeRequirements | null>(null)
const tradeLoading = ref(false)
const tradeError = ref<string | null>(null)
const tradeFiles = ref<Record<string, File>>({})
let tradeRequestId = 0
const tradeFileKey = (doc: TradeDocument) => `${doc.document_type}|${doc.name}`
const allTradeFilesSelected = computed(() => (tradeRequirements.value?.missing_documents || [])
  .every((doc) => !!tradeFiles.value[tradeFileKey(doc)]))
const chooseTradeFile = (doc: TradeDocument, event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  const key = tradeFileKey(doc)
  if (!file) { delete tradeFiles.value[key]; return }
  if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) {
    delete tradeFiles.value[key]
    showToast(t('customs.carrier.tips.trade-pdf-limit'), 'error')
    return
  }
  tradeFiles.value[key] = file
}
const creating = ref(false)
const cancelling = ref(false)
const dismissing = ref(false)
const failure = ref<CarrierRequestFailure | null>(null)
/** 建单成功时承运商返回的提示 */
const alerts = ref<CarrierAlert[]>([])
/** 面单打印方式：上次的选择（localStorage）优先，没有时用对接设置的默认，最后 A4 */
const labelFormat = ref<LabelFormat>('A4')
/** 用户自己选过（localStorage 里有）：对接设置的默认不覆盖 */
let labelFormatChosen = false

// ------------------ 读取 ----------------------
/** 运单的识别信息（id / 运单号 / 状态）＋任务上的运单号：任一变化说明单证要重新读取 */
const shipmentSignature = (s: CarrierShipmentStatus | null) => {
  const sh = s?.shipment
  return `${sh?.id ?? ''}|${sh?.tracking_number ?? ''}|${sh?.status ?? ''}|${s?.tracking_number ?? ''}`
}

const loadTradeRequirements = async () => {
  const requestId = ++tradeRequestId
  tradeRequirements.value = null
  tradeError.value = null
  tradeFiles.value = {}
  if (!status.value?.regulatory_check_enabled || !status.value.can_create) {
    tradeLoading.value = false
    return
  }
  tradeLoading.value = true
  await httpRequest<TradeRequirements>(`${carrierShipmentUrl(props.dnId)}/trade-requirements`, {
    method: 'GET',
    onSuccess: (data) => { if (requestId === tradeRequestId) tradeRequirements.value = data },
    onError: (error) => { if (requestId === tradeRequestId) tradeError.value = bizErrorMessage(error) },
    onFinally: () => { if (requestId === tradeRequestId) tradeLoading.value = false },
  })
}

/**
 * 写入后端最新状态。与之前相比运单变了，或结果不明的运单由有变无时，通知父组件刷新单证；
 * 首次读取不通知（父组件同时在读单证）。读到新的有效运单时清掉之前建单失败 / 超时的提示。
 * 返回是否已通知父组件。
 */
const applyStatus = (next: CarrierShipmentStatus | null): boolean => {
  const prev = status.value
  status.value = next
  const shipmentChanged = shipmentSignature(prev) !== shipmentSignature(next)
  if (shipmentChanged && isActiveShipment(next?.shipment ?? null)) failure.value = null
  if (!prev) return false
  const unresolvedGone = !!prev.unresolved && !next?.unresolved
  if (shipmentChanged || unresolvedGone) {
    emit('changed')
    return true
  }
  return false
}

/** 重新读取状态；返回是否因运单变化通知了父组件 */
const load = async (): Promise<boolean> => {
  loading.value = true
  loadError.value = null
  let notified = false
  await httpRequest<CarrierShipmentStatus>(carrierShipmentUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      notified = applyStatus(normalizeCarrierStatus(data))
      unsupported.value = false
      const defaultFormat = toLabelFormat(status.value?.default_label_format)
      if (!labelFormatChosen && defaultFormat) labelFormat.value = defaultFormat
    },
    onError: (error) => {
      if (error.status === 404 && (error.code === undefined || error.code === null)) {
        unsupported.value = true
        status.value = null
        return
      }
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
  await loadTradeRequirements()
  return notified
}

onMounted(() => {
  const saved = loadLabelFormat()
  if (saved) {
    labelFormat.value = saved
    labelFormatChosen = true
  }
  load()
})
watch(status, (value: CarrierShipmentStatus | null) => emit('status', value))

// ------------------ 状态 ----------------------
const integration = computed(() => status.value?.integration || null)
const carrierName = computed(() => integration.value?.name || status.value?.carrier?.name || t('customs.carrier.carrier-fallback'))
/** 手填运单号的示例：按承运商认得的号码格式（认不出时不举具体格式） */
const trackingPlaceholder = computed(() =>
  trackingPlaceholderKey(status.value?.carrier?.code, integration.value?.code, status.value?.carrier?.name))
/** 承运商自己的发货后台（结果不明时去那里核对） */
const portalName = computed(() => integration.value?.portal_name || t('customs.carrier.portal-fallback', { carrier: carrierName.value }))
const shipment = computed(() => status.value?.shipment || null)
const activeShipment = computed(() => (isActiveShipment(shipment.value) ? shipment.value : null))
const tradeDocuments = computed(() => activeShipment.value?.trade_documents || null)
const paperDocuments = computed(() => (tradeDocuments.value?.generation_details || [])
  .filter((item) => Number(item.minimum_copies_required) > 0))
const regulatoryPaperDocuments = computed(() => tradeDocuments.value?.regulatory_requirements?.paper_documents || [])
const electronicWithOriginals = computed(() =>
  tradeDocuments.value?.etd_type === 'ELECTRONIC_DOCUMENTS_WITH_ORIGINALS')
const fedexDocumentName = (type?: string | null) => {
  if (type === 'COMMERCIAL_OR_PRO_FORMA_INVOICE' || type === 'COMMERCIAL_INVOICE')
    return t('customs.carrier.tips.commercial-invoice')
  if (type === 'AIR_WAYBILL') return t('customs.carrier.tips.air-waybill')
  return String(type || '').replaceAll('_', ' ')
}
/** 运单卡片里显示揽收一行：承运商要另约揽收，或这张运单已经有过预约 */
const pickupVisible = computed(() => {
  const s = activeShipment.value
  return props.showPickup && !!s && s.pickup !== undefined && (!!integration.value?.books_pickups || !!s.pickup)
})
const pickupLink = computed(() => ({
  path: '/delivery/pickup',
  query: { carrier_id: status.value?.carrier?.id ?? undefined, warehouse_id: props.warehouseId ?? undefined },
}))
/** 有效运单的揽收预约：已约上且揽收日没过 */
const pickupScheduled = computed(() => {
  const p = activeShipment.value?.pickup
  return !!p && p.status === 'scheduled' && !p.past
})
const pickupText = computed(() => {
  const p = activeShipment.value?.pickup
  if (!p || ['cancelled', 'failed', 'dismissed'].includes(p.status)) return t('customs.carrier.pickup.none')
  if (p.status === 'scheduled' && p.past) return t('customs.carrier.pickup.past', { date: p.pickup_date })
  if (p.status === 'scheduled') {
    return t('customs.carrier.pickup.scheduled', {
      date: p.pickup_date, window: `${p.ready_time || '—'}–${p.close_time || '—'}`, code: p.confirmation_code || '—',
    })
  }
  return t(p.status === 'pending' ? 'customs.carrier.pickup.pending' : 'customs.carrier.pickup.unknown')
})
// ------------------ 跟踪（插件能跟踪时：揽收后自动完成发货、送达后自动签收） ----------------------
const tracking = computed(() => activeShipment.value?.tracking || null)
const trackingVisible = computed(() =>
  props.showTracking && !!activeShipment.value && (!!integration.value?.tracks_shipments || !!tracking.value))
const trackingText = computed(() => {
  const tr = tracking.value
  if (!tr || !tr.status) return t('customs.carrier.tracking.none')
  const parts = [t(`customs.carrier.tracking.status.${tr.status}`, { carrier: carrierName.value })]
  if (tr.status_text) parts[0] += `（${tr.status_text}）`
  const latest = tr.events?.[0]
  if (latest && tr.status !== 'label_created') {
    parts.push(t('customs.carrier.tracking.latest', {
      event: [latest.description, latest.location].filter(Boolean).join(' · ') || latest.code || '—',
    }))
  }
  if (tr.status === 'delivered') {
    // 送达时刻：只有日期（没有时分）时不补 00:00；没有就不写，也不再写「预计送达」
    const at = tr.delivered_at || ''
    if (at.length > 10) {
      parts.push(t('customs.carrier.tracking.delivered-at', { time: zonedTime(at, 'YYYY-MM-DD HH:mm') }))
    } else if (at) {
      parts.push(t('customs.carrier.tracking.delivered-at', { time: at }))
    }
  } else if (tr.estimated_delivery) {
    parts.push(t('customs.carrier.tracking.eta', { date: tr.estimated_delivery }))
  }
  return parts.join(' · ')
})
/** 跟踪状态的圆点：异常 / 查不到红、送达绿、在途紫 */
const trackingTone = computed<'bad' | 'ok' | 'info' | 'none'>(() => {
  const s = tracking.value?.status
  if (s === 'exception' || s === 'unknown') return 'bad'
  if (s === 'delivered') return 'ok'
  if (s === 'in_transit' || s === 'out_for_delivery') return 'info'
  return 'none'
})
const trackingRefreshing = ref(false)
const canRefreshTracking = computed(() => props.trackingRefresh && trackingVisible.value)
/**
 * 立即查一次跟踪；揽收 / 送达了会当场自动完成发货 / 签收。定时任务也可能早就做了（这次 shipped = 0），
 * 所以刷新完总是通知父组件重读发货任务（父组件按任务状态有没有变决定要不要整页重读）
 */
const refreshTracking = async () => {
  if (trackingRefreshing.value || busy.value) return
  trackingRefreshing.value = true
  let result: any = null
  await httpRequest<any>(`${carrierShipmentUrl(props.dnId)}/track`, {
    method: 'POST',
    onSuccess: (data) => {
      result = data
    },
    onError: (error) => showToast(bizErrorMessage(error), 'warning'),
  })
  if (result) {
    const next = normalizeCarrierStatus(result)
    const notified = next ? applyStatus(next) : await load()
    const sync = result.tracking_sync || {}
    if (sync.shipped || sync.signed) {
      showToast(t(sync.signed ? 'customs.carrier.tracking.auto-signed' : 'customs.carrier.tracking.auto-shipped',
        { carrier: carrierName.value }), 'success')
    }
    if (!notified) emit('changed')
  } else {
    // 失败（如运单刚被取消 → 16134）：按服务端最新状态显示
    await load()
  }
  trackingRefreshing.value = false
}

/** 运单正在取消（cancelling）：按进行中处理 */
const cancellingShipment = computed(() => (isCancellingShipment(shipment.value) ? shipment.value : null))
const lastCancelled = computed<CarrierShipment | null>(() =>
  (shipment.value && !isActiveShipment(shipment.value) && !isCancellingShipment(shipment.value)
    && !isExportedShipment(shipment.value) ? shipment.value : null))
/** 结果不明的运单（承运商那边可能已生成）：有它时不能建单 */
const unresolved = computed(() => status.value?.unresolved || null)
/** 别人正在建 / 取消（pending / cancelling 且不能解除）：只显示进行中 */
const unresolvedInProgress = computed(() => isUnresolvedInProgress(status.value))
/** 进行中的是取消（cancelling），不是建单 */
const unresolvedCancelling = computed(() => unresolvedInProgress.value && unresolved.value?.status === 'cancelling')
/** 取消结果不明（cancelling 且没有在进行）：承运商那边可能还有效，要重试取消或核对后确认作废 */
const unresolvedCancelUnknown = computed(() =>
  !!unresolved.value && !unresolvedInProgress.value && unresolved.value.status === 'cancelling')
const canDismiss = computed(() => !!unresolved.value && !!status.value?.can_dismiss && !props.locked)
/**
 * 可以（重试）取消：以后端 can_cancel 为准（有效运单、取消结果不明的运单、带运单号的结果不明记录）；
 * 旧后端没有 can_cancel 时只在有有效运单时可取消
 */
const canCancel = computed(() => {
  if (props.locked || !status.value) return false
  const allowed = status.value.can_cancel
  return allowed === undefined ? !!activeShipment.value : allowed
})
/** 要取消的运单号（确认框展示、请求里带上）：有效运单的号码，否则是结果不明记录 / 取消中运单的号码 */
const cancelTargetTracking = computed(() =>
  activeShipment.value?.tracking_number || unresolved.value?.tracking_number || cancellingShipment.value?.tracking_number || '')
/** 结果不明区里给「重试取消」：没有有效运单、不在进行中、后端允许取消 */
const canRetryCancel = computed(() => canCancel.value && !activeShipment.value && !!unresolved.value && !unresolvedInProgress.value)
const canCreate = computed(() =>
  !!integration.value && !props.manualOnly && !props.locked && !!status.value?.can_create && !activeShipment.value && !cancellingShipment.value
  && !unresolved.value && !tradeLoading.value && !tradeError.value
  && (!status.value?.regulatory_check_enabled || (!!tradeRequirements.value && allTradeFilesSelected.value)))
const busy = computed(() =>
  creating.value || cancelling.value || dismissing.value || savingTracking.value || trackingRefreshing.value)
const unresolvedReasonText = computed(() => {
  const reason = unresolved.value?.reason
  if (!reason) return ''
  const key = `customs.carrier.unresolved.reasons.${reason}`
  return te(key) ? t(key, { carrier: carrierName.value }) : reason
})

/*
 * 别人正在建单 / 取消（pending / cancelling）：定时重新读取，直到有结果。
 * 后端把 pending 自 created_at、取消进行中（cancelling + cancel_in_progress）自 updated_at 起超过
 * CARRIER_PENDING_STALE_MINUTES（默认 10 分钟）的记录按结果不明（stale）返回，此后 can_dismiss = true、不再是「进行中」，
 * 轮询自然停止。所以按记录的时间轮询到「判定卡住的时刻 + 余量」；记录时间不可用（缺失 / 晚于现在：时钟或时区不一致）时
 * 按刚开始算；已过该时刻仍在进行中（后端把时限配得更长等）时从开始轮询起至少再轮询一段。
 * 到点仍在进行中就停止并提示手动刷新。
 */
const IN_PROGRESS_POLL_MS = 10000
/** 与后端 DEFAULT_PENDING_STALE_MINUTES 一致 */
const BACKEND_STALE_AFTER_MS = 10 * 60 * 1000
/** 判定卡住之后再多等的时间（后端判定时刻 + 一次轮询的间隔 + 时钟误差） */
const STALE_GRACE_MS = 90 * 1000
/** 已过判定时刻仍在进行中时，从开始轮询起至少再轮询的时间 */
const MIN_POLL_WINDOW_MS = 2 * 60 * 1000
/** 记录时间比本机「现在」晚这么多以内按时钟误差处理 */
const CLOCK_SKEW_MS = 60 * 1000
// 运单取消中但后端同时给了结果不明记录时，以记录为准（取消结果不明不是进行中，不轮询）
const inProgress = computed(() => unresolvedInProgress.value || (!!cancellingShipment.value && !unresolved.value))
/** 进行中的记录开始计时的时间：建单中（pending）看 created_at，取消中（cancelling）看 updated_at */
const inProgressSince = computed<string | null>(() => {
  const u = unresolved.value
  if (u && unresolvedInProgress.value) {
    return u.status === 'cancelling' ? (u.updated_at || u.created_at) : u.created_at
  }
  const s = cancellingShipment.value
  if (s && !u) return s.updated_at || null
  return null
})
const parseTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null
  // 不带时区的旧值按仓库时区解释（与 Date.now() 比较）
  return parseDateTime(value, panelTimeZone.value)?.getTime() ?? null
}
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStartedAt = 0
/** 组件已卸载：轮询回调里检查，不再请求、不再排程 */
let unmounted = false
/** 到了轮询上限仍在进行中：停止自动刷新，提示手动刷新 */
const pollExhausted = ref(false)
/** 继续自动刷新的截止时间（按最新读到的记录时间动态计算） */
const pollDeadline = (): number => {
  const now = Date.now()
  const since = parseTimestamp(inProgressSince.value)
  if (since === null || since > now + CLOCK_SKEW_MS) return pollStartedAt + BACKEND_STALE_AFTER_MS + STALE_GRACE_MS
  return Math.max(since + BACKEND_STALE_AFTER_MS + STALE_GRACE_MS, pollStartedAt + MIN_POLL_WINDOW_MS)
}
const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}
const schedulePoll = () => {
  stopPolling()
  if (unmounted || !inProgress.value) return
  if (Date.now() >= pollDeadline()) {
    pollExhausted.value = true
    return
  }
  pollTimer = setTimeout(async () => {
    pollTimer = null
    if (unmounted) return
    if (!busy.value) await load()
    // 读取期间组件被卸载：不再排程
    if (unmounted) return
    schedulePoll()
  }, IN_PROGRESS_POLL_MS)
}
const startPolling = () => {
  pollStartedAt = Date.now()
  pollExhausted.value = false
  schedulePoll()
}
watch(inProgress, (value: boolean) => {
  if (value) {
    startPolling()
  } else {
    stopPolling()
    pollExhausted.value = false
  }
})
/** 手动刷新：自动刷新已停止而仍在进行中时，重新开始轮询 */
const refresh = async () => {
  await load()
  if (!unmounted && inProgress.value && !pollTimer) startPolling()
}
onBeforeUnmount(() => {
  unmounted = true
  stopPolling()
})

// ------------------ 面单 ----------------------
const labelDoc = computed(() => labelDocumentOf(activeShipment.value))
const labelImageType = computed(() => labelImageTypeOf(activeShipment.value))
const pdfLabel = computed(() => isPdfLabel(activeShipment.value))
const auxiliaryLabel = computed(() => hasAuxiliaryLabel(activeShipment.value))
/** 手工 / 文件来源、没有面单文件的运单：面单在承运商那边打 */
const labelElsewhere = computed(() => !!activeShipment.value && !labelDoc.value
  && ['manual', 'file'].includes(String(activeShipment.value.source || '')))
/** 这家承运商支持的打印方式（对接设置里有的），没有时按两种都有 */
const labelFormatOptions = computed<LabelFormat[]>(() => {
  const supported = Object.keys(status.value?.label_formats || {})
  const list = LABEL_FORMATS.filter((f) => supported.length === 0 || supported.includes(f))
  return list.length > 0 ? list : LABEL_FORMATS
})
watch(labelFormatOptions, (options: LabelFormat[]) => {
  if (!options.includes(labelFormat.value)) labelFormat.value = options[0] || 'A4'
})
/** 用户选打印方式：记住，下次默认用它 */
const chooseLabelFormat = (format: LabelFormat) => {
  labelFormat.value = format
  labelFormatChosen = true
  saveLabelFormat(format)
}
const labelFormatSelect = computed(() => labelFormatOptions.value.map((f) => ({ value: f, label: labelFormatText(f) })))
const labelFormatText = (format: string | null | undefined) => {
  const key = `customs.carrier.label-formats.${String(format || '').toUpperCase()}`
  return format && te(key) ? t(key) : (format || '')
}
/** 打印提示（一行）与详细说明（悬停）：PDF 按纸张；ZPL / EPL 是指令文件 */
const printHint = (format: string | null | undefined, imageType: string) => {
  if (!['PDF', 'PNG'].includes(imageType)) {
    return { text: t('customs.carrier.tips.print-file', { type: imageType }), help: '' }
  }
  const thermal = String(format || '').toUpperCase() === 'THERMAL'
  return {
    text: t(thermal ? 'customs.carrier.tips.print-thermal' : 'customs.carrier.tips.print-a4'),
    help: t(thermal ? 'customs.carrier.tips.print-thermal-help' : 'customs.carrier.tips.print-a4-help'),
  }
}
const activePrintHint = computed(() =>
  activeShipment.value ? printHint(activeShipment.value.label_format || 'A4', labelImageType.value) : null)
const selectedPrintHint = computed(() => printHint(labelFormat.value, labelFormatImageType(status.value, labelFormat.value)))

const warnings = computed<CarrierWarning[]>(() => status.value?.warnings || [])
const money = (v: unknown) => formatMoney(Number(v), props.customs?.currency || 'JPY')
const isAmount = (x: unknown) => x !== null && x !== undefined && x !== '' && !isNaN(Number(x))
const warningText = (w: CarrierWarning) => {
  const key = `customs.carrier.warnings.${w.code}`
  if (!w.code || !te(key)) return w.message || w.code || ''
  return t(key, {
    original: isAmount(w.requested) ? money(w.requested) : '—',
    // 实际提交 0 = 不提交申告价额
    amount: declaredAmountOrNull(w.applied) !== null ? money(w.applied) : '—',
  })
}

// ------------------ 已建运单的说明 ----------------------
/** 建单人：后端只给用户 id 时显示「用户 #id」 */
const userText = (u: any) => formatUserRef(u, t)
const packageTrackingNumbers = computed(() => {
  const list = activeShipment.value?.package_tracking_numbers
  return Array.isArray(list) ? list.filter(Boolean) : []
})
/**
 * 申告价额：运单上记的是实际提交值，比报关快照小时注明已调整。
 * 申告价额为 0 按「没有申告价额」处理（后端把 0 视为不提交），不显示
 */
const declaredValueText = computed(() => {
  const raw = activeShipment.value?.declared_value
  const submitted = declaredAmountOrNull(raw)
  const original = declaredAmountOrNull(isAmount(status.value?.declared_value_carriage)
    ? status.value?.declared_value_carriage
    : props.customs?.declared_value_carriage)
  if (submitted !== null) {
    if (original !== null && original !== submitted) {
      return t('customs.carrier.tips.declared-value-submitted-capped', { amount: money(submitted), original: money(original) })
    }
    return t('customs.carrier.tips.declared-value-submitted', { amount: money(submitted) })
  }
  // 旧数据没有 declared_value 时按快照显示
  if (raw === undefined && original !== null) {
    return t('customs.carrier.tips.declared-value-submitted', { amount: money(original) })
  }
  return ''
})
const shipmentFacts = computed(() => {
  const s = activeShipment.value
  if (!s) return []
  const facts = [serviceNameOf(s, String(localeProperties.value?.iso || '') || null)]
  if (s.net_charge !== null && s.net_charge !== undefined && s.net_charge !== '') {
    facts.push(formatMoney(Number(s.net_charge), s.currency || 'JPY'))
  }
  if (s.package_count) facts.push(t('customs.carrier.fields.package-count', { count: s.package_count }))
  return facts.filter(Boolean)
})

// ------------------ 不能建单的原因 ----------------------
/** 在别处表达的原因：打包状态、箱子（本步只在建单区说），外层问题清单列过的报关问题 */
const STEP_HANDLED_BLOCKERS = ['NOT_PACKED', 'DN_SHIPPED', 'PACKAGES_MISSING', 'SHIPMENT_EXISTS', 'CARRIER_NOT_SET',
  'CARRIER_NOT_INTEGRATED']
const blockers = computed<CarrierShipmentBlocker[]>(() =>
  (status.value?.blockers || []).filter((b: CarrierShipmentBlocker) =>
    !STEP_HANDLED_BLOCKERS.includes(b.code) && !props.hiddenBlockerCodes.includes(b.code)))
/** 要改承运商对接设置的原因 */
const SETTINGS_BLOCKERS = ['CARRIER_INTEGRATION_DISABLED', 'CARRIER_NOT_CONFIGURED', 'CARRIER_CONFIG_INVALID',
  'INCOTERM_DUTIES_MISMATCH']
/** 要改公司 / 仓库出口资料的原因 */
const EXPORTER_BLOCKERS = ['SHIPPER_ADDRESS_INVALID', 'EXPORTER_PROFILE_INCOMPLETE']
/** 收货人信息（报关数据）的原因 */
const CONSIGNEE_BLOCKERS = ['RECIPIENT_ADDRESS_INVALID', 'RECIPIENT_NAME_MISSING', 'RECIPIENT_PHONE_MISSING']
const canEditCarrier = computed(() => staffStore.hasPermission('carrier_edit'))
const carrierSettingsUrl = computed(() => (status.value?.carrier?.id ? `/carrier/edit/${status.value.carrier.id}` : '/carrier/'))
const blockerText = (b: CarrierShipmentBlocker & Record<string, any>) => {
  // 承运商相关的文案优先；签发单证的条件不全时后端直接复用单证问题码
  const params = { carrier: carrierName.value, limit: b.limit ?? '', tracking: status.value?.tracking_number || '' }
  for (const key of [`customs.carrier.blockers.${b.code}`, `customs.problems.${b.code}`]) {
    if (te(key)) return t(key, params)
  }
  return b.message || b.code
}

// ------------------ 没有对接：手工填运单号 ----------------------
/** 配送任务页、任务还能改：可以直接填运单号 */
const canEnterTracking = computed(() => !props.locked && !!props.taskId && props.trackingEditable)
/** 有对接时手工填运单号默认收起（对接不可用时的退路） */
const manualOpen = ref(false)
const manualTracking = ref('')
const savedTracking = computed(() => status.value?.tracking_number || '')
watch(savedTracking, (value: string) => {
  manualTracking.value = value
}, { immediate: true })
const trackingChanged = computed(() => manualTracking.value.trim() !== savedTracking.value)
const savingTracking = ref(false)
const TRACKING_MAX_LENGTH = 100
/** 保存运单号要弹窗说明的业务码：自动运单锁定（16078）/ 结果不明（16079）/ 与 CI 上的运单号不一致（16080） */
const TRACKING_BLOCK_CODES = [16078, 16079, 16080, 16091, 16092]
const saveTracking = async () => {
  if (!canEnterTracking.value || busy.value) return
  const tracking = manualTracking.value.trim()
  if (tracking.length > TRACKING_MAX_LENGTH) {
    showToast(t('delivery.validation.tracking-too-long', { max: TRACKING_MAX_LENGTH }), 'error')
    return
  }
  savingTracking.value = true
  let saved = false
  // 带上任务的承运商：手填的运单号记成该承运商的手工运单
  const carrierId = status.value?.carrier?.id
  await httpRequest<any>(`/api/warehouse/delivery/${props.taskId}/tracking`, {
    method: 'PUT',
    body: carrierId ? { tracking_number: tracking, carrier_id: carrierId } : { tracking_number: tracking },
    onSuccess: () => {
      saved = true
      showToast(t(tracking ? 'customs.carrier.tips.tracking-saved' : 'customs.carrier.tips.tracking-cleared'), 'success')
    },
    onError: (error) => {
      if (TRACKING_BLOCK_CODES.includes(Number(error.code))) {
        wAlert({ title: t('delivery.tips.tracking-blocked-title'), message: bizErrorMessage(error), tone: 'error' })
        return
      }
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      savingTracking.value = false
    },
  })
  if (saved) {
    const notified = await load()
    if (!notified) emit('changed')
  }
}

// ------------------ 失败：显示承运商错误原文 ----------------------
/**
 * op：本次请求是建单还是取消。「超时，运单可能已经建好」只在建单请求、且超时发生在建单这一步
 *（details.action 为 create，或网关超时没有 details）时显示；取消超时、电子单证上传超时（运单还没请求）不显示。
 * summaryOverride：自定义概要（如取消结果不明），此时也不显示该提示
 */
const handleFailure = (error: HttpRequestError, op: 'create' | 'cancel', summaryOverride?: string) => {
  const summary = summaryOverride || bizErrorMessage(error)
  // 409：前置条件不满足，details.blockers 是最新的原因清单
  const latest = error.details?.blockers
  if (Array.isArray(latest) && status.value) {
    status.value = { ...status.value, blockers: latest, can_create: false }
  }
  // 504 16074 / 409 16079：details.unresolved 是结果不明的运单，先锁住建单按钮（随后重新读取状态）
  const pending = unresolvedFromError(error)
  if (pending && status.value) {
    status.value = { ...status.value, unresolved: pending, can_create: false }
  }
  const { errors, transactionId, action, permissionDenied, maybeProcessed } = extractCarrierErrors(error.details)
  const timeout = isCarrierTimeout(error)
  const createTimedOut = op === 'create' && timeout && maybeProcessed && (!action || action === 'create')
  if (errors.length > 0 || transactionId || timeout || error.status === 502) {
    failure.value = {
      summary,
      // 没有逐条错误时把后端原文也带上（后端 message 里带着承运商原文，业务码文案会盖住它）
      errors: errors.length > 0 || !error.message || error.message === summary ? errors : [{ code: null, message: error.message }],
      transactionId,
      timeout: !summaryOverride && createTimedOut,
      action,
      permissionDenied,
    }
  }
  showToast(summary, 'error')
}
const actionText = (action: string | null) => {
  if (!action) return ''
  const key = `customs.carrier.actions.${action}`
  return te(key) ? t(key) : action
}

// ------------------ 建单 ----------------------
const create = async () => {
  if (!canCreate.value || busy.value) return
  // 箱子有未保存的修改：建单会用已保存的旧箱子（之后再保存箱子会 16076，只能取消重建），先保存
  if (props.packagesDirty) {
    wAlert({ title: t('customs.carrier.create-confirm-title'), message: t('customs.carrier.tips.packages-unsaved'), tone: 'warning' })
    return
  }
  const format = labelFormat.value
  const params = { carrier: carrierName.value, format: labelFormatText(format), count: props.packageCount ?? '' }
  const confirmed = await wConfirm({
    title: t('customs.carrier.create-confirm-title'),
    message: t(props.packageCount ? 'customs.carrier.create-confirm-packages' : 'customs.carrier.create-confirm', params),
    confirmText: t('customs.carrier.operations.create'),
    cancelText: t('customs.carrier.operations.back'),
  })
  if (!confirmed) return

  creating.value = true
  failure.value = null
  alerts.value = []
  let created: any = null
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let failedWith = null as HttpRequestError | null
  const body = new FormData()
  body.append('label_format', format)
  for (const doc of tradeRequirements.value?.missing_documents || []) {
    const file = tradeFiles.value[tradeFileKey(doc)]
    if (file) {
      body.append('trade_documents', file)
      body.append('trade_document_types', doc.document_type)
      body.append('trade_document_names', doc.name)
    }
  }
  await httpRequest<any>(carrierShipmentUrl(props.dnId), {
    method: 'POST',
    body,
    onSuccess: (data) => {
      created = data ?? {}
    },
    onError: (error) => {
      failedWith = error
      handleFailure(error, 'create')
    },
  })
  // 超时 / 结果不明 / 5xx / 断网：运单可能已经建好，立刻按后端最新状态（unresolved、can_create）刷新按钮；
  // 409 16072（前置条件不满足：别人刚建好运单、DN 状态变了等）同样重读，画面不停在旧状态。
  // 读到后端其实已建好的运单时 load() 会通知父组件刷新单证
  if (failedWith && shouldReloadAfterCreateFailure(failedWith)) {
    await load()
  }
  if (created) {
    const next = normalizeCarrierStatus(created)
    const notified = next ? applyStatus(next) : await load()
    alerts.value = extractCarrierAlerts(created)
    const tracking = created?.shipment?.tracking_number || created?.tracking_number || activeShipment.value?.tracking_number || ''
    showToast(t('customs.carrier.created', { tracking }), 'success')
    // 已因运单变化通知过就不再重复通知
    if (!notified) emit('changed')
  }
  creating.value = false
}

/**
 * 弹确认框前重新读取：确认框要展示服务端当前的运单 / 结果不明记录（别人可能刚取消、解除或重建过）。
 * 读取失败时提示并返回 false（不弹确认框）。
 */
const reloadBeforeConfirm = async (): Promise<boolean> => {
  await load()
  if (loadError.value) {
    showToast(loadError.value, 'error')
    return false
  }
  return true
}

/** 409 16093：取消 / 解除的目标与服务端当前记录不符（别人刚操作过）→ 提示并按最新状态显示 */
const isTargetMismatch = (error: HttpRequestError | null) => error?.code === CARRIER_BIZ_CODES.TARGET_MISMATCH

/**
 * 取消结果不明：502 / 504 且 details.maybe_processed、或网络断开 / 网关超时——
 * 承运商可能已经取消也可能没有，记录停在 cancelling，要重新读取并提示核对 / 重试
 */
const isCancelOutcomeUnknown = (error: HttpRequestError | null) =>
  !!error && (error.details?.maybe_processed === true || error.status === 504 || !error.status || error.status < 0)

// ------------------ 取消运单（含重试取消：取消结果不明 / 带运单号的结果不明记录） ----------------------
const cancel = async () => {
  if (!canCancel.value || busy.value) return
  cancelling.value = true
  // 先重新读取：确认框展示的是服务端当前要取消的运单，请求也带它的运单号
  const fresh = await reloadBeforeConfirm()
  cancelling.value = false
  if (!fresh) return
  if (!canCancel.value) {
    // 运单已被别人取消（或正在取消）：已按最新状态显示
    showToast(t('customs.carrier.tips.target-changed'), 'warning')
    return
  }
  const tracking = cancelTargetTracking.value
  // 有效运单用原确认文案；重试取消（取消结果不明 / 结果不明记录）说明是再次请求取消
  const retry = !activeShipment.value
  const params = { tracking: tracking || '—', carrier: carrierName.value }
  const confirmed = await wConfirm({
    title: t('customs.carrier.cancel-confirm-title', params),
    message: t(retry ? 'customs.carrier.cancel-retry-confirm' : 'customs.carrier.cancel-confirm', params),
    confirmText: t(retry ? 'customs.carrier.operations.retry-cancel' : 'customs.carrier.operations.cancel'),
    cancelText: t('customs.carrier.operations.keep'),
    danger: true,
  })
  if (!confirmed || busy.value) return

  cancelling.value = true
  failure.value = null
  alerts.value = []
  let done = false
  let result: any = null
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let failedWith = null as HttpRequestError | null
  await httpRequest<any>(`${carrierShipmentUrl(props.dnId)}/cancel`, {
    method: 'POST',
    // 带上确认框里的运单号：服务端当前的有效运单不是它 → 409 16093
    body: { tracking_number: tracking },
    onSuccess: (data) => {
      done = true
      result = data
    },
    onError: (error) => {
      failedWith = error
      if (isTargetMismatch(error)) {
        showToast(bizErrorMessage(error), 'warning')
        return
      }
      // 取消结果不明：概要换成「不确定是否已取消」（承运商原文仍列在下面）
      handleFailure(error, 'cancel', isCancelOutcomeUnknown(error)
        ? t('customs.carrier.tips.cancel-unknown', { portal: portalName.value }) : undefined)
    },
  })
  if (done) {
    const next = normalizeCarrierStatus(result)
    const notified = next ? applyStatus(next) : await load()
    if (next) await loadTradeRequirements()
    showToast(t('customs.carrier.cancelled', { tracking: tracking || '—' }), 'success')
    // 已因运单变化通知过就不再重复通知
    if (!notified) emit('changed')
  } else if (failedWith) {
    // 目标已变 / 取消结果不明 / 已有取消在进行（16079）/ 运单已被别人取消（16075）/ 承运商拒绝等：按后端最新状态显示
    //（运单变了时 load() 会通知父组件刷新单证）
    await load()
    if (isCancelOutcomeUnknown(failedWith)) {
      wAlert({ title: t('customs.carrier.unresolved.cancel-unknown-title'),
        message: t('customs.carrier.tips.cancel-unknown', { portal: portalName.value }), tone: 'warning' })
    }
  }
  cancelling.value = false
}

// ------------------ 解除结果不明的运单（操作员已在承运商后台核对） ----------------------
const dismiss = async () => {
  if (!unresolved.value || !canDismiss.value || busy.value) return
  dismissing.value = true
  // 先重新读取：确认框展示的是服务端当前的结果不明记录（交易号 / 运单号），请求也带它的 id
  const fresh = await reloadBeforeConfirm()
  dismissing.value = false
  const u = unresolved.value
  if (!fresh) return
  if (!u || !canDismiss.value) {
    // 已被别人解除，或变成了进行中：已按最新状态显示
    showToast(t('customs.carrier.tips.target-changed'), 'warning')
    return
  }
  const confirmed = await wConfirm({
    title: t('customs.carrier.unresolved.dismiss-confirm-title'),
    // 有运单号：后端会先请承运商取消，承运商确认已取消 / 查无此运单才作废（否则 16094）
    message: t(u.tracking_number ? 'customs.carrier.unresolved.dismiss-confirm-tracking' : 'customs.carrier.unresolved.dismiss-confirm', {
      portal: portalName.value,
      carrier: carrierName.value,
      tracking: u.tracking_number || '—',
    }),
    confirmText: t('customs.carrier.operations.dismiss'),
    cancelText: t('customs.carrier.operations.back'),
    danger: true,
  })
  if (!confirmed || busy.value) return

  dismissing.value = true
  failure.value = null
  let done = false
  let result: any = null
  await httpRequest<any>(`${carrierShipmentUrl(props.dnId)}/dismiss`, {
    method: 'POST',
    // 带上确认框里那条记录的 id：服务端当前要解除的不是它（别人解除后又有新的结果不明运单）→ 409 16093
    body: { confirm: true, unresolved_id: u.id },
    onSuccess: (data) => {
      done = true
      result = data
    },
    onError: (error) => {
      // 16094：承运商没确认已取消，不能作废——要先在承运商后台取消，用弹窗说明
      if (error.code === CARRIER_BIZ_CODES.DISMISS_NOT_CONFIRMED) {
        wAlert({ title: t('customs.carrier.unresolved.dismiss-confirm-title'), message: bizErrorMessage(error), tone: 'warning' })
        return
      }
      showToast(bizErrorMessage(error), isTargetMismatch(error) ? 'warning' : 'error')
    },
  })
  // 成功返回与 GET 同形；失败（如 16075 已没有可解除的运单）也重新读取，按最新状态显示
  //（结果不明的运单解除后会通知父组件刷新单证）
  const next = done ? normalizeCarrierStatus(result) : null
  if (next) {
    applyStatus(next)
    await loadTradeRequirements()
  } else {
    await load()
  }
  if (done) showToast(t('customs.carrier.unresolved.dismissed'), 'success')
  dismissing.value = false
}

// ------------------ 指令文件面单（ZPL / EPL）：发送到标签机（扩展点，现在不可用） ----------------------
const sendingToPrinter = ref(false)
const sendToPrinter = async () => {
  const doc = labelDoc.value
  if (!doc || !labelPrinterBridge.available || sendingToPrinter.value) return
  sendingToPrinter.value = true
  try {
    const file = await fetchFile(props.dnId, doc, false)
    if (file) {
      await labelPrinterBridge.send(file.blob, labelImageType.value)
      showToast(t('action-results.success'), 'success')
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('action-results.failed'), 'error')
  } finally {
    sendingToPrinter.value = false
  }
}

/** 发货单详情右栏「运单与包裹」的「取消运单」经这里（与这一步里的按钮同一个流程） */
defineExpose({ reload: async () => { await load() }, cancel })
</script>

<template>
  <div v-if="!unsupported" class="w-cship">
    <div v-if="loading && !status" class="w-cship__loading" aria-busy="true">
      <span class="w-cship__skeleton" /><span class="w-cship__skeleton is-short" />
    </div>
    <WAlert v-else-if="loadError && !status" tone="block" :title="loadError" />

    <template v-else-if="status">
      <!-- ===== 结果不明 / 进行中 ===== -->
      <div v-if="unresolved" class="w-cship__notice" :class="unresolvedInProgress ? 'is-progress' : 'is-bad'"
        :role="unresolvedInProgress ? 'status' : 'alert'">
        <div class="w-cship__notice-title">
          <span v-if="unresolvedInProgress" class="w-cship__spinner" aria-hidden="true" />
          <span v-else class="w-cship__mark" aria-hidden="true">!</span>
          <template v-if="unresolvedInProgress">
            {{ t(unresolvedCancelling ? 'customs.carrier.unresolved.cancelling-title' : 'customs.carrier.unresolved.in-progress-title') }}
          </template>
          <template v-else>
            {{ t(unresolvedCancelUnknown ? 'customs.carrier.unresolved.cancel-unknown-title' : 'customs.carrier.unresolved.title') }}
          </template>
        </div>
        <p class="w-cship__notice-text">
          <template v-if="unresolvedInProgress && pollExhausted">{{ t('customs.carrier.unresolved.stalled') }}</template>
          <template v-else-if="unresolvedInProgress">
            {{ t(unresolvedCancelling ? 'customs.carrier.unresolved.cancelling' : 'customs.carrier.unresolved.in-progress') }}
          </template>
          <template v-else-if="unresolvedCancelUnknown">
            {{ t('customs.carrier.unresolved.cancel-unknown-description', { carrier: carrierName, portal: portalName }) }}
          </template>
          <template v-else>{{ t('customs.carrier.unresolved.description', { carrier: carrierName, portal: portalName }) }}</template>
        </p>
        <div class="w-cship__meta">
          <span v-if="unresolved.tracking_number">{{ t('customs.carrier.fields.tracking-number') }} <b class="w-cship__mono">{{ unresolved.tracking_number }}</b></span>
          <span v-if="unresolved.transaction_id">{{ t('customs.carrier.fields.transaction-id') }} <span class="w-cship__mono">{{ unresolved.transaction_id }}</span></span>
          <span v-if="unresolved.created_at">{{ zonedTime(unresolved.created_at, 'MM/DD HH:mm') }}</span>
          <span v-if="unresolvedReasonText" :title="unresolved.reason || ''">{{ unresolvedReasonText }}</span>
        </div>
        <details v-if="!unresolvedInProgress && !locked" class="w-cship__how">
          <summary>{{ t('customs.carrier.unresolved.how') }}</summary>
          <ol>
            <li>
              {{ t(unresolved.tracking_number ? 'customs.carrier.unresolved.step1' : 'customs.carrier.unresolved.step1-no-tracking', { portal: portalName, tracking: unresolved.tracking_number || '' }) }}
              <a v-if="integration?.portal_url" :href="integration.portal_url" target="_blank" rel="noopener" class="w-cship__link">
                {{ portalName }}<WIcon name="external" :size="12" />
              </a>
            </li>
            <li>{{ t('customs.carrier.unresolved.step2') }}</li>
            <li>{{ t('customs.carrier.unresolved.step3') }}</li>
          </ol>
        </details>
        <div v-if="!locked" class="w-cship__actions">
          <WButton v-if="canRetryCancel" variant="danger" :loading="cancelling" :disabled="busy && !cancelling" @click="cancel">
            {{ t('customs.carrier.operations.retry-cancel') }}
          </WButton>
          <WButton v-if="canDismiss" :loading="dismissing" :disabled="busy && !dismissing" @click="dismiss">
            {{ t('customs.carrier.operations.dismiss') }}
          </WButton>
          <WButton variant="text" icon="refresh" :loading="loading" :disabled="busy" @click="refresh">{{ t('customs.carrier.operations.refresh') }}</WButton>
        </div>
      </div>

      <!-- ===== 已建运单 ===== -->
      <div v-if="activeShipment" class="w-cship__card">
        <div class="w-cship__headline">
          <span class="w-cship__tracking">{{ activeShipment.tracking_number || '—' }}</span>
          <span class="w-cship__facts">{{ shipmentFacts.join(' · ') }}</span>
        </div>
        <div v-if="packageTrackingNumbers.length > 1" class="w-cship__meta">
          {{ t('customs.carrier.fields.package-tracking-numbers') }} <span class="w-cship__mono">{{ packageTrackingNumbers.join(', ') }}</span>
        </div>
        <div class="w-cship__meta">
          <span>{{ t('customs.carrier.fields.created') }} {{ zonedTime(activeShipment.created_at, 'YYYY-MM-DD HH:mm') || '—' }}</span>
          <span v-if="activeShipment.created_by">{{ userText(activeShipment.created_by_user ?? activeShipment.created_by) }}</span>
          <span v-if="declaredValueText">{{ declaredValueText }}</span>
          <span v-if="activeShipment.etd_document_id">{{ t('customs.carrier.tips.etd-submitted') }}</span>
        </div>
        <WAlert v-if="electronicWithOriginals || paperDocuments.length || regulatoryPaperDocuments.length" tone="warn"
          :title="t('customs.carrier.tips.paper-required')">
          <span v-for="(item, i) in paperDocuments" :key="`paper-${item.type}-${i}`" class="w-cship__line">
            {{ t('customs.carrier.tips.paper-copies', { document: fedexDocumentName(item.type), copies: item.minimum_copies_required }) }}
          </span>
          <span v-for="item in regulatoryPaperDocuments" :key="`${item.document_type}-${item.name}`" class="w-cship__line">
            {{ t('customs.carrier.tips.trade-paper-document', { document: item.name }) }}
          </span>
          <span v-if="!paperDocuments.length && !regulatoryPaperDocuments.length" class="w-cship__line">{{ t('customs.carrier.tips.paper-check-label') }}</span>
        </WAlert>
        <div v-if="tradeDocuments?.required_documents?.length" class="w-cship__meta">
          {{ t('customs.carrier.tips.fedex-required-documents') }} {{ tradeDocuments.required_documents.map(fedexDocumentName).join(', ') }}
        </div>
        <div v-for="(message, i) in tradeDocuments?.regulatory_requirements?.messages || []" :key="`fedex-advice-${i}`" class="w-cship__meta is-warn">
          {{ message }}
        </div>
        <!-- 上门揽收：没有定期集荷的承运商，运单建好后要另约 -->
        <div v-if="pickupVisible" class="w-cship__meta">
          <WStatus :tone="pickupScheduled ? 'ok' : 'warn'">{{ pickupText }}</WStatus>
          <NuxtLink :to="pickupLink" class="w-cship__link">
            {{ pickupScheduled ? t('customs.carrier.pickup.view') : t('customs.carrier.pickup.manage') }}
          </NuxtLink>
        </div>
        <!-- 承运商跟踪：揽收后自动完成发货、送达后自动签收（定时查，也可以手动刷新） -->
        <div v-if="trackingVisible" class="w-cship__meta">
          <WStatus :tone="trackingTone" muted>{{ trackingText }}</WStatus>
          <span v-if="tracking?.synced_at">{{ t('customs.carrier.tracking.synced', { time: zonedTime(tracking.synced_at, 'MM/DD HH:mm') }) }}</span>
          <WButton v-if="canRefreshTracking" size="sm" variant="text" :loading="trackingRefreshing" :disabled="busy && !trackingRefreshing"
            @click="refreshTracking">{{ t('customs.carrier.tracking.refresh') }}</WButton>
        </div>
        <div v-if="tracking?.problem" class="w-cship__meta is-warn">{{ t('customs.carrier.tracking.problem', { reason: tracking.problem }) }}</div>
        <div v-if="tracking?.error" class="w-cship__meta is-warn">{{ t('customs.carrier.tracking.error', { reason: tracking.error }) }}</div>

        <div class="w-cship__actions">
          <!-- 手工 / 文件来源的运单：面单在承运商网站或软件里打，WMS 里没有面单文件，不给打印按钮 -->
          <span v-if="labelElsewhere" class="w-cship__hint">
            {{ t(activeShipment.source === 'file' ? 'shipping.file.label-elsewhere' : 'customs.carrier.tips.no-label', { carrier: carrierName }) }}
          </span>
          <template v-else-if="pdfLabel">
            <WButton icon="printer" :loading="!!labelDoc && busyDocId === labelDoc.id" :disabled="!labelDoc || busyDocId !== null"
              @click="viewDoc(dnId, labelDoc)">{{ t('customs.carrier.operations.print-label') }}</WButton>
            <WButton variant="text" :disabled="!labelDoc || busyDocId !== null" @click="downloadDoc(dnId, labelDoc)">
              {{ t('customs.carrier.operations.download-label') }}
            </WButton>
          </template>
          <!-- 指令文件面单（对接设置成 ZPLII / EPL2 时）：下载文件；直接发送到标签机是扩展点 -->
          <template v-else>
            <WButton icon="printer" :loading="!!labelDoc && busyDocId === labelDoc.id" :disabled="!labelDoc || busyDocId !== null"
              @click="downloadRawDoc(dnId, labelDoc)">{{ t('customs.carrier.operations.download-label-file', { ext: labelFileExtension(labelImageType) }) }}</WButton>
            <WButton v-if="labelPrinterBridge.available" variant="text" :loading="sendingToPrinter"
              :disabled="!labelDoc || sendingToPrinter || busyDocId !== null" @click="sendToPrinter">
              {{ t('customs.carrier.operations.send-to-printer') }}
            </WButton>
          </template>
          <span v-if="labelDoc && activePrintHint" class="w-cship__hint">
            {{ activePrintHint.text }}<template v-if="pdfLabel && auxiliaryLabel"> · {{ t('customs.carrier.tips.print-copies') }}</template>
            <WHelp v-if="activePrintHint.help" :text="activePrintHint.help" />
          </span>
          <span v-else-if="!labelDoc && !labelElsewhere" class="w-cship__hint">{{ t('customs.carrier.tips.no-label') }}</span>
          <span class="w-cship__spacer" />
          <WButton v-if="canCancel" variant="danger" :loading="cancelling" :disabled="busy && !cancelling" @click="cancel">
            {{ t('customs.carrier.operations.cancel') }}
          </WButton>
        </div>

        <!-- 建单时承运商返回的提示 -->
        <details v-if="alerts.length > 0" class="w-cship__how">
          <summary>{{ t('customs.carrier.tips.alerts', { carrier: carrierName, count: alerts.length }) }}</summary>
          <ul>
            <li v-for="(a, i) in alerts" :key="`al-${i}`"><span v-if="a.code" class="w-cship__mono">{{ a.code }} </span>{{ a.message }}</li>
          </ul>
        </details>
      </div>

      <!-- ===== 运单取消中（cancelling）且没有对应的结果不明记录（旧后端）：按进行中处理 ===== -->
      <div v-else-if="cancellingShipment && !unresolved" class="w-cship__notice is-progress" role="status">
        <div class="w-cship__notice-title">
          <span class="w-cship__spinner" aria-hidden="true" />{{ t('customs.carrier.unresolved.cancelling-title') }}
          <span class="w-cship__mono">{{ cancellingShipment.tracking_number }}</span>
        </div>
        <p class="w-cship__notice-text">{{ t(pollExhausted ? 'customs.carrier.unresolved.stalled' : 'customs.carrier.unresolved.cancelling') }}</p>
        <div class="w-cship__actions">
          <WButton variant="text" icon="refresh" :loading="loading" :disabled="busy" @click="refresh">{{ t('customs.carrier.operations.refresh') }}</WButton>
        </div>
      </div>

      <!-- ===== 还没有有效运单 ===== -->
      <template v-else-if="!unresolved">
        <p v-if="lastCancelled" class="w-cship__hint">
          {{ t('customs.carrier.tips.last-cancelled', {
            tracking: lastCancelled.tracking_number || '—',
            time: zonedTime(lastCancelled.cancelled_at, 'MM/DD HH:mm') || '—',
          }) }}
        </p>

        <!-- 还没选承运商 -->
        <p v-if="!status.carrier" class="w-cship__text">
          {{ t(taskId ? 'customs.carrier.tips.no-carrier' : 'customs.carrier.tips.no-carrier-elsewhere') }}
        </p>

        <!-- 有在线对接（运单方式 api）：创建运单 -->
        <template v-else-if="integration && !manualOnly">
          <WAlert v-if="!locked && status.etd_enabled" tone="warn">{{ t('customs.carrier.tips.trade-signature-warning') }}</WAlert>
          <div v-if="!locked && status.regulatory_check_enabled && status.can_create" class="w-cship__trade">
            <span v-if="tradeLoading" class="w-cship__hint">{{ t('customs.carrier.tips.trade-checking') }}</span>
            <WAlert v-else-if="tradeError" tone="block" :title="tradeError" />
            <template v-else-if="tradeRequirements">
              <span class="w-cship__trade-title">{{ t('customs.carrier.tips.trade-requirements') }}</span>
              <span v-if="!tradeRequirements.documents.length" class="w-cship__line">{{ t('customs.carrier.tips.trade-no-documents') }}</span>
              <span v-for="(doc, i) in tradeRequirements.documents" :key="`trade-${i}`" class="w-cship__line">
                {{ doc.name }} · {{ t(doc.required ? 'customs.carrier.tips.trade-required' : 'customs.carrier.tips.trade-optional') }}
                <template v-if="doc.required && doc.document_type === 'COMMERCIAL_INVOICE'"> · {{ t('customs.carrier.tips.trade-ci-ready') }}</template>
                <template v-if="doc.required && tradeRequirements.upload_packing_list && (doc.document_type === 'PACKING_LIST' || (doc.document_type === 'OTHER' && doc.name.toUpperCase().includes('PACKING LIST')))"> · {{ t('customs.carrier.tips.trade-pl-upload') }}</template>
                <template v-if="tradeRequirements.missing_documents.includes(doc)"> · {{ t('customs.carrier.tips.trade-missing') }}</template>
                <a v-if="doc.document_url" :href="doc.document_url" target="_blank" rel="noopener" class="w-cship__link">{{ t('customs.carrier.tips.trade-source') }}</a>
              </span>
              <span v-for="(doc, i) in tradeRequirements.paper_documents" :key="`trade-paper-${i}`" class="w-cship__line is-warn">
                {{ t('customs.carrier.tips.trade-paper-document', { document: doc.name }) }}
              </span>
              <span v-for="(message, i) in tradeRequirements.messages || []" :key="`trade-advice-${i}`" class="w-cship__line is-warn">{{ message }}</span>
              <span v-if="tradeRequirements.missing_documents.length" class="w-cship__line is-bad">{{ t('customs.carrier.tips.trade-blocked') }}</span>
              <label v-for="(doc, i) in tradeRequirements.missing_documents" :key="`upload-${i}`" class="w-cship__upload">
                <span>{{ doc.name }}</span>
                <input type="file" accept="application/pdf,.pdf" @change="chooseTradeFile(doc, $event)">
              </label>
            </template>
            <WButton size="sm" variant="text" :disabled="tradeLoading" @click="loadTradeRequirements">{{ t('customs.carrier.tips.trade-refresh') }}</WButton>
          </div>
          <div v-if="!locked" class="w-cship__create">
            <WButton variant="primary" icon="delivery" :loading="creating" :disabled="!canCreate || (busy && !creating) || packagesDirty" @click="create">
              {{ t('customs.carrier.operations.create') }}
            </WButton>
            <WField :label="t('customs.carrier.fields.label-format')" class="w-cship__format">
              <WSelect :model-value="labelFormat" :options="labelFormatSelect" size="sm" :disabled="busy"
                @update:model-value="chooseLabelFormat($event as LabelFormat)" />
            </WField>
            <span class="w-cship__hint">
              {{ selectedPrintHint.text }}<WHelp v-if="selectedPrintHint.help" :text="selectedPrintHint.help" />
            </span>
          </div>
          <p v-if="creating" class="w-cship__hint">{{ t('customs.carrier.tips.creating', { carrier: carrierName }) }}</p>
          <p v-if="!locked && packagesDirty" class="w-cship__hint is-bad">{{ t('customs.carrier.tips.packages-unsaved') }}</p>
          <ul v-if="!locked && warnings.length > 0" class="w-cship__list is-warn">
            <li v-for="(w, i) in warnings" :key="`w-${i}`" :title="w.message || ''">{{ warningText(w) }}</li>
          </ul>

          <!-- 不能建单的原因（报关问题在外层清单里，这里只列运单本身的） -->
          <ul v-if="!locked && !status.can_create && blockers.length > 0" class="w-cship__list">
            <li v-for="(b, i) in blockers" :key="`b-${i}`" :title="b.message || ''">
              <span class="w-cship__dot" aria-hidden="true" />{{ blockerText(b) }}
              <WTag v-if="b.goods_code">{{ b.goods_code }}</WTag>
              <NuxtLink v-if="SETTINGS_BLOCKERS.includes(b.code) && canEditCarrier" :to="carrierSettingsUrl" class="w-cship__link">
                {{ t('customs.carrier.operations.open-settings') }}
              </NuxtLink>
              <template v-else-if="EXPORTER_BLOCKERS.includes(b.code)">
                <NuxtLink to="/company" class="w-cship__link">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
                <NuxtLink v-if="warehouseId" :to="`/warehouse/edit/${warehouseId}`" class="w-cship__link">{{ t('customs.operations.edit-warehouse') }}</NuxtLink>
              </template>
              <button v-else-if="CONSIGNEE_BLOCKERS.includes(b.code) && canEditCustoms" type="button" class="w-cship__textbtn"
                @click="emit('edit-customs')">{{ t('customs.operations.fix') }}</button>
              <button v-else-if="b.code === 'TRACKING_NUMBER_EXISTS' && canEnterTracking" type="button" class="w-cship__textbtn"
                @click="manualOpen = true">{{ t('customs.carrier.operations.edit-tracking') }}</button>
            </li>
          </ul>

          <!-- 对接临时不可用时的退路：手工填运单号 -->
          <div v-if="canEnterTracking && !manualOpen && !savedTracking">
            <WButton size="sm" variant="text" @click="manualOpen = true">{{ t('customs.carrier.operations.manual') }}</WButton>
          </div>
        </template>

        <!-- 文件方式：导出 / 导回在外层；对接临时不可用等时的退路：手工填运单号 -->
        <div v-else-if="fileMode">
          <WButton v-if="canEnterTracking && !manualOpen && !savedTracking" size="sm" variant="text" @click="manualOpen = true">
            {{ t('shipping.file.manual-fallback') }}
          </WButton>
        </div>

        <!-- 没有在线对接 / 运单方式是手工：在承运商网站或软件建运单 -->
        <p v-else-if="!locked" class="w-cship__text">
          {{ t(integration
            ? (canEnterTracking ? 'customs.carrier.tips.manual-method' : 'customs.carrier.tips.manual-method-elsewhere')
            : (canEnterTracking ? 'customs.carrier.tips.manual' : 'customs.carrier.tips.manual-elsewhere'), { carrier: carrierName }) }}
          <NuxtLink v-if="!canEnterTracking && !locked && status.delivery_task_id" :to="`/delivery/detail/${status.delivery_task_id}`"
            class="w-cship__link">{{ t('customs.carrier.operations.open-delivery') }}</NuxtLink>
        </p>

        <!-- 手工运单号：没有对接时一直显示；有对接时点开或已经填过才显示 -->
        <form v-if="status.carrier && canEnterTracking && (fileMode ? (manualOpen || savedTracking) : (!integration || manualOnly || manualOpen || savedTracking))"
          class="w-cship__manual" @submit.prevent="saveTracking">
          <WField :label="t('customs.carrier.fields.tracking-number')" class="w-cship__manual-field">
            <WInput v-model="manualTracking" :maxlength="TRACKING_MAX_LENGTH" :placeholder="t(trackingPlaceholder)" :disabled="busy"
              autocomplete="off" class="w-cship__mono-input" />
          </WField>
          <WButton type="submit" variant="primary" :loading="savingTracking" :disabled="(busy && !savingTracking) || !trackingChanged">
            {{ t('button.save') }}
          </WButton>
        </form>
        <p v-else-if="status.carrier && savedTracking" class="w-cship__text">
          {{ t('customs.carrier.fields.tracking-number') }} <b class="w-cship__mono">{{ savedTracking }}</b>
        </p>
      </template>

      <!-- ===== 失败：承运商的原话收在折叠里 ===== -->
      <WAlert v-if="failure" tone="block" :title="failure.summary" dismissible @close="failure = null">
        <span v-if="failure.timeout" class="w-cship__line">{{ t('customs.carrier.tips.timeout', { carrier: carrierName, portal: portalName }) }}</span>
        <span v-if="failure.permissionDenied" class="w-cship__line">{{ t('customs.carrier.tips.permission-denied', { carrier: carrierName }) }}</span>
        <details v-if="failure.errors.length > 0 || failure.transactionId" class="w-cship__how">
          <summary>{{ t('customs.carrier.tips.carrier-errors', { carrier: carrierName }) }}</summary>
          <ul v-if="failure.errors.length > 0">
            <li v-for="(e, i) in failure.errors" :key="`fe-${i}`"><span v-if="e.code" class="w-cship__mono">{{ e.code }} </span>{{ e.message }}</li>
          </ul>
          <div v-if="failure.action || failure.transactionId" class="w-cship__mono">
            <span v-if="failure.action">{{ actionText(failure.action) }}</span>
            <span v-if="failure.transactionId"> · {{ t('customs.carrier.fields.transaction-id') }} {{ failure.transactionId }}</span>
          </div>
        </details>
      </WAlert>
    </template>
  </div>
</template>

<style scoped>
.w-cship {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-cship__loading { display: flex; flex-direction: column; gap: 8px; }
.w-cship__skeleton { display: block; width: 60%; height: 14px; border-radius: 4px; background: var(--w-skeleton); }
.w-cship__skeleton.is-short { width: 35%; }
.w-cship__text { margin: 0; color: var(--w-text-2); }
.w-cship__hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-cship__hint.is-bad { color: var(--w-bad-text); }
.w-cship__line { display: block; }
.w-cship__line.is-warn, .w-cship__meta.is-warn { color: var(--w-warn-text); }
.w-cship__line.is-bad { color: var(--w-bad-text); }
.w-cship__mono { font-family: var(--w-font-mono); font-size: var(--w-fs-12); overflow-wrap: anywhere; }
.w-cship__mono-input :deep(input) { font-family: var(--w-font-mono); }
.w-cship__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  color: var(--w-link);
  font-weight: var(--w-fw-medium);
  text-decoration: none;
}
.w-cship__link:hover { color: var(--w-link-hover); }
.w-cship__textbtn {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-medium);
  cursor: pointer;
}
.w-cship__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.w-cship__spacer { flex: 1; }

/* 结果不明（阻断，浅红底）/ 进行中（白底 + 左侧紫条） */
.w-cship__notice {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--w-radius-card);
}
.w-cship__notice.is-bad { border: 1px solid var(--w-bad-border); background: var(--w-bad-bg); }
.w-cship__notice.is-progress { border: 1px solid var(--w-border); border-left: 3px solid var(--w-info-dot); background: var(--w-surface); }
.w-cship__notice-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-semibold);
}
.w-cship__notice.is-bad .w-cship__notice-title { color: var(--w-bad-text); }
.w-cship__notice-text { margin: 0; color: var(--w-text-2); }
.w-cship__mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--w-radius-pill);
  background: var(--w-bad-dot);
  color: #FFFFFF;
  font-size: 11px;
  line-height: 1;
}
.w-cship__spinner {
  width: 14px;
  height: 14px;
  border-radius: var(--w-radius-pill);
  border: 2px solid var(--w-info-dot);
  border-right-color: transparent;
  animation: w-cship-spin 0.7s linear infinite;
}
@keyframes w-cship-spin { to { transform: rotate(360deg); } }
.w-cship__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-cship__how { font-size: var(--w-fs-13); color: var(--w-text-2); }
.w-cship__how summary { color: var(--w-link); font-weight: var(--w-fw-medium); cursor: pointer; }
.w-cship__how ol, .w-cship__how ul { margin: 6px 0 0; padding-left: 18px; }

/* 已建运单 */
.w-cship__card { display: flex; flex-direction: column; gap: 8px; }
.w-cship__headline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.w-cship__tracking {
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
  letter-spacing: 0.02em;
}
.w-cship__facts { color: var(--w-text-2); }

/* 建运单 */
.w-cship__trade {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
}
.w-cship__trade-title { font-weight: var(--w-fw-semibold); }
.w-cship__upload { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 2px 0 0; }
.w-cship__create { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 16px; }
.w-cship__format { width: 200px; }
.w-cship__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.w-cship__list.is-warn { color: var(--w-warn-text); }
.w-cship__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: var(--w-radius-pill);
  background: var(--w-warn-dot);
  vertical-align: 2px;
}
.w-cship__manual { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.w-cship__manual-field { flex: 0 1 360px; }
@media (prefers-reduced-motion: reduce) {
  .w-cship__spinner { animation-duration: 2s; }
}
</style>
