<script lang="ts" setup>
/**
 * 出库单单证卡片 · 承运商运单（FedEx 自动建单）
 *
 * - 未启用：不显示按钮，只提示手工建运单
 * - 可建：「在 FedEx 建运单」+ 面单打印方式（A4 普通打印机 / 热敏标签机；上次的选择 → 后端默认 → A4）；
 *   不可建时按钮置灰并列出 blockers
 * - 状态附带的提醒（warnings）按 code 显示
 * - 建单中显示进度；成功时显示 FedEx 的提示（alerts）；失败时显示 FedEx 的错误原文（errors[].code / message、交易 ID）
 * - 结果不明（unresolved：FedEx 超时 / 补偿失败 / 响应异常）：醒目显示原因、交易 ID、已知运单号，建议先到
 *   FedEx Ship Manager 核对并取消；此时不能建单。can_dismiss 时给「已核对」按钮（二次确认后解除）；
 *   pending / cancelling（别人正在建 / 取消）只显示进行中并定时刷新。建单 504 16074 / 409 16079 / 5xx / 断网后立即重新读取状态
 * - 已建：运单号、服务、运费、面单格式；PDF 面单（A4、热敏默认）新标签页打开打印 / 下载，热敏标签机附打印设置提示；
 *   后端配置成 ZPLII / EPL2 时下载指令文件；
 *   取消运单（二次确认；DN 已发货时不显示）；运单取消中（cancelling）只显示进行中并定时刷新
 * - 取消 / 解除：弹确认框前先重新读取，确认框展示最新的运单号 / 交易 ID，请求带上该目标（运单号 / 记录 id）；
 *   目标已变（409 16093：别人刚取消 / 解除 / 重建过）时提示并重新读取，不会误操作没人核对过的另一张运单
 * - 箱子有未保存的修改时不建单（会用已保存的旧箱子），提示先保存
 * - 取消结果不明（cancelling 且不在进行）/ 带运单号的结果不明记录：按后端 can_cancel 给「重试取消」；
 *   取消请求结果不明（502 / 504 maybe_processed）时重新读取并提示核对 / 重试；
 *   确认作废带运单号的记录时后端先请 FedEx 取消，没确认 → 16094 弹窗；建单后 WMS 保存失败 → 16095（按是否已自动取消给文案）
 * - 有运送申告价额时注明「已随运单提交」（后端按箱分摊成每箱 declaredValue）
 * - 成功建单 / 取消后通知父组件刷新单证（后端已让 CI / PL 带上 / 去掉运单号重新签发）；
 *   轮询、刷新、建单超时后重读才看到的变化（运单 id / 运单号 / 状态变了，或结果不明的运单消失）同样通知，
 *   免得单证区仍显示已作废的旧版 CI / PL
 */
import type { HttpRequestError } from '~/utils/http'
import { formatMoney, useCustomsPdfActions } from '~/composables/customs/customsDocuments'
import {
  CARRIER_BIZ_CODES,
  carrierShipmentUrl,
  extractCarrierAlerts,
  extractCarrierErrors,
  hasAuxiliaryLabel,
  formatServiceType,
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
  labelPrintHintKey,
  loadLabelFormat,
  normalizeCarrierStatus,
  saveLabelFormat,
  shouldReloadAfterCreateFailure,
  toLabelFormat,
  unresolvedFromError,
  type CarrierAlert,
  type CarrierRequestFailure,
  type CarrierShipmentBlocker,
  type CarrierShipmentStatus,
  type CarrierWarning,
  type LabelFormat,
} from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  dnId: number | string
  /** DN 已发货（只读）：不能建单、不能取消 */
  locked?: boolean
  /** 箱数（建单确认文案用） */
  packageCount?: number | null
  /** 报关快照：有运送申告价额时，自动建单会随运单提交 */
  customs?: Record<string, any> | null
  /** DN 所属仓库：发货方地址不合格时提供跳转 */
  warehouseId?: number | string | null
  /** 箱子有未保存的修改：此时建单会用已保存的旧箱子，要先保存 */
  packagesDirty?: boolean
}>(), {
  locked: false,
  packageCount: null,
  customs: null,
  warehouseId: null,
  packagesDirty: false,
})

const emit = defineEmits<{
  /** 运单变了（建单 / 取消成功，或重新读取时发现运单、结果不明的运单有变化）：父组件要刷新单证 */
  (e: 'changed'): void
  /** 读到新的状态（父组件据此切换申告价额提示） */
  (e: 'status', status: CarrierShipmentStatus | null): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const { busyDocId, viewDoc, downloadDoc, downloadRawDoc, fetchFile } = useCustomsPdfActions()

const loading = ref(false)
const loadError = ref<string | null>(null)
/** 后端还没有这个接口（旧版本）：整块不显示 */
const unsupported = ref(false)
const status = ref<CarrierShipmentStatus | null>(null)
const creating = ref(false)
const cancelling = ref(false)
const dismissing = ref(false)
const failure = ref<CarrierRequestFailure | null>(null)
/** 建单成功时 FedEx 返回的提示（建议显示） */
const alerts = ref<CarrierAlert[]>([])
/** 面单打印方式：上次的选择（localStorage）优先，没有时用后端默认，最后 A4 */
const labelFormat = ref<LabelFormat>('A4')
/** 用户自己选过（localStorage 里有）：后端默认不覆盖 */
let labelFormatChosen = false

// ------------------ 读取 ----------------------
/** 运单的识别信息（id / 运单号 / 状态）：任一变化说明后端已让 CI / PL 重新签发 */
const shipmentSignature = (s: CarrierShipmentStatus | null) => {
  const sh = s?.shipment
  return sh ? `${sh.id ?? ''}|${sh.tracking_number ?? ''}|${sh.status ?? ''}` : ''
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
      const backendDefault = toLabelFormat(status.value?.default_label_format)
      if (!labelFormatChosen && backendDefault) labelFormat.value = backendDefault
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
/** 用户点选打印方式：记住，下次默认用它 */
const chooseLabelFormat = (format: LabelFormat) => {
  labelFormat.value = format
  labelFormatChosen = true
  saveLabelFormat(format)
}
watch(status, (value: CarrierShipmentStatus | null) => emit('status', value))

// ------------------ 状态 ----------------------
const enabled = computed(() => !!status.value?.enabled)
const shipment = computed(() => status.value?.shipment || null)
const activeShipment = computed(() => (isActiveShipment(shipment.value) ? shipment.value : null))
/** 运单正在取消（cancelling）：按进行中处理 */
const cancellingShipment = computed(() => (isCancellingShipment(shipment.value) ? shipment.value : null))
const lastCancelled = computed(() =>
  (shipment.value && !isActiveShipment(shipment.value) && !isCancellingShipment(shipment.value) ? shipment.value : null))
const blockers = computed<CarrierShipmentBlocker[]>(() => status.value?.blockers || [])
/** 结果不明的运单（FedEx 上可能已生成）：有它时不能建单 */
const unresolved = computed(() => status.value?.unresolved || null)
/** 别人正在建 / 取消（pending / cancelling 且不能解除）：只显示进行中 */
const unresolvedInProgress = computed(() => isUnresolvedInProgress(status.value))
/** 进行中的是取消（cancelling），不是建单 */
const unresolvedCancelling = computed(() => unresolvedInProgress.value && unresolved.value?.status === 'cancelling')
/** 取消结果不明（cancelling 且没有在进行）：FedEx 上可能还有效，要重试取消或核对后确认作废 */
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
  enabled.value && !props.locked && !!status.value?.can_create && !activeShipment.value && !cancellingShipment.value
  && !unresolved.value)
const busy = computed(() => creating.value || cancelling.value || dismissing.value)
const unresolvedReasonText = computed(() => {
  const reason = unresolved.value?.reason
  if (!reason) return '—'
  const key = `customs.carrier.unresolved.reasons.${reason}`
  return te(key) ? t(key) : reason
})

// 别人正在建单 / 取消（pending / cancelling）：定时重新读取，直到有结果（最多约 5 分钟，之后手动刷新）
const IN_PROGRESS_POLL_MS = 10000
const IN_PROGRESS_POLL_MAX = 30
// 运单取消中但后端同时给了结果不明记录时，以记录为准（取消结果不明不是进行中，不轮询）
const inProgress = computed(() => unresolvedInProgress.value || (!!cancellingShipment.value && !unresolved.value))
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollCount = 0
const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}
const schedulePoll = () => {
  stopPolling()
  if (!inProgress.value || pollCount >= IN_PROGRESS_POLL_MAX) return
  pollTimer = setTimeout(async () => {
    pollTimer = null
    pollCount += 1
    if (!busy.value) await load()
    schedulePoll()
  }, IN_PROGRESS_POLL_MS)
}
watch(inProgress, (value: boolean) => {
  if (value) {
    pollCount = 0
    schedulePoll()
  } else {
    stopPolling()
  }
})
onBeforeUnmount(stopPolling)

const labelDoc = computed(() => labelDocumentOf(activeShipment.value))
const labelImageType = computed(() => labelImageTypeOf(activeShipment.value))
const pdfLabel = computed(() => isPdfLabel(activeShipment.value))
/** 已建面单的打印提示（PDF：A4 纸 / 热敏 100×150mm，都按实际大小 100% 打印） */
const labelPrintHint = computed(() =>
  activeShipment.value ? labelPrintHintKey(activeShipment.value.label_format || 'A4', labelImageType.value) : null)
const auxiliaryLabel = computed(() => hasAuxiliaryLabel(activeShipment.value))
/** 选中的打印方式建单后得到的文件格式与打印提示 */
const selectedImageType = computed(() => labelFormatImageType(status.value, labelFormat.value))
const selectedPrintHint = computed(() => labelPrintHintKey(labelFormat.value, selectedImageType.value))
const labelFormatTitle = (format: string) => {
  const cfg = status.value?.label_formats?.[format]
  return cfg ? [cfg.image_type, cfg.stock_type].filter(Boolean).join(' / ') : ''
}
const warnings = computed<CarrierWarning[]>(() => status.value?.warnings || [])
const warningText = (w: CarrierWarning) => {
  const key = `customs.carrier.warnings.${w.code}`
  if (!w.code || !te(key)) return w.message || w.code || ''
  return t(key, {
    original: isAmount(w.requested) ? money(w.requested) : '—',
    amount: isAmount(w.applied) ? money(w.applied) : '—',
  })
}
const labelFormatText = (format: string | null | undefined) => {
  const key = `customs.carrier.label-formats.${String(format || '').toUpperCase()}`
  return format && te(key) ? t(key) : (format || '')
}

const deliveryTaskId = computed(() => status.value?.delivery_task_id || null)
const packageTrackingNumbers = computed(() => {
  const list = activeShipment.value?.package_tracking_numbers
  return Array.isArray(list) ? list.filter(Boolean) : []
})

/** 要到配送任务处理的 blocker（设承运商、清掉手工保存的运单号等） */
const DELIVERY_TASK_BLOCKERS = ['CARRIER_NOT_FEDEX', 'TRACKING_NUMBER_EXISTS', 'DELIVERY_TASK_COMPLETED']
/** 要改公司 / 仓库出口资料的 blocker */
const EXPORTER_BLOCKERS = ['SHIPPER_ADDRESS_INVALID', 'EXPORTER_PROFILE_INCOMPLETE']

const actionText = (action: string | null) => {
  if (!action) return ''
  const key = `customs.carrier.actions.${action}`
  return te(key) ? t(key) : action
}

const blockerText = (b: CarrierShipmentBlocker) => {
  // 专门的承运商文案优先；签发单证的条件不全时后端直接复用单证问题码
  for (const key of [`customs.carrier.blockers.${b.code}`, `customs.problems.${b.code}`]) {
    if (te(key)) return t(key)
  }
  return b.message || b.code
}
const userText = (u: any) => (u && typeof u === 'object' ? (u.user_name || u.email || u.id) : (u ?? ''))
const money = (v: unknown) => formatMoney(Number(v), props.customs?.currency || 'JPY')
const isAmount = (x: unknown) => x !== null && x !== undefined && x !== '' && !isNaN(Number(x))
/** 已建运单的申告价额说明：运单上记的是实际提交值，比报关快照小时注明已自动调整 */
const declaredValueText = computed(() => {
  const submitted = activeShipment.value?.declared_value
  const original = isAmount(status.value?.declared_value_carriage)
    ? status.value?.declared_value_carriage
    : props.customs?.declared_value_carriage
  if (isAmount(submitted)) {
    if (isAmount(original) && Number(original) !== Number(submitted)) {
      return t('customs.carrier.tips.declared-value-submitted-capped', { amount: money(submitted), original: money(original) })
    }
    return t('customs.carrier.tips.declared-value-submitted', { amount: money(submitted) })
  }
  // 旧数据没有 declared_value 时按快照显示
  if (submitted === undefined && isAmount(original)) {
    return t('customs.carrier.tips.declared-value-submitted', { amount: money(original) })
  }
  return ''
})
const chargeText = computed(() => {
  const s = activeShipment.value
  if (!s || s.net_charge === null || s.net_charge === undefined || s.net_charge === '') return '—'
  return formatMoney(Number(s.net_charge), s.currency || 'JPY')
})

// ------------------ 失败：显示承运商错误原文 ----------------------
/** summaryOverride：自定义概要（如取消结果不明），此时不显示「建单超时」的提示 */
const handleFailure = (error: HttpRequestError, summaryOverride?: string) => {
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
  if (errors.length > 0 || transactionId || timeout || error.status === 502) {
    failure.value = {
      summary,
      // 没有逐条错误时把后端原文也带上（后端 message 里带着 FedEx 原文，业务码文案会盖住它）
      errors: errors.length > 0 || !error.message || error.message === summary ? errors : [{ code: null, message: error.message }],
      transactionId,
      timeout: !summaryOverride && timeout && maybeProcessed,
      action,
      permissionDenied,
    }
  }
  showToast(summary, 'error')
}

// ------------------ 建单 ----------------------
const create = async () => {
  if (!canCreate.value || busy.value) return
  // 箱子有未保存的修改：建单会用已保存的旧箱子（之后再保存箱子会 16076，只能取消重建），先保存
  if (props.packagesDirty) {
    showAlert(t('customs.carrier.create-confirm-title'), t('customs.tips.packages-unsaved-before-create'), 'warning')
    return
  }
  const format = labelFormat.value
  const formatText = labelFormatText(format)
  const text = props.packageCount
    ? t('customs.carrier.create-confirm-packages', { count: props.packageCount, format: formatText })
    : t('customs.carrier.create-confirm', { format: formatText })
  const confirmed = await showConfirm(t('customs.carrier.create-confirm-title'), text, t('button.confirm'), t('button.cancel'))
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
      handleFailure(error)
    },
  })
  // 超时 / 结果不明 / 5xx / 断网：运单可能已在 FedEx 生成，立刻按后端最新状态（unresolved、can_create）刷新按钮；
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
 * FedEx 可能已经取消也可能没有，记录停在 cancelling，要重新读取并提示核对 / 重试
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
  // 有效运单用原确认文案；重试取消（取消结果不明 / 结果不明记录）说明是再次请求 FedEx 取消
  const retry = !activeShipment.value
  const confirmed = await showConfirm(
    t('customs.carrier.cancel-confirm-title'),
    t(retry ? 'customs.carrier.cancel-retry-confirm' : 'customs.carrier.cancel-confirm', { tracking: tracking || '—' }),
    t(retry ? 'customs.carrier.operations.retry-cancel' : 'customs.carrier.operations.cancel'),
    t('button.cancel'),
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
      // 取消结果不明：概要换成「取消结果不明，请核对 / 重试」（FedEx 原文仍列在下面）
      handleFailure(error, isCancelOutcomeUnknown(error) ? t('customs.carrier.tips.cancel-unknown') : undefined)
    },
  })
  if (done) {
    const next = normalizeCarrierStatus(result)
    const notified = next ? applyStatus(next) : await load()
    showToast(t('customs.carrier.cancelled', { tracking: tracking || '—' }), 'success')
    // 已因运单变化通知过就不再重复通知
    if (!notified) emit('changed')
  } else if (failedWith) {
    // 目标已变 / 取消结果不明 / 已有取消在进行（16079）/ FedEx 拒绝等：按后端最新状态显示
    //（运单变了时 load() 会通知父组件刷新单证）
    await load()
    if (isCancelOutcomeUnknown(failedWith)) {
      showAlert(t('customs.carrier.cancel-confirm-title'), t('customs.carrier.tips.cancel-unknown'), 'warning')
    }
  }
  cancelling.value = false
}

// ------------------ 解除结果不明的运单（操作员已在 FedEx Ship Manager 核对） ----------------------
const dismiss = async () => {
  if (!unresolved.value || !canDismiss.value || busy.value) return
  dismissing.value = true
  // 先重新读取：确认框展示的是服务端当前的结果不明记录（交易 ID / 运单号），请求也带它的 id
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
    // 有运单号：后端会先请 FedEx 取消，FedEx 确认已取消 / 查无此运单才作废（否则 16094）
    t(u.tracking_number ? 'customs.carrier.unresolved.dismiss-confirm-tracking' : 'customs.carrier.unresolved.dismiss-confirm', {
      transaction: u.transaction_id || '—',
      tracking: u.tracking_number || '—',
    }),
    t('customs.carrier.operations.dismiss'),
    t('button.cancel'),
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
      // 16094：FedEx 没确认已取消，不能作废——要先在 FedEx Ship Manager 取消，用弹窗说明
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
    <h6 class="fw-semibold mb-2 d-flex align-items-center flex-wrap gap-2">
      <span><i class="ri-truck-line me-1 align-middle"></i>{{ t('customs.carrier.title') }}</span>
      <span class="badge bg-light text-default" v-if="status?.carrier">{{ String(status.carrier).toUpperCase() }}</span>
      <span class="badge bg-success-transparent" v-if="activeShipment">
        <i class="ri-checkbox-circle-line me-1"></i>{{ t('customs.carrier.status.active') }}
      </span>
    </h6>

    <div class="py-2" v-if="loading && !status">
      <div class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
      </div>
    </div>
    <div class="alert alert-danger-transparent fs-13 mb-0" v-else-if="loadError && !status">{{ loadError }}</div>

    <template v-else-if="status">
      <!-- 后端附带的提醒（如申告价额已按货值调整） -->
      <div class="alert alert-warning-transparent fs-12 py-2 mb-2" role="alert" v-if="enabled && warnings.length > 0">
        <div class="fw-semibold mb-1"><i class="ri-error-warning-line me-1"></i>{{ t('customs.carrier.tips.warnings') }}</div>
        <ul class="mb-0 ps-3">
          <li v-for="(w, i) in warnings" :key="`w-${i}`" :title="w.message || ''" class="text-break">{{ warningText(w) }}</li>
        </ul>
      </div>

      <!-- 未启用：只提示手工建运单 -->
      <p class="fs-12 text-muted mb-0" v-if="!enabled">
        <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.disabled') }}
      </p>

      <template v-else>
        <!-- 结果不明的运单：FedEx 上可能已生成，核对并处理之前不能再建单 -->
        <div class="alert mb-2" role="alert" v-if="unresolved"
          :class="unresolvedInProgress ? 'alert-warning-transparent' : 'alert-danger'">
          <div class="fw-semibold d-flex align-items-center gap-2" v-if="unresolvedInProgress">
            <span class="spinner-border spinner-border-sm" role="status"></span>
            {{ unresolvedCancelling ? t('customs.carrier.unresolved.cancelling-title') : t('customs.carrier.unresolved.in-progress-title') }}
          </div>
          <div class="fw-semibold" v-else>
            <i class="ri-alarm-warning-line me-1 fs-16 align-middle"></i>
            {{ unresolvedCancelUnknown ? t('customs.carrier.unresolved.cancel-unknown-title') : t('customs.carrier.unresolved.title') }}
          </div>
          <div class="fs-12 mt-1">
            <template v-if="unresolvedInProgress">
              {{ unresolvedCancelling ? t('customs.carrier.unresolved.cancelling') : t('customs.carrier.unresolved.in-progress') }}
            </template>
            <template v-else-if="unresolvedCancelUnknown">{{ t('customs.carrier.unresolved.cancel-unknown-description') }}</template>
            <template v-else>{{ t('customs.carrier.unresolved.description') }}</template>
          </div>
          <div class="row gy-1 fs-12 mt-2">
            <div class="col-sm-6 col-lg-3">
              <span class="opacity-75">{{ t('customs.carrier.unresolved.fields.reason') }}:</span>
              <span class="ms-1" :title="unresolved.reason || ''">{{ unresolvedReasonText }}</span>
            </div>
            <div class="col-sm-6 col-lg-3">
              <span class="opacity-75">{{ t('customs.carrier.fields.transaction-id') }}:</span>
              <span class="ms-1 font-monospace text-break">{{ unresolved.transaction_id || '—' }}</span>
            </div>
            <div class="col-sm-6 col-lg-3">
              <span class="opacity-75">{{ t('customs.carrier.unresolved.fields.tracking-number') }}:</span>
              <span class="ms-1 font-monospace">{{ unresolved.tracking_number || t('customs.carrier.unresolved.no-tracking') }}</span>
            </div>
            <div class="col-sm-6 col-lg-3">
              <span class="opacity-75">{{ t('customs.carrier.unresolved.fields.started') }}:</span>
              <span class="ms-1">{{ $dayjs(unresolved.created_at, 'YYYY-MM-DD HH:mm') || '—' }}</span>
            </div>
          </div>
          <template v-if="!unresolvedInProgress">
            <div class="fs-12 fw-semibold mt-2">{{ t('customs.carrier.unresolved.steps-title') }}</div>
            <ol class="fs-12 mb-0 ps-3">
              <li>{{ t('customs.carrier.unresolved.step1') }}</li>
              <li>{{ t('customs.carrier.unresolved.step2') }}</li>
              <li>{{ t('customs.carrier.unresolved.step3') }}</li>
            </ol>
          </template>
          <div class="btn-list mt-2">
            <!-- 重试取消：取消结果不明的运单、带运单号的结果不明记录（后端 can_cancel） -->
            <button type="button" class="btn btn-sm btn-light" v-if="canRetryCancel" :disabled="busy" @click="cancel">
              <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-close-circle-line me-1"></i>{{ t('customs.carrier.operations.retry-cancel') }}
            </button>
            <button type="button" class="btn btn-sm btn-light" v-if="canDismiss" :disabled="busy" @click="dismiss">
              <span v-if="dismissing" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-check-double-line me-1"></i>{{ t('customs.carrier.operations.dismiss') }}
            </button>
            <button type="button" class="btn btn-sm" :class="unresolvedInProgress ? 'btn-outline-secondary' : 'btn-outline-light'"
              :disabled="loading || busy" @click="load">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-refresh-line me-1"></i>{{ t('customs.carrier.operations.refresh') }}
            </button>
          </div>
        </div>

        <!-- 已建运单 -->
        <div class="border rounded p-3 mb-2" v-if="activeShipment">
          <div class="row gy-2 fs-13">
            <div class="col-sm-6 col-lg">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.tracking-number') }}</div>
              <div class="fw-semibold fs-15 font-monospace">{{ activeShipment.tracking_number || '—' }}</div>
              <div class="fs-12 text-muted" v-if="activeShipment.package_count">
                {{ t('customs.carrier.fields.package-count', { count: activeShipment.package_count }) }}
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.service') }}</div>
              <div :title="activeShipment.service_type || ''">{{ formatServiceType(activeShipment.service_type) || '—' }}</div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.net-charge') }}</div>
              <div class="font-monospace">{{ chargeText }}</div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.label-format') }}</div>
              <div>
                <template v-if="activeShipment.label_format">{{ labelFormatText(activeShipment.label_format) }}</template>
                <span class="badge bg-light text-default ms-1">{{ labelImageType }}</span>
              </div>
            </div>
            <div class="col-sm-6 col-lg">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.created') }}</div>
              <div>
                {{ $dayjs(activeShipment.created_at, 'YYYY-MM-DD HH:mm') || '—' }}
                <span class="text-muted ms-1" v-if="activeShipment.created_by">{{ userText(activeShipment.created_by) }}</span>
              </div>
              <div class="fs-12 text-muted" v-if="activeShipment.ship_date">
                {{ t('customs.carrier.fields.ship-date') }}: {{ activeShipment.ship_date }}
              </div>
            </div>
          </div>
          <div class="fs-12 text-muted mt-2" v-if="packageTrackingNumbers.length > 1">
            {{ t('customs.carrier.fields.package-tracking-numbers') }}:
            <span class="font-monospace">{{ packageTrackingNumbers.join(', ') }}</span>
          </div>
          <div class="fs-12 text-success mt-2" v-if="declaredValueText">
            <i class="ri-shield-check-line me-1"></i>{{ declaredValueText }}
          </div>
          <div class="fs-12 text-muted mt-2" v-if="activeShipment.etd_document_id">
            <i class="ri-upload-cloud-2-line me-1"></i>{{ t('customs.carrier.tips.etd-submitted') }}
          </div>
          <!-- 建单时 FedEx 返回的提示 -->
          <div class="alert alert-warning-transparent fs-12 py-2 mt-2 mb-0" v-if="alerts.length > 0">
            <div class="fw-semibold mb-1">{{ t('customs.carrier.tips.alerts') }}</div>
            <ul class="mb-0 ps-3">
              <li v-for="(a, i) in alerts" :key="`al-${i}`" class="text-break">
                <span class="badge bg-light text-default me-1" v-if="a.alert_type">{{ a.alert_type }}</span>
                <code class="me-1" v-if="a.code">{{ a.code }}</code>{{ a.message }}
              </li>
            </ul>
          </div>
          <div class="btn-list mt-3">
            <!-- PDF 面单（A4 普通打印机、热敏标签机默认）：新标签页打开打印 / 下载 -->
            <template v-if="pdfLabel">
              <button type="button" class="btn btn-sm btn-primary" :disabled="!labelDoc || busyDocId !== null"
                :title="t('customs.carrier.tips.label-open')" @click="viewDoc(dnId, labelDoc)">
                <span v-if="labelDoc && busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
                <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.print-label') }}
              </button>
              <button type="button" class="btn btn-sm btn-light" :disabled="!labelDoc || busyDocId !== null"
                @click="downloadDoc(dnId, labelDoc)">
                <i class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label') }}
              </button>
            </template>
            <!-- 指令文件面单（后端配置成 ZPLII / EPL2 时）：下载文件；直接发送到标签机是扩展点 -->
            <template v-else>
              <button type="button" class="btn btn-sm btn-primary" :disabled="!labelDoc || busyDocId !== null"
                @click="downloadRawDoc(dnId, labelDoc)">
                <span v-if="labelDoc && busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
                <i v-else class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label-file', { ext: labelFileExtension(labelImageType) }) }}
              </button>
              <button type="button" class="btn btn-sm btn-light"
                :disabled="!labelDoc || !labelPrinterBridge.available || sendingToPrinter || busyDocId !== null"
                :title="labelPrinterBridge.available ? '' : t('customs.carrier.tips.send-to-printer-unavailable')"
                @click="sendToPrinter">
                <span v-if="sendingToPrinter" class="spinner-border spinner-border-sm me-1"></span>
                <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.send-to-printer') }}
              </button>
            </template>
            <button type="button" class="btn btn-sm btn-outline-danger" v-if="canCancel" :disabled="busy" @click="cancel">
              <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-close-circle-line me-1"></i>{{ t('customs.carrier.operations.cancel') }}
            </button>
          </div>
          <div class="fs-12 text-muted mt-2" v-if="!labelDoc">{{ t('customs.carrier.tips.no-label') }}</div>
          <template v-else>
            <div class="fs-12 text-warning mt-2" v-if="labelPrintHint">
              <i class="ri-printer-line me-1"></i>{{ t(labelPrintHint) }}
            </div>
            <div class="fs-12 text-muted mt-2" v-else-if="!pdfLabel">
              <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.thermal-file', { type: labelImageType }) }}
            </div>
            <!-- A4 的打印提示已包含「运单副本页一起打印」 -->
            <div class="fs-12 text-muted mt-1" v-if="pdfLabel && auxiliaryLabel && labelPrintHint !== 'customs.carrier.tips.a4-print'">
              <i class="ri-file-copy-2-line me-1"></i>{{ t('customs.carrier.tips.auxiliary') }}
            </div>
          </template>
        </div>

        <!-- 运单取消中（cancelling）且没有对应的结果不明记录（旧后端）：按进行中处理，结束前不能建单 / 再取消；本组件定时刷新。
             新后端取消中的运单同时作为 unresolved（status cancelling）返回，由上面的结果不明区显示 -->
        <div class="alert alert-warning-transparent mb-2" role="alert" v-else-if="cancellingShipment && !unresolved">
          <div class="fw-semibold d-flex align-items-center gap-2">
            <span class="spinner-border spinner-border-sm" role="status"></span>{{ t('customs.carrier.unresolved.cancelling-title') }}
          </div>
          <div class="fs-12 mt-1">{{ t('customs.carrier.unresolved.cancelling') }}</div>
          <div class="fs-12 mt-2">
            <span class="opacity-75">{{ t('customs.carrier.fields.tracking-number') }}:</span>
            <span class="ms-1 font-monospace">{{ cancellingShipment.tracking_number || '—' }}</span>
          </div>
          <div class="btn-list mt-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="loading || busy" @click="load">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-refresh-line me-1"></i>{{ t('customs.carrier.operations.refresh') }}
            </button>
          </div>
        </div>

        <!-- 还没有有效运单 -->
        <template v-else>
          <p class="fs-12 text-muted mb-2" v-if="lastCancelled">
            <i class="ri-history-line me-1"></i>{{ t('customs.carrier.tips.last-cancelled', {
              tracking: lastCancelled.tracking_number || '—',
              time: $dayjs(lastCancelled.cancelled_at, 'YYYY-MM-DD HH:mm') || '—',
            }) }}
          </p>
          <div class="d-flex flex-wrap align-items-center gap-2 mb-2" v-if="!locked">
            <button type="button" class="btn btn-sm btn-primary" :disabled="!canCreate || busy" @click="create">
              <span v-if="creating" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-truck-line me-1"></i>{{ t('customs.carrier.operations.create') }}
            </button>
            <span class="fs-12 text-muted ms-2">{{ t('customs.carrier.fields.label-format-choice') }}</span>
            <div class="btn-group btn-group-sm" role="group" :aria-label="t('customs.carrier.fields.label-format-choice')">
              <template v-for="f in LABEL_FORMATS" :key="f">
                <input type="radio" class="btn-check" :id="`label-format-${dnId}-${f}`" :value="f"
                  :checked="labelFormat === f" :disabled="busy" autocomplete="off" @change="chooseLabelFormat(f)">
                <label class="btn btn-outline-primary" :for="`label-format-${dnId}-${f}`" :title="labelFormatTitle(f)">
                  <i class="me-1" :class="f === 'THERMAL' ? 'ri-barcode-box-line' : 'ri-file-paper-2-line'"></i>{{ labelFormatText(f) }}
                </label>
              </template>
            </div>
            <span class="fs-12 text-muted" v-if="creating">{{ t('customs.carrier.tips.creating') }}</span>
          </div>
          <template v-if="!locked">
            <p class="fs-12 text-warning mb-2" v-if="selectedPrintHint">
              <i class="ri-printer-line me-1"></i>{{ t(selectedPrintHint) }}
            </p>
            <p class="fs-12 text-muted mb-2" v-else>
              <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.thermal-file', { type: selectedImageType }) }}
            </p>
          </template>
          <p class="fs-12 text-danger mb-2" v-if="!locked && packagesDirty">
            <i class="ri-error-warning-line me-1"></i>{{ t('customs.tips.packages-unsaved-before-create') }}
          </p>
          <div class="mb-2" v-if="!locked && !status.can_create && blockers.length > 0">
            <div class="fw-semibold text-danger fs-13 mb-1">
              <i class="ri-close-circle-line me-1"></i>{{ t('customs.carrier.tips.blocked') }}
            </div>
            <ul class="mb-0 fs-13 ps-3">
              <li v-for="(b, i) in blockers" :key="`b-${i}`" :title="b.message || ''">
                {{ blockerText(b) }}
                <span class="badge bg-light text-default ms-1" v-if="b.goods_code">{{ b.goods_code }}</span>
                <span class="text-muted fs-11 ms-1" v-if="b.field">({{ b.field }})</span>
                <NuxtLink :to="`/delivery/detail/${deliveryTaskId}`" class="fs-12 ms-2"
                  v-if="deliveryTaskId && DELIVERY_TASK_BLOCKERS.includes(b.code)">
                  {{ t('customs.carrier.operations.open-delivery') }}
                </NuxtLink>
                <template v-if="EXPORTER_BLOCKERS.includes(b.code)">
                  <NuxtLink to="/company" class="fs-12 ms-2">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
                  <NuxtLink :to="`/warehouse/edit/${warehouseId}`" class="fs-12 ms-2" v-if="warehouseId">
                    {{ t('customs.operations.edit-warehouse') }}
                  </NuxtLink>
                </template>
              </li>
            </ul>
          </div>
          <p class="fs-12 text-muted mb-1" v-if="!locked && status.etd_enabled">
            <i class="ri-upload-cloud-2-line me-1"></i>{{ t('customs.carrier.tips.etd-enabled') }}
          </p>
          <p class="fs-12 text-muted mb-0" v-if="!locked">
            <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.auto') }}
            <NuxtLink :to="`/delivery/detail/${deliveryTaskId}`" class="ms-1" v-if="deliveryTaskId">
              {{ t('customs.carrier.operations.open-delivery') }}
            </NuxtLink>
          </p>
        </template>
      </template>

      <!-- 失败：承运商错误原文 -->
      <div class="alert alert-danger-transparent fs-13 mt-2 mb-0" role="alert" v-if="failure">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="fw-semibold">
            <i class="ri-error-warning-line me-1"></i>{{ failure.summary }}
          </div>
          <button type="button" class="btn-close btn-sm" :aria-label="t('button.close')" @click="failure = null"></button>
        </div>
        <div class="mt-1" v-if="failure.errors.length > 0">
          <div class="fs-12 text-muted">{{ t('customs.carrier.tips.carrier-errors') }}</div>
          <ul class="mb-0 ps-3">
            <li v-for="(e, i) in failure.errors" :key="`fe-${i}`" class="text-break">
              <code class="me-1" v-if="e.code">{{ e.code }}</code>{{ e.message }}
            </li>
          </ul>
        </div>
        <div class="fs-12 mt-1" v-if="failure.timeout">{{ t('customs.carrier.tips.timeout') }}</div>
        <div class="fs-12 mt-1" v-if="failure.permissionDenied">{{ t('customs.carrier.tips.permission-denied') }}</div>
        <div class="fs-11 text-muted mt-1 font-monospace" v-if="failure.action || failure.transactionId">
          <span v-if="failure.action">{{ t('customs.carrier.fields.action') }}: {{ actionText(failure.action) }}</span>
          <span class="ms-2" v-if="failure.transactionId">{{ t('customs.carrier.fields.transaction-id') }}: {{ failure.transactionId }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
