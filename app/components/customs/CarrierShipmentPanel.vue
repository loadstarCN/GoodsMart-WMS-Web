<script lang="ts" setup>
/**
 * 出库单单证卡片 · 承运商运单（FedEx 自动建单）
 *
 * - 未启用：不显示按钮，只提示手工建运单
 * - 可建：「在 FedEx 建运单」+ 面单打印方式（A4 普通打印机 / 热敏标签机；上次的选择 → 后端默认 → A4）；
 *   不可建时按钮置灰并列出 blockers
 * - 状态附带的提醒（warnings）按 code 显示
 * - 建单中显示进度；成功时显示 FedEx 的提示（alerts）；失败时显示 FedEx 的错误原文（errors[].code / message、交易 ID）
 * - 已建：运单号、服务、运费、面单格式；PDF 面单（A4、热敏默认）新标签页打开打印 / 下载，热敏标签机附打印设置提示；
 *   后端配置成 ZPLII / EPL2 时下载指令文件；
 *   取消运单（二次确认；DN 已发货时不显示）
 * - 有运送申告价额时注明「已随运单提交」（后端按箱分摊成每箱 declaredValue）
 * - 成功建单 / 取消后通知父组件刷新单证（后端已让 CI / PL 带上 / 去掉运单号重新签发）
 */
import type { HttpRequestError } from '~/utils/http'
import { formatMoney, useCustomsPdfActions } from '~/composables/customs/customsDocuments'
import {
  carrierShipmentUrl,
  extractCarrierAlerts,
  extractCarrierErrors,
  hasAuxiliaryLabel,
  formatServiceType,
  isActiveShipment,
  isCarrierTimeout,
  isPdfLabel,
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
  toLabelFormat,
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
}>(), {
  locked: false,
  packageCount: null,
  customs: null,
  warehouseId: null,
})

const emit = defineEmits<{
  /** 建单 / 取消成功：运单号变了，父组件要刷新单证 */
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
const failure = ref<CarrierRequestFailure | null>(null)
/** 建单成功时 FedEx 返回的提示（建议显示） */
const alerts = ref<CarrierAlert[]>([])
/** 面单打印方式：上次的选择（localStorage）优先，没有时用后端默认，最后 A4 */
const labelFormat = ref<LabelFormat>('A4')
/** 用户自己选过（localStorage 里有）：后端默认不覆盖 */
let labelFormatChosen = false

// ------------------ 读取 ----------------------
const load = async () => {
  loading.value = true
  loadError.value = null
  await httpRequest<CarrierShipmentStatus>(carrierShipmentUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      status.value = normalizeCarrierStatus(data)
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
const lastCancelled = computed(() => (shipment.value && !isActiveShipment(shipment.value) ? shipment.value : null))
const blockers = computed<CarrierShipmentBlocker[]>(() => status.value?.blockers || [])
const canCreate = computed(() => enabled.value && !props.locked && !!status.value?.can_create && !activeShipment.value)
const busy = computed(() => creating.value || cancelling.value)

const labelDoc = computed(() => labelDocumentOf(activeShipment.value))
const labelImageType = computed(() => labelImageTypeOf(activeShipment.value))
const pdfLabel = computed(() => isPdfLabel(activeShipment.value))
/** 已建面单的打印提示（PDF：A4 选「适合纸张」、热敏选 100×150mm 实际大小） */
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
  return w.code && te(key) ? t(key) : (w.message || w.code || '')
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
const declaredValueText = computed(() => {
  // 运单上记的申告价额优先，其次状态 / 报关快照上的
  const candidates = [activeShipment.value?.declared_value, status.value?.declared_value_carriage, props.customs?.declared_value_carriage]
  const v = candidates.find((x) => x !== null && x !== undefined && (x as any) !== '' && !isNaN(Number(x)))
  if (v === undefined) return ''
  return formatMoney(Number(v), props.customs?.currency || 'JPY')
})
const chargeText = computed(() => {
  const s = activeShipment.value
  if (!s || s.net_charge === null || s.net_charge === undefined || s.net_charge === '') return '—'
  return formatMoney(Number(s.net_charge), s.currency || 'JPY')
})

// ------------------ 失败：显示承运商错误原文 ----------------------
const handleFailure = (error: HttpRequestError) => {
  const summary = bizErrorMessage(error)
  // 409：前置条件不满足，details.blockers 是最新的原因清单
  const latest = error.details?.blockers
  if (Array.isArray(latest) && status.value) {
    status.value = { ...status.value, blockers: latest, can_create: false }
  }
  const { errors, transactionId, action, permissionDenied, maybeProcessed } = extractCarrierErrors(error.details)
  const timeout = isCarrierTimeout(error)
  if (errors.length > 0 || transactionId || timeout || error.status === 502) {
    failure.value = {
      summary,
      // 没有逐条错误时把后端原文也带上（后端 message 里带着 FedEx 原文，业务码文案会盖住它）
      errors: errors.length > 0 || !error.message || error.message === summary ? errors : [{ code: null, message: error.message }],
      transactionId,
      timeout: timeout && maybeProcessed,
      action,
      permissionDenied,
    }
  }
  showToast(summary, 'error')
}

// ------------------ 建单 ----------------------
const create = async () => {
  if (!canCreate.value || busy.value) return
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
  await httpRequest<any>(carrierShipmentUrl(props.dnId), {
    method: 'POST',
    body: { label_format: format },
    onSuccess: (data) => {
      created = data ?? {}
    },
    onError: handleFailure,
  })
  if (created) {
    const next = normalizeCarrierStatus(created)
    if (next) {
      status.value = next
    } else {
      await load()
    }
    alerts.value = extractCarrierAlerts(created)
    const tracking = created?.shipment?.tracking_number || created?.tracking_number || activeShipment.value?.tracking_number || ''
    showToast(t('customs.carrier.created', { tracking }), 'success')
    emit('changed')
  }
  creating.value = false
}

// ------------------ 取消运单 ----------------------
const cancel = async () => {
  const s = activeShipment.value
  if (!s || props.locked || busy.value) return
  const confirmed = await showConfirm(
    t('customs.carrier.cancel-confirm-title'),
    t('customs.carrier.cancel-confirm', { tracking: s.tracking_number || '' }),
    t('customs.carrier.operations.cancel'),
    t('button.cancel'),
  )
  if (!confirmed) return

  cancelling.value = true
  failure.value = null
  alerts.value = []
  let done = false
  let result: any = null
  await httpRequest<any>(`${carrierShipmentUrl(props.dnId)}/cancel`, {
    method: 'POST',
    body: {},
    onSuccess: (data) => {
      done = true
      result = data
    },
    onError: handleFailure,
  })
  if (done) {
    const next = normalizeCarrierStatus(result)
    if (next) {
      status.value = next
    } else {
      await load()
    }
    showToast(t('customs.carrier.cancelled', { tracking: s.tracking_number || '' }), 'success')
    emit('changed')
  }
  cancelling.value = false
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

defineExpose({ reload: load })
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
            <i class="ri-shield-check-line me-1"></i>{{ t('customs.carrier.tips.declared-value-submitted', { amount: declaredValueText }) }}
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
            <button type="button" class="btn btn-sm btn-outline-danger" v-if="!locked" :disabled="busy" @click="cancel">
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
            <div class="fs-12 text-muted mt-1" v-if="pdfLabel && auxiliaryLabel">
              <i class="ri-file-copy-2-line me-1"></i>{{ t('customs.carrier.tips.auxiliary') }}
            </div>
          </template>
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
