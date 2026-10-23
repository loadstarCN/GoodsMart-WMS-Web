<script lang="ts" setup>
/**
 * 海外发货 · 运单（海外发货区「运单」这一步的内容；出库单详情的单证卡片里只读 locked）
 *
 * 按 DN 当前的承运商（发货任务的，没有用 DN 的）走两条路：
 * - 承运商设了在线对接（status.integration）：「创建运单」+ 面单打印方式（本机记住上次的选择 → 对接设置的默认 → A4），
 *   不能建时列出原因（报关数据类的问题由外层的问题清单列，这里不重复：hiddenBlockerCodes）；
 *   对接临时不可用时也可以改成手工填运单号
 * - 没有对接：在承运商网站建好运单后手工填运单号（配送任务页可以直接填；打包页给配送任务的入口）
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
import dayjs from 'dayjs'
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
  unresolvedFromError,
  type CarrierAlert,
  type CarrierRequestFailure,
  type CarrierShipmentBlocker,
  type CarrierShipment,
  type CarrierShipmentStatus,
  type CarrierWarning,
  type LabelFormat,
} from '~/composables/customs/carrierShipment'

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
  /** 给「刷新跟踪」：刷新可能当场完成发货 / 签收，只在配送页给（出库单详情的只读卡片不给） */
  trackingRefresh?: boolean
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
})

const emit = defineEmits<{
  /** 运单变了（建单 / 取消 / 存运单号成功，或重新读取时发现运单、结果不明的运单有变化）：父组件要刷新单证 */
  (e: 'changed'): void
  /** 读到新的状态（父组件据此显示这一步的概要） */
  (e: 'status', status: CarrierShipmentStatus | null): void
  /** 收货人等报关数据要补录 */
  (e: 'edit-customs'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const { busyDocId, viewDoc, downloadDoc, downloadRawDoc, fetchFile } = useCustomsPdfActions()
const staffStore = useStaffStore()

const loading = ref(false)
const loadError = ref<string | null>(null)
/** 后端还没有这个接口（旧版本）：整块不显示 */
const unsupported = ref(false)
const status = ref<CarrierShipmentStatus | null>(null)
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
/** 承运商自己的发货后台（结果不明时去那里核对） */
const portalName = computed(() => integration.value?.portal_name || t('customs.carrier.portal-fallback', { carrier: carrierName.value }))
const shipment = computed(() => status.value?.shipment || null)
const activeShipment = computed(() => (isActiveShipment(shipment.value) ? shipment.value : null))
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
const trackingVisible = computed(() => !!activeShipment.value && (!!integration.value?.tracks_shipments || !!tracking.value))
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
      parts.push(t('customs.carrier.tracking.delivered-at', { time: dayjs(at).format('YYYY-MM-DD HH:mm') }))
    } else if (at) {
      parts.push(t('customs.carrier.tracking.delivered-at', { time: at }))
    }
  } else if (tr.estimated_delivery) {
    parts.push(t('customs.carrier.tracking.eta', { date: tr.estimated_delivery }))
  }
  return parts.join(' · ')
})
const trackingClass = computed(() => {
  const s = tracking.value?.status
  if (s === 'exception' || s === 'unknown') return 'text-danger'
  if (s === 'delivered') return 'text-success'
  if (s === 'in_transit' || s === 'out_for_delivery') return 'text-primary'
  return 'text-muted'
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
  (shipment.value && !isActiveShipment(shipment.value) && !isCancellingShipment(shipment.value) ? shipment.value : null))
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
  !!integration.value && !props.locked && !!status.value?.can_create && !activeShipment.value && !cancellingShipment.value
  && !unresolved.value)
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
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.valueOf() : null
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
  const facts = [serviceNameOf(s)]
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
  await httpRequest<any>(`/api/warehouse/delivery/${props.taskId}/tracking`, {
    method: 'PUT',
    body: { tracking_number: tracking },
    onSuccess: () => {
      saved = true
      showToast(t(tracking ? 'customs.carrier.tips.tracking-saved' : 'customs.carrier.tips.tracking-cleared'), 'success')
    },
    onError: (error) => {
      if (TRACKING_BLOCK_CODES.includes(Number(error.code))) {
        showAlert(t('delivery.tips.tracking-blocked-title'), bizErrorMessage(error), 'error')
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
    showAlert(t('customs.carrier.create-confirm-title'), t('customs.carrier.tips.packages-unsaved'), 'warning')
    return
  }
  const format = labelFormat.value
  const params = { carrier: carrierName.value, format: labelFormatText(format), count: props.packageCount ?? '' }
  const confirmed = await showConfirm(
    t('customs.carrier.create-confirm-title'),
    t(props.packageCount ? 'customs.carrier.create-confirm-packages' : 'customs.carrier.create-confirm', params),
    t('customs.carrier.operations.create'),
    t('customs.carrier.operations.back'),
  )
  if (!confirmed) return

  creating.value = true
  failure.value = null
  alerts.value = []
  let created: any = null
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let failedWith = null as HttpRequestError | null
  await httpRequest<any>(carrierShipmentUrl(props.dnId), {
    method: 'POST',
    body: { label_format: format },
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
  const confirmed = await showConfirm(
    t('customs.carrier.cancel-confirm-title', params),
    t(retry ? 'customs.carrier.cancel-retry-confirm' : 'customs.carrier.cancel-confirm', params),
    t(retry ? 'customs.carrier.operations.retry-cancel' : 'customs.carrier.operations.cancel'),
    t('customs.carrier.operations.keep'),
  )
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
    showToast(t('customs.carrier.cancelled', { tracking: tracking || '—' }), 'success')
    // 已因运单变化通知过就不再重复通知
    if (!notified) emit('changed')
  } else if (failedWith) {
    // 目标已变 / 取消结果不明 / 已有取消在进行（16079）/ 运单已被别人取消（16075）/ 承运商拒绝等：按后端最新状态显示
    //（运单变了时 load() 会通知父组件刷新单证）
    await load()
    if (isCancelOutcomeUnknown(failedWith)) {
      showAlert(t('customs.carrier.unresolved.cancel-unknown-title'),
        t('customs.carrier.tips.cancel-unknown', { portal: portalName.value }), 'warning')
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
  const confirmed = await showConfirm(
    t('customs.carrier.unresolved.dismiss-confirm-title'),
    // 有运单号：后端会先请承运商取消，承运商确认已取消 / 查无此运单才作废（否则 16094）
    t(u.tracking_number ? 'customs.carrier.unresolved.dismiss-confirm-tracking' : 'customs.carrier.unresolved.dismiss-confirm', {
      portal: portalName.value,
      carrier: carrierName.value,
      tracking: u.tracking_number || '—',
    }),
    t('customs.carrier.operations.dismiss'),
    t('customs.carrier.operations.back'),
  )
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
        showAlert(t('customs.carrier.unresolved.dismiss-confirm-title'), bizErrorMessage(error), 'warning')
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

defineExpose({ reload: async () => { await load() } })
</script>

<template>
  <div class="carrier-shipment" v-if="!unsupported">
    <div class="py-1" v-if="loading && !status">
      <span class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
      </span>
    </div>
    <div class="alert alert-danger-transparent fs-13 mb-0" v-else-if="loadError && !status">{{ loadError }}</div>

    <template v-else-if="status">
      <!-- ===== 结果不明 / 进行中 ===== -->
      <div class="carrier-notice" :class="unresolvedInProgress ? 'is-progress' : 'is-danger'" role="alert" v-if="unresolved">
        <div class="fw-semibold d-flex align-items-center gap-2">
          <span class="spinner-border spinner-border-sm" role="status" v-if="unresolvedInProgress"></span>
          <i class="ri-error-warning-line fs-16" v-else></i>
          <template v-if="unresolvedInProgress">
            {{ t(unresolvedCancelling ? 'customs.carrier.unresolved.cancelling-title' : 'customs.carrier.unresolved.in-progress-title') }}
          </template>
          <template v-else>
            {{ t(unresolvedCancelUnknown ? 'customs.carrier.unresolved.cancel-unknown-title' : 'customs.carrier.unresolved.title') }}
          </template>
        </div>
        <p class="fs-13 mb-0 mt-1">
          <template v-if="unresolvedInProgress && pollExhausted">{{ t('customs.carrier.unresolved.stalled') }}</template>
          <template v-else-if="unresolvedInProgress">
            {{ t(unresolvedCancelling ? 'customs.carrier.unresolved.cancelling' : 'customs.carrier.unresolved.in-progress') }}
          </template>
          <template v-else-if="unresolvedCancelUnknown">
            {{ t('customs.carrier.unresolved.cancel-unknown-description', { carrier: carrierName, portal: portalName }) }}
          </template>
          <template v-else>{{ t('customs.carrier.unresolved.description', { carrier: carrierName, portal: portalName }) }}</template>
        </p>
        <div class="fs-12 text-muted mt-1 d-flex flex-wrap gap-3">
          <span v-if="unresolved.tracking_number">
            {{ t('customs.carrier.fields.tracking-number') }} <span class="font-monospace">{{ unresolved.tracking_number }}</span>
          </span>
          <span v-if="unresolved.transaction_id">
            {{ t('customs.carrier.fields.transaction-id') }} <span class="font-monospace text-break">{{ unresolved.transaction_id }}</span>
          </span>
          <span v-if="unresolved.created_at">{{ $dayjs(unresolved.created_at, 'MM-DD HH:mm') }}</span>
          <span v-if="unresolvedReasonText" :title="unresolved.reason || ''">{{ unresolvedReasonText }}</span>
        </div>
        <details class="fs-13 mt-2" v-if="!unresolvedInProgress && !locked">
          <summary class="text-primary">{{ t('customs.carrier.unresolved.how') }}</summary>
          <ol class="mb-0 mt-1 ps-3">
            <li>
              {{ t(unresolved.tracking_number ? 'customs.carrier.unresolved.step1' : 'customs.carrier.unresolved.step1-no-tracking', { portal: portalName, tracking: unresolved.tracking_number || '' }) }}
              <a :href="integration.portal_url" target="_blank" rel="noopener" class="ms-1" v-if="integration?.portal_url">
                <i class="ri-external-link-line"></i>
              </a>
            </li>
            <li>{{ t('customs.carrier.unresolved.step2') }}</li>
            <li>{{ t('customs.carrier.unresolved.step3') }}</li>
          </ol>
        </details>
        <div class="btn-list mt-2" v-if="!locked">
          <button type="button" class="btn btn-sm btn-light" v-if="canRetryCancel" :disabled="busy" @click="cancel">
            <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>
            {{ t('customs.carrier.operations.retry-cancel') }}
          </button>
          <button type="button" class="btn btn-sm btn-light" v-if="canDismiss" :disabled="busy" @click="dismiss">
            <span v-if="dismissing" class="spinner-border spinner-border-sm me-1"></span>
            {{ t('customs.carrier.operations.dismiss') }}
          </button>
          <button type="button" class="btn btn-sm btn-outline-light" :disabled="loading || busy" @click="refresh">
            <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-refresh-line me-1"></i>{{ t('customs.carrier.operations.refresh') }}
          </button>
        </div>
      </div>

      <!-- ===== 已建运单 ===== -->
      <div class="carrier-shipment-card" v-if="activeShipment">
        <div class="d-flex flex-wrap align-items-baseline gap-2">
          <span class="fs-16 fw-semibold font-monospace">{{ activeShipment.tracking_number || '—' }}</span>
          <span class="fs-13 text-muted">{{ shipmentFacts.join(' · ') }}</span>
        </div>
        <div class="fs-12 text-muted mt-1" v-if="packageTrackingNumbers.length > 1">
          {{ t('customs.carrier.fields.package-tracking-numbers') }}
          <span class="font-monospace">{{ packageTrackingNumbers.join(', ') }}</span>
        </div>
        <div class="fs-12 text-muted mt-1">
          {{ t('customs.carrier.fields.created') }} {{ $dayjs(activeShipment.created_at, 'YYYY-MM-DD HH:mm') || '—' }}
          <template v-if="activeShipment.created_by">· {{ userText(activeShipment.created_by_user ?? activeShipment.created_by) }}</template>
          <template v-if="declaredValueText"> · {{ declaredValueText }}</template>
          <template v-if="activeShipment.etd_document_id"> · {{ t('customs.carrier.tips.etd-submitted') }}</template>
        </div>
        <!-- 上门揽收：没有定期集荷的承运商，运单建好后要在「上门揽收」页另约 -->
        <div class="fs-12 mt-1" :class="pickupScheduled ? 'text-success' : 'text-warning'" v-if="pickupVisible">
          <i class="ri-truck-line me-1"></i>{{ pickupText }}
          <NuxtLink :to="pickupLink" class="ms-1">
            {{ pickupScheduled ? t('customs.carrier.pickup.view') : t('customs.carrier.pickup.manage') }}
          </NuxtLink>
        </div>
        <!-- 承运商跟踪：揽收后自动完成发货、送达后自动签收（定时查，也可以手动刷新） -->
        <div class="fs-12 mt-1" v-if="trackingVisible">
          <i class="ri-route-line me-1"></i><span :class="trackingClass">{{ trackingText }}</span>
          <span class="text-muted ms-1" v-if="tracking?.synced_at">
            · {{ t('customs.carrier.tracking.synced', { time: $dayjs(tracking.synced_at, 'MM-DD HH:mm') }) }}
          </span>
          <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline fs-12" v-if="canRefreshTracking"
            :disabled="busy" @click="refreshTracking">
            <span v-if="trackingRefreshing" class="spinner-border spinner-border-sm me-1"></span>{{ t('customs.carrier.tracking.refresh') }}
          </button>
        </div>
        <div class="fs-12 mt-1 text-danger" v-if="tracking?.problem">
          <i class="ri-error-warning-line me-1"></i>{{ t('customs.carrier.tracking.problem', { reason: tracking.problem }) }}
        </div>
        <div class="fs-12 mt-1 text-warning" v-if="tracking?.error">
          {{ t('customs.carrier.tracking.error', { reason: tracking.error }) }}
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
          <template v-if="pdfLabel">
            <button type="button" class="btn btn-sm btn-primary" :disabled="!labelDoc || busyDocId !== null"
              @click="viewDoc(dnId, labelDoc)">
              <span v-if="labelDoc && busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.print-label') }}
            </button>
            <button type="button" class="btn btn-sm btn-light" :disabled="!labelDoc || busyDocId !== null"
              @click="downloadDoc(dnId, labelDoc)">
              <i class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label') }}
            </button>
          </template>
          <!-- 指令文件面单（对接设置成 ZPLII / EPL2 时）：下载文件；直接发送到标签机是扩展点 -->
          <template v-else>
            <button type="button" class="btn btn-sm btn-primary" :disabled="!labelDoc || busyDocId !== null"
              @click="downloadRawDoc(dnId, labelDoc)">
              <span v-if="labelDoc && busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label-file', { ext: labelFileExtension(labelImageType) }) }}
            </button>
            <button type="button" class="btn btn-sm btn-light" v-if="labelPrinterBridge.available"
              :disabled="!labelDoc || sendingToPrinter || busyDocId !== null" @click="sendToPrinter">
              <span v-if="sendingToPrinter" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.send-to-printer') }}
            </button>
          </template>
          <span class="fs-12 text-muted" v-if="labelDoc && activePrintHint" :title="activePrintHint.help">
            {{ activePrintHint.text }}<template v-if="pdfLabel && auxiliaryLabel"> · {{ t('customs.carrier.tips.print-copies') }}</template>
            <i class="ri-question-line ms-1" v-if="activePrintHint.help"></i>
          </span>
          <span class="fs-12 text-muted" v-else-if="!labelDoc">{{ t('customs.carrier.tips.no-label') }}</span>
          <button type="button" class="btn btn-sm btn-link text-danger ms-auto px-0" v-if="canCancel" :disabled="busy" @click="cancel">
            <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>{{ t('customs.carrier.operations.cancel') }}
          </button>
        </div>

        <!-- 建单时承运商返回的提示 -->
        <details class="fs-12 mt-2" v-if="alerts.length > 0">
          <summary class="text-muted">{{ t('customs.carrier.tips.alerts', { carrier: carrierName, count: alerts.length }) }}</summary>
          <ul class="mb-0 mt-1 ps-3">
            <li v-for="(a, i) in alerts" :key="`al-${i}`" class="text-break">
              <code class="me-1" v-if="a.code">{{ a.code }}</code>{{ a.message }}
            </li>
          </ul>
        </details>
      </div>

      <!-- ===== 运单取消中（cancelling）且没有对应的结果不明记录（旧后端）：按进行中处理 ===== -->
      <div class="carrier-notice is-progress" role="status" v-else-if="cancellingShipment && !unresolved">
        <div class="fw-semibold d-flex align-items-center gap-2">
          <span class="spinner-border spinner-border-sm"></span>{{ t('customs.carrier.unresolved.cancelling-title') }}
          <span class="font-monospace fw-normal">{{ cancellingShipment.tracking_number }}</span>
        </div>
        <p class="fs-13 mb-0 mt-1">{{ t(pollExhausted ? 'customs.carrier.unresolved.stalled' : 'customs.carrier.unresolved.cancelling') }}</p>
        <button type="button" class="btn btn-sm btn-outline-light mt-2" :disabled="loading || busy" @click="refresh">
          <i class="ri-refresh-line me-1"></i>{{ t('customs.carrier.operations.refresh') }}
        </button>
      </div>

      <!-- ===== 还没有有效运单 ===== -->
      <template v-else-if="!unresolved">
        <p class="fs-12 text-muted mb-2" v-if="lastCancelled">
          {{ t('customs.carrier.tips.last-cancelled', {
            tracking: lastCancelled.tracking_number || '—',
            time: $dayjs(lastCancelled.cancelled_at, 'MM-DD HH:mm') || '—',
          }) }}
        </p>

        <!-- 还没选承运商 -->
        <p class="fs-13 text-muted mb-0" v-if="!status.carrier">
          {{ t(taskId ? 'customs.carrier.tips.no-carrier' : 'customs.carrier.tips.no-carrier-elsewhere') }}
        </p>

        <!-- 有在线对接：创建运单 -->
        <template v-else-if="integration">
          <div class="d-flex flex-wrap align-items-center gap-2" v-if="!locked">
            <button type="button" class="btn btn-primary" :disabled="!canCreate || busy || packagesDirty" @click="create">
              <span v-if="creating" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-truck-line me-1"></i>{{ t('customs.carrier.operations.create') }}
            </button>
            <label class="fs-13 text-muted ms-1 mb-0" :for="`label-format-${dnId}`">{{ t('customs.carrier.fields.label-format') }}</label>
            <select class="form-select form-select-sm w-auto" :id="`label-format-${dnId}`" :value="labelFormat" :disabled="busy"
              @change="chooseLabelFormat(($event.target as HTMLSelectElement).value as LabelFormat)">
              <option v-for="f in labelFormatOptions" :key="f" :value="f">{{ labelFormatText(f) }}</option>
            </select>
            <span class="fs-12 text-muted" :title="selectedPrintHint.help">
              {{ selectedPrintHint.text }}<i class="ri-question-line ms-1" v-if="selectedPrintHint.help"></i>
            </span>
          </div>
          <p class="fs-12 text-muted mb-0 mt-2" v-if="creating">
            {{ t('customs.carrier.tips.creating', { carrier: carrierName }) }}
          </p>
          <p class="fs-12 text-danger mb-0 mt-2" v-if="!locked && packagesDirty">{{ t('customs.carrier.tips.packages-unsaved') }}</p>
          <ul class="fs-13 mb-0 mt-2 ps-3" v-if="!locked && warnings.length > 0">
            <li v-for="(w, i) in warnings" :key="`w-${i}`" class="text-warning" :title="w.message || ''">{{ warningText(w) }}</li>
          </ul>

          <!-- 不能建单的原因（报关问题在外层清单里，这里只列运单本身的） -->
          <ul class="carrier-blockers fs-13 mb-0 mt-2" v-if="!locked && !status.can_create && blockers.length > 0">
            <li v-for="(b, i) in blockers" :key="`b-${i}`" :title="b.message || ''">
              {{ blockerText(b) }}
              <span class="badge bg-light text-default ms-1" v-if="b.goods_code">{{ b.goods_code }}</span>
              <NuxtLink :to="carrierSettingsUrl" class="ms-2" v-if="SETTINGS_BLOCKERS.includes(b.code) && canEditCarrier">
                {{ t('customs.carrier.operations.open-settings') }}
              </NuxtLink>
              <template v-else-if="EXPORTER_BLOCKERS.includes(b.code)">
                <NuxtLink to="/company" class="ms-2">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
                <NuxtLink :to="`/warehouse/edit/${warehouseId}`" class="ms-2" v-if="warehouseId">
                  {{ t('customs.operations.edit-warehouse') }}
                </NuxtLink>
              </template>
              <a href="#" class="ms-2" v-else-if="CONSIGNEE_BLOCKERS.includes(b.code) && canEditCustoms"
                @click.prevent="emit('edit-customs')">{{ t('customs.operations.fix') }}</a>
              <a href="#" class="ms-2" v-else-if="b.code === 'TRACKING_NUMBER_EXISTS' && canEnterTracking"
                @click.prevent="manualOpen = true">{{ t('customs.carrier.operations.edit-tracking') }}</a>
            </li>
          </ul>

          <!-- 对接临时不可用时的退路：手工填运单号 -->
          <div class="mt-2" v-if="canEnterTracking">
            <a href="#" class="fs-12 text-muted" v-if="!manualOpen && !savedTracking" @click.prevent="manualOpen = true">
              {{ t('customs.carrier.operations.manual') }}
            </a>
          </div>
        </template>

        <!-- 没有在线对接：在承运商网站建运单 -->
        <p class="fs-13 mb-2" v-else-if="!locked">
          {{ t(canEnterTracking ? 'customs.carrier.tips.manual' : 'customs.carrier.tips.manual-elsewhere', { carrier: carrierName }) }}
          <NuxtLink :to="`/delivery/detail/${status.delivery_task_id}`" class="ms-1"
            v-if="!canEnterTracking && !locked && status.delivery_task_id">{{ t('customs.carrier.operations.open-delivery') }}</NuxtLink>
        </p>

        <!-- 手工运单号：没有对接时一直显示；有对接时点开或已经填过才显示 -->
        <form class="d-flex flex-wrap align-items-center gap-2" @submit.prevent="saveTracking"
          v-if="status.carrier && canEnterTracking && (!integration || manualOpen || savedTracking)">
          <div class="input-group input-group-sm carrier-tracking-input">
            <span class="input-group-text">{{ t('customs.carrier.fields.tracking-number') }}</span>
            <input type="text" class="form-control font-monospace" v-model="manualTracking" :maxlength="TRACKING_MAX_LENGTH"
              :placeholder="t('customs.carrier.tips.tracking-placeholder')" :disabled="busy">
            <button type="submit" class="btn btn-primary" :disabled="busy || !trackingChanged">
              <span v-if="savingTracking" class="spinner-border spinner-border-sm me-1"></span>{{ t('button.save') }}
            </button>
          </div>
        </form>
        <p class="fs-13 mb-0" v-else-if="status.carrier && savedTracking">
          {{ t('customs.carrier.fields.tracking-number') }} <span class="font-monospace fw-semibold">{{ savedTracking }}</span>
        </p>
      </template>

      <!-- ===== 失败：承运商的原话收在折叠里 ===== -->
      <div class="alert alert-danger-transparent fs-13 mt-2 mb-0" role="alert" v-if="failure">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="fw-semibold">{{ failure.summary }}</div>
          <button type="button" class="btn-close btn-sm" :aria-label="t('button.close')" @click="failure = null"></button>
        </div>
        <div class="mt-1" v-if="failure.timeout">{{ t('customs.carrier.tips.timeout', { carrier: carrierName, portal: portalName }) }}</div>
        <div class="mt-1" v-if="failure.permissionDenied">{{ t('customs.carrier.tips.permission-denied', { carrier: carrierName }) }}</div>
        <details class="fs-12 mt-1" v-if="failure.errors.length > 0 || failure.transactionId">
          <summary>{{ t('customs.carrier.tips.carrier-errors', { carrier: carrierName }) }}</summary>
          <ul class="mb-0 mt-1 ps-3" v-if="failure.errors.length > 0">
            <li v-for="(e, i) in failure.errors" :key="`fe-${i}`" class="text-break">
              <code class="me-1" v-if="e.code">{{ e.code }}</code>{{ e.message }}
            </li>
          </ul>
          <div class="text-muted font-monospace mt-1" v-if="failure.action || failure.transactionId">
            <span v-if="failure.action">{{ actionText(failure.action) }}</span>
            <span class="ms-2" v-if="failure.transactionId">{{ t('customs.carrier.fields.transaction-id') }} {{ failure.transactionId }}</span>
          </div>
        </details>
      </div>
    </template>
  </div>
</template>

<style scoped>
.carrier-notice {
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
  margin-bottom: 0.5rem;
}

.carrier-notice.is-progress {
  background: rgba(var(--warning-rgb), 0.08);
  border: 1px solid rgba(var(--warning-rgb), 0.3);
}

.carrier-notice.is-danger {
  background: rgba(var(--danger-rgb), 0.06);
  border: 1px solid rgba(var(--danger-rgb), 0.35);
}

.carrier-notice details summary,
.carrier-shipment-card details summary {
  cursor: pointer;
}

.carrier-shipment-card {
  border: 1px solid var(--default-border);
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
}

.carrier-blockers {
  padding-left: 1rem;
  color: rgb(var(--danger-rgb));
}

.carrier-blockers a {
  font-size: 0.75rem;
}

.carrier-tracking-input {
  max-width: 26rem;
}
</style>
