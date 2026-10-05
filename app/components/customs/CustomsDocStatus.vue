<script lang="ts" setup>
/**
 * 海外出荷単証的状态概要（打包详情、发货详情用）
 * 显示当前有效的 CI / PL 版本、问题数量、运送申告价额、FedEx 自动建的运单，并可打印、跳到出库单的单证卡片。
 * 自动运单结果不明 / 建单中 / 取消中时醒目提示并链接到单证卡片（不能显示成「尚未建运单」，否则会引导手工重复建单）；
 * 读到的承运商状态通过 carrier-status 通知父组件（配送页据此调整流程提示）。
 */
import {
  pickCurrentDocument,
  useCustomsPdfActions,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'
import {
  carrierDeclaredValueOverride,
  carrierShipmentUrl,
  carrierSummaryState,
  declaredValueModeOf,
  isActiveShipment,
  isPdfLabel,
  labelDocumentOf,
  labelFileExtension,
  labelImageTypeOf,
  labelPrintHintKey,
  normalizeCarrierStatus,
  type CarrierShipmentStatus,
} from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  dnId: number | string
  showPrint?: boolean
}>(), {
  showPrint: true,
})

const emit = defineEmits<{
  /** 读到的承运商运单状态（读不到为 null） */
  (e: 'carrier-status', status: CarrierShipmentStatus | null): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const { busyDocId, printDoc, viewDoc, downloadRawDoc } = useCustomsPdfActions()

const loading = ref(false)
const view = ref<CustomsView | null>(null)
const loadError = ref<string | null>(null)
/** 承运商运单状态（读不到时当作未启用，不影响单证概要） */
const carrierStatus = ref<CarrierShipmentStatus | null>(null)

const loadCarrier = async () => {
  await httpRequest<CarrierShipmentStatus>(carrierShipmentUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      carrierStatus.value = normalizeCarrierStatus(data)
    },
    onError: () => {
      carrierStatus.value = null
    },
  })
  emit('carrier-status', carrierStatus.value)
}

const load = async () => {
  if (!props.dnId) return
  loading.value = true
  loadError.value = null
  await Promise.all([
    httpRequest<CustomsView>(`/api/warehouse/dn/${props.dnId}/customs`, {
      method: 'GET',
      onSuccess: (data) => {
        view.value = data
      },
      onError: (error) => {
        loadError.value = bizErrorMessage(error)
      },
    }),
    loadCarrier(),
  ])
  loading.value = false
}

onMounted(load)
watch(() => props.dnId, load)

const ci = computed(() => pickCurrentDocument(view.value?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(view.value?.current_documents, 'packing_list'))
const errorCount = computed(() => (view.value?.problems || []).filter((p: CustomsProblem) => p.level === 'error').length)
const warningCount = computed(() => (view.value?.problems || []).filter((p: CustomsProblem) => p.level === 'warning').length)
const hasDocuments = computed(() => !!ci.value && !!pl.value)
const outdated = computed(() => !view.value?.locked && !!view.value?.documents_outdated && hasDocuments.value)
const carrierEnabled = computed(() => !!carrierStatus.value?.enabled)
const carrierShipment = computed(() => {
  const s = carrierStatus.value?.shipment
  return isActiveShipment(s) ? s : null
})
/** 自动运单概要状态：结果不明 / 建单中 / 取消中 / 有效 / 没有 */
const carrierState = computed(() => carrierSummaryState(carrierStatus.value))
/** 结果不明 / 取消结果不明 / 建单中 / 取消中：要醒目提示并引导到单证卡片处理 */
const carrierAttention = computed(() => ['unresolved', 'cancel-unresolved', 'creating', 'cancelling'].includes(carrierState.value))
/** 结果不明（建单或取消）：要人处理，红色 */
const carrierUnresolved = computed(() => carrierState.value === 'unresolved' || carrierState.value === 'cancel-unresolved')
const carrierAttentionTitle = computed(() => {
  if (carrierState.value === 'creating') return t('customs.carrier.unresolved.in-progress-title')
  if (carrierState.value === 'cancelling') return t('customs.carrier.unresolved.cancelling-title')
  if (carrierState.value === 'cancel-unresolved') return t('customs.carrier.unresolved.cancel-unknown-title')
  return t('customs.carrier.unresolved.title')
})
const carrierAttentionText = computed(() => {
  if (carrierState.value === 'unresolved') return t('customs.carrier.summary.unresolved')
  if (carrierState.value === 'cancel-unresolved') return t('customs.carrier.summary.cancel-unresolved')
  return t('customs.carrier.summary.in-progress')
})
/** 结果不明 / 进行中运单的已知运单号、交易 ID（取消中的有效运单用运单本身的号码） */
const carrierAttentionTracking = computed(() => {
  const s = carrierStatus.value
  if (s?.unresolved) return s.unresolved.tracking_number
  return carrierState.value === 'cancelling' ? (s?.shipment?.tracking_number || null) : null
})
const carrierAttentionTransaction = computed(() => carrierStatus.value?.unresolved?.transaction_id || null)
const declaredValueMode = computed(() => declaredValueModeOf(carrierStatus.value))
const carrierDeclaredValue = computed(() => carrierDeclaredValueOverride(carrierStatus.value))
const labelDoc = computed(() => labelDocumentOf(carrierShipment.value))
const pdfLabel = computed(() => isPdfLabel(carrierShipment.value))
/** PDF 面单的打印提示（A4 纸 / 热敏 100×150mm，都按实际大小 100% 打印） */
const labelPrintHint = computed(() => {
  const s = carrierShipment.value
  return s ? labelPrintHintKey(s.label_format || 'A4', labelImageTypeOf(s)) : null
})
const labelExt = computed(() => labelFileExtension(labelImageTypeOf(carrierShipment.value)))

defineExpose({ reload: load })
</script>

<template>
  <div class="customs-doc-status">
    <div class="d-flex justify-content-center py-2" v-if="loading && !view">
      <div class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
      </div>
    </div>
    <div class="alert alert-danger-transparent fs-12 mb-0" v-else-if="loadError">{{ loadError }}</div>
    <template v-else-if="view">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span class="badge bg-danger" v-if="outdated">
          <i class="ri-error-warning-line me-1"></i>{{ t('customs.status.outdated') }}
        </span>
        <span class="badge" :class="hasDocuments ? 'bg-success-transparent' : 'bg-danger-transparent'" v-else>
          <i :class="hasDocuments ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="me-1"></i>
          {{ hasDocuments ? t('customs.status.issued') : t('customs.status.not-issued') }}
        </span>
        <span class="badge bg-secondary-transparent" v-if="view.locked">
          <i class="ri-lock-line me-1"></i>{{ t('customs.status.locked') }}
        </span>
        <span class="badge bg-danger-transparent" v-if="errorCount > 0">
          {{ t('customs.errors') }} {{ errorCount }}
        </span>
        <span class="badge bg-warning-transparent" v-if="warningCount > 0">
          {{ t('customs.warnings') }} {{ warningCount }}
        </span>
      </div>

      <div class="alert alert-danger py-2 fs-13 mb-2" role="alert" v-if="outdated">
        <i class="ri-error-warning-line me-1"></i>{{ t('customs.tips.documents-outdated') }}
      </div>

      <!-- 自动运单结果不明 / 建单中 / 取消中：FedEx 上可能已有运单，不要手工再建，到单证卡片处理 -->
      <div class="alert py-2 fs-13 mb-2" role="alert" v-if="carrierAttention"
        :class="carrierUnresolved ? 'alert-danger' : 'alert-warning-transparent'">
        <div class="fw-semibold d-flex align-items-center gap-2">
          <i class="ri-alarm-warning-line fs-16" v-if="carrierUnresolved"></i>
          <span class="spinner-border spinner-border-sm" role="status" v-else></span>
          {{ carrierAttentionTitle }}
        </div>
        <div class="fs-12 mt-1">{{ carrierAttentionText }}</div>
        <div class="fs-12 mt-1" v-if="carrierAttentionTransaction || carrierAttentionTracking">
          <span class="me-3" v-if="carrierAttentionTransaction">
            <span class="opacity-75">{{ t('customs.carrier.fields.transaction-id') }}:</span>
            <span class="ms-1 font-monospace text-break">{{ carrierAttentionTransaction }}</span>
          </span>
          <span v-if="carrierAttentionTracking">
            <span class="opacity-75">{{ t('customs.carrier.unresolved.fields.tracking-number') }}:</span>
            <span class="ms-1 font-monospace">{{ carrierAttentionTracking }}</span>
          </span>
        </div>
        <NuxtLink :to="`/dn/detail/${dnId}#customs-documents`" class="btn btn-sm mt-2"
          :class="carrierUnresolved ? 'btn-light' : 'btn-outline-secondary'">
          <i class="ri-file-list-3-line me-1"></i>{{ t('customs.carrier.summary.open-card') }}
        </NuxtLink>
      </div>

      <!-- 运送申告价额：手工建单时在承运商系统填写；FedEx 自动建单时随运单提交 -->
      <DeclaredValueNotice :customs="view.customs" :mode="declaredValueMode" :carrier-value="carrierDeclaredValue" compact />

      <ul class="list-unstyled mb-2 fs-13">
        <li class="mb-1">
          <span class="fw-semibold">{{ t('customs.doc-types.commercial_invoice') }} :</span>
          <template v-if="ci">
            v{{ ci.version }}<span class="text-muted ms-1" v-if="ci.document_number">（{{ ci.document_number }}）</span>
          </template>
          <span class="text-danger ms-1" v-else>{{ t('customs.status.not-issued') }}</span>
        </li>
        <li>
          <span class="fw-semibold">{{ t('customs.doc-types.packing_list') }} :</span>
          <template v-if="pl">
            v{{ pl.version }}<span class="text-muted ms-1" v-if="pl.document_number">（{{ pl.document_number }}）</span>
          </template>
          <span class="text-danger ms-1" v-else>{{ t('customs.status.not-issued') }}</span>
        </li>
        <li class="mt-1" v-if="carrierEnabled">
          <span class="fw-semibold">{{ t('customs.carrier.title') }} :</span>
          <span class="badge bg-danger ms-1" v-if="carrierState === 'unresolved'">
            <i class="ri-alarm-warning-line me-1"></i>{{ t('customs.carrier.status.unresolved') }}
          </span>
          <span class="badge bg-danger ms-1" v-else-if="carrierState === 'cancel-unresolved'">
            <i class="ri-alarm-warning-line me-1"></i>{{ t('customs.carrier.status.cancel-unresolved') }}
          </span>
          <span class="badge bg-warning-transparent ms-1" v-else-if="carrierState === 'creating'">
            {{ t('customs.carrier.status.creating') }}
          </span>
          <span class="badge bg-warning-transparent ms-1" v-else-if="carrierState === 'cancelling'">
            {{ t('customs.carrier.status.cancelling') }}
          </span>
          <template v-else-if="carrierShipment">
            <span class="font-monospace ms-1">{{ carrierShipment.tracking_number }}</span>
            <span class="badge bg-success-transparent ms-1">{{ t('customs.carrier.status.auto-created') }}</span>
          </template>
          <span class="text-muted ms-1" v-else>{{ t('customs.carrier.status.not-created') }}</span>
        </li>
      </ul>

      <div class="btn-list">
        <template v-if="showPrint">
          <button type="button" class="btn btn-sm btn-primary-light" :disabled="!ci || busyDocId !== null"
            @click="printDoc(dnId, ci)">
            <span v-if="ci && busyDocId === ci.id" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-ci') }}
          </button>
          <button type="button" class="btn btn-sm btn-primary-light" :disabled="!pl || busyDocId !== null"
            @click="printDoc(dnId, pl)">
            <span v-if="pl && busyDocId === pl.id" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-pl') }}
          </button>
          <!-- 面单：PDF 新标签页打开打印（热敏标签机提示打印设置）；ZPL / EPL 指令文件下载（用标签机的打印程序打开） -->
          <template v-if="labelDoc">
            <button type="button" class="btn btn-sm btn-primary-light" v-if="pdfLabel" :disabled="busyDocId !== null"
              :title="labelPrintHint ? t(labelPrintHint) : t('customs.carrier.tips.label-open')"
              @click="viewDoc(dnId, labelDoc)">
              <span v-if="busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.carrier.operations.print-label') }}
            </button>
            <button type="button" class="btn btn-sm btn-primary-light" v-else :disabled="busyDocId !== null"
              :title="t('customs.carrier.tips.send-to-printer-unavailable')" @click="downloadRawDoc(dnId, labelDoc)">
              <span v-if="busyDocId === labelDoc.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-download-line me-1"></i>{{ t('customs.carrier.operations.download-label-file', { ext: labelExt }) }}
            </button>
          </template>
        </template>
        <NuxtLink :to="`/dn/detail/${dnId}#customs-documents`" class="btn btn-sm btn-light">
          <i class="ri-file-list-3-line me-1"></i>{{ t('customs.operations.open-card') }}
        </NuxtLink>
      </div>
      <p class="fs-12 text-warning mt-2 mb-0" v-if="showPrint && labelDoc && pdfLabel && labelPrintHint">
        <i class="ri-printer-line me-1"></i>{{ t(labelPrintHint) }}
      </p>
    </template>
  </div>
</template>
