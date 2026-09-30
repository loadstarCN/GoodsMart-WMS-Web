<script lang="ts" setup>
/**
 * 出库单单证卡片 · 承运商运单（FedEx 自动建单）
 *
 * - 未启用：不显示按钮，只提示手工建运单
 * - 可建：「在 FedEx 建运单」；不可建时按钮置灰并列出 blockers
 * - 建单中显示进度；失败时显示 FedEx 的错误原文（errors[].code / message、交易 ID）
 * - 已建：运单号、服务、运费、面单打印 / 下载、取消运单（二次确认；DN 已发货时不显示）
 * - 有运送申告价额时注明「已随运单提交」（后端按箱分摊成每箱 declaredValue）
 * - 成功建单 / 取消后通知父组件刷新单证（运单号计入 CI）
 */
import type { HttpRequestError } from '~/utils/http'
import { formatMoney, useCustomsPdfActions } from '~/composables/customs/customsDocuments'
import {
  carrierShipmentUrl,
  extractCarrierErrors,
  formatServiceType,
  isActiveShipment,
  isCarrierTimeout,
  labelDocumentOf,
  normalizeCarrierStatus,
  type CarrierRequestFailure,
  type CarrierShipmentBlocker,
  type CarrierShipmentStatus,
} from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  dnId: number | string
  /** DN 已发货（只读）：不能建单、不能取消 */
  locked?: boolean
  /** 箱数（建单确认文案用） */
  packageCount?: number | null
  /** 报关快照：有运送申告价额时，自动建单会随运单提交 */
  customs?: Record<string, any> | null
}>(), {
  locked: false,
  packageCount: null,
  customs: null,
})

const emit = defineEmits<{
  /** 建单 / 取消成功：运单号变了，父组件要刷新单证 */
  (e: 'changed'): void
  /** 读到新的状态（父组件据此切换申告价额提示） */
  (e: 'status', status: CarrierShipmentStatus | null): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const { busyDocId, viewDoc, downloadDoc } = useCustomsPdfActions()

const loading = ref(false)
const loadError = ref<string | null>(null)
/** 后端还没有这个接口（旧版本）：整块不显示 */
const unsupported = ref(false)
const status = ref<CarrierShipmentStatus | null>(null)
const creating = ref(false)
const cancelling = ref(false)
const failure = ref<CarrierRequestFailure | null>(null)

// ------------------ 读取 ----------------------
const load = async () => {
  loading.value = true
  loadError.value = null
  await httpRequest<CarrierShipmentStatus>(carrierShipmentUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      status.value = normalizeCarrierStatus(data)
      unsupported.value = false
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

onMounted(load)
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

const blockerText = (b: CarrierShipmentBlocker) => {
  // 专门的承运商文案优先；签发单证的条件不全时后端直接复用单证问题码
  for (const key of [`customs.carrier.blockers.${b.code}`, `customs.problems.${b.code}`]) {
    if (te(key)) return t(key)
  }
  return b.message || b.code
}
const userText = (u: any) => (u && typeof u === 'object' ? (u.user_name || u.email || u.id) : (u ?? ''))
const declaredValueText = computed(() => {
  const v = props.customs?.declared_value_carriage
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return ''
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
  const { errors, transactionId } = extractCarrierErrors(error.details)
  const timeout = isCarrierTimeout(error)
  if (errors.length > 0 || transactionId || timeout || error.status === 502) {
    failure.value = {
      summary,
      // 没有逐条错误时把后端原文也带上（业务码文案可能盖住了承运商的说明）
      errors: errors.length > 0 || !error.message || error.message === summary ? errors : [{ code: null, message: error.message }],
      transactionId,
      timeout,
    }
  }
  showToast(summary, 'error')
}

// ------------------ 建单 ----------------------
const create = async () => {
  if (!canCreate.value || busy.value) return
  const text = props.packageCount
    ? t('customs.carrier.create-confirm-packages', { count: props.packageCount })
    : t('customs.carrier.create-confirm')
  const confirmed = await showConfirm(t('customs.carrier.create-confirm-title'), text, t('button.confirm'), t('button.cancel'))
  if (!confirmed) return

  creating.value = true
  failure.value = null
  let created: any = null
  await httpRequest<any>(carrierShipmentUrl(props.dnId), {
    method: 'POST',
    body: {},
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
      <!-- 未启用：只提示手工建运单 -->
      <p class="fs-12 text-muted mb-0" v-if="!enabled">
        <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.disabled') }}
      </p>

      <template v-else>
        <!-- 已建运单 -->
        <div class="border rounded p-3 mb-2" v-if="activeShipment">
          <div class="row gy-2 fs-13">
            <div class="col-md-4">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.tracking-number') }}</div>
              <div class="fw-semibold fs-15 font-monospace">{{ activeShipment.tracking_number || '—' }}</div>
            </div>
            <div class="col-md-3">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.service') }}</div>
              <div :title="activeShipment.service_type || ''">{{ formatServiceType(activeShipment.service_type) || '—' }}</div>
            </div>
            <div class="col-md-2">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.net-charge') }}</div>
              <div class="font-monospace">{{ chargeText }}</div>
            </div>
            <div class="col-md-3">
              <div class="text-muted fs-12">{{ t('customs.carrier.fields.created') }}</div>
              <div>
                {{ $dayjs(activeShipment.created_at, 'YYYY-MM-DD HH:mm') || '—' }}
                <span class="text-muted ms-1" v-if="activeShipment.created_by">{{ userText(activeShipment.created_by) }}</span>
              </div>
            </div>
          </div>
          <div class="fs-12 text-success mt-2" v-if="declaredValueText">
            <i class="ri-shield-check-line me-1"></i>{{ t('customs.carrier.tips.declared-value-submitted', { amount: declaredValueText }) }}
          </div>
          <div class="fs-12 text-muted mt-2" v-if="activeShipment.etd_document_id">
            <i class="ri-upload-cloud-2-line me-1"></i>{{ t('customs.carrier.tips.etd-submitted') }}
          </div>
          <div class="btn-list mt-3">
            <button type="button" class="btn btn-sm btn-primary" :disabled="!labelDoc || busyDocId !== null"
              :title="t('customs.carrier.tips.label-open')" @click="viewDoc(dnId, labelDoc)">
              <span v-if="labelDoc && busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.print-label') }}
            </button>
            <button type="button" class="btn btn-sm btn-light" :disabled="!labelDoc || busyDocId !== null"
              @click="downloadDoc(dnId, labelDoc)">
              <i class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label') }}
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" v-if="!locked" :disabled="busy" @click="cancel">
              <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-close-circle-line me-1"></i>{{ t('customs.carrier.operations.cancel') }}
            </button>
          </div>
          <div class="fs-12 text-muted mt-2" v-if="!labelDoc">{{ t('customs.carrier.tips.no-label') }}</div>
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
            <span class="fs-12 text-muted" v-if="creating">{{ t('customs.carrier.tips.creating') }}</span>
          </div>
          <div class="mb-2" v-if="!locked && !status.can_create && blockers.length > 0">
            <div class="fw-semibold text-danger fs-13 mb-1">
              <i class="ri-close-circle-line me-1"></i>{{ t('customs.carrier.tips.blocked') }}
            </div>
            <ul class="mb-0 fs-13 ps-3">
              <li v-for="(b, i) in blockers" :key="`b-${i}`" :title="b.message || ''">
                {{ blockerText(b) }}
                <span class="badge bg-light text-default ms-1" v-if="b.goods_code">{{ b.goods_code }}</span>
                <span class="text-muted fs-11 ms-1" v-if="b.field">({{ b.field }})</span>
              </li>
            </ul>
          </div>
          <p class="fs-12 text-muted mb-0" v-if="!locked">
            <i class="ri-information-line me-1"></i>{{ t('customs.carrier.tips.auto') }}
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
        <div class="fs-11 text-muted mt-1 font-monospace" v-if="failure.transactionId">
          {{ t('customs.carrier.fields.transaction-id') }}: {{ failure.transactionId }}
        </div>
      </div>
    </template>
  </div>
</template>
