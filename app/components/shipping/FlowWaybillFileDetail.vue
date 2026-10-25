<script lang="ts" setup>
/**
 * 发货流程 ·「运单」一步的文件方式部分（承运商的运单方式 = file，后端 doc/shipping-flow.md §6.1）：
 * - export_file：把这张 DN 按承运商软件的导入格式导出（POST /dn/carrier-files/export，下载文件）；
 *   有问题的行不导出（409 16137）→ 逐行问题表（CarrierExportProblems）
 * - 已导出、等导回（summary.export 或 status = exported 的 file 运单）：显示导出时刻、批次、文件名；可以重新导出
 * - import_numbers：导回承运商软件给的运单号文件（CarrierImportModal：预览 → 确认 → 结果）
 * - discard_export：作废导出记录（POST /dn/<id>/carrier-shipment/discard-export，只改本地，二次确认）
 * 能不能做按 actions[].enabled（不能做的原因由运单一步下面的 ShippingFlowActionNotes 列出）；后端没列出时按状态兜底。
 * 运单号导回后由 CarrierShipmentPanel 显示（与手工 / 在线运单同一张卡片）。做了操作 emit changed。
 * 标题行的「导出文件」「导回运单号」按钮经 run(key) 调到这里。
 */
import type { HttpRequestError } from '~/utils/http'
import { formatUserRef } from '~/composables/customs/customsDocuments'
import {
  CARRIER_FILE_BIZ_CODES,
  discardExportUrl,
  exportCarrierFile,
  exportProblemRows,
  fileExportInfoOf,
  type ExportProblemRow,
  type ImportResult,
} from '~/composables/shipping/carrierFile'
import { flowActionEnabled, type FlowCarrier, type FlowStep } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  step: FlowStep
  carrier: FlowCarrier | null
  warehouseId?: number | string | null
  /** DN 已发货 */
  locked?: boolean
}>(), {
  warehouseId: null,
  locked: false,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()
/** 导出时刻按流程提供的时区（DN 所属仓库）显示 */
const { formatLocale } = useTimeZone()

const carrierName = computed(() => props.carrier?.name || t('customs.carrier.carrier-fallback'))
const exportInfo = computed(() => fileExportInfoOf(props.step.summary))
const hasTracking = computed(() => !!String(props.step.summary?.tracking_number || '').trim())
const unresolved = computed(() => !!props.step.summary?.unresolved)

const canExport = computed(() => !!props.carrier && flowActionEnabled(props.step, 'export_file',
  !props.locked && !hasTracking.value && !unresolved.value))
const canImport = computed(() => !!props.carrier && flowActionEnabled(props.step, 'import_numbers',
  !props.locked && !hasTracking.value))
const canDiscard = computed(() => flowActionEnabled(props.step, 'discard_export', !props.locked && !!exportInfo.value))

const exportedAtText = computed(() => formatLocale(exportInfo.value?.exported_at ?? null))
const exportedByText = computed(() => (exportInfo.value?.exported_by ? formatUserRef(exportInfo.value.exported_by, t) : ''))

const warehouse = computed(() =>
  props.warehouseId === null || props.warehouseId === undefined || props.warehouseId === '' ? null : Number(props.warehouseId))

// ------------------ 导出 ----------------------
const exporting = ref(false)
const problems = ref<ExportProblemRow[]>([])
const exportFile = async () => {
  if (!canExport.value || exporting.value || !props.carrier) return
  exporting.value = true
  problems.value = []
  let fileName: string | null = null
  try {
    fileName = await exportCarrierFile({ carrier_id: props.carrier.id, dn_ids: [Number(props.dnId)], warehouse_id: warehouse.value })
  } catch (e) {
    const error = e as HttpRequestError
    if (error.code === CARRIER_FILE_BIZ_CODES.EXPORT_PROBLEMS) {
      problems.value = exportProblemRows(error)
      if (!problems.value.length) showToast(bizErrorMessage(error), 'error')
    } else {
      showToast(bizErrorMessage(error), 'error')
    }
  } finally {
    exporting.value = false
  }
  if (fileName) {
    showToast(t('shipping.file.exported-toast', { file: fileName }), 'success')
    emit('changed')
  }
}

// ------------------ 导回运单号 ----------------------
const importOpen = ref(false)
const onImported = (result: ImportResult) => {
  if (result.summary.matched) emit('changed')
}

// ------------------ 作废导出 ----------------------
const discarding = ref(false)
const discard = async () => {
  if (!canDiscard.value || discarding.value) return
  const confirmed = await wConfirm({
    title: t('shipping.file.discard-confirm-title'),
    message: t('shipping.file.discard-confirm', { carrier: carrierName.value }),
    confirmText: t('shipping.actions.discard_export'),
    cancelText: t('shipping.file.keep-export'),
    danger: true,
  })
  if (!confirmed) return
  discarding.value = true
  await httpRequest<any>(discardExportUrl(props.dnId), {
    method: 'POST',
    body: {},
    onSuccess: () => {
      showToast(t('shipping.file.discarded-toast'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      discarding.value = false
    },
  })
  // 失败（如别人刚导回了运单号）也重读，按最新状态显示
  emit('changed')
}

const busy = computed(() => exporting.value || discarding.value)

/** 标题行的按钮：展开后直接做 */
const run = (key: string) => {
  if (key === 'export_file') exportFile()
  else if (key === 'import_numbers') importOpen.value = true
  else if (key === 'discard_export') discard()
}

defineExpose({ run })
</script>

<template>
  <div class="w-flow-file">
    <!-- 已导出、等导回运单号 -->
    <template v-if="exportInfo && !hasTracking">
      <div class="w-flow-file__head">
        <WStatus tone="warn">{{ t('shipping.file.exported-title') }}</WStatus>
        <WHelp :text="t('shipping.file.exported-next', { carrier: carrierName })" />
      </div>
      <div class="w-flow-file__meta">
        <span v-if="exportedAtText">{{ t('shipping.file.exported-at', { time: exportedAtText }) }}</span>
        <span v-if="exportInfo.export_count">{{ t('shipping.file.export-count', { count: exportInfo.export_count }) }}</span>
        <span v-if="exportInfo.batch_id">{{ t('shipping.file.batch', { id: exportInfo.batch_id }) }}</span>
        <span v-if="exportInfo.file_name" class="w-flow-file__name">{{ exportInfo.file_name }}</span>
        <span v-if="exportedByText">{{ exportedByText }}</span>
      </div>
      <div v-if="!locked" class="w-flow-file__actions">
        <WButton v-if="canDiscard" variant="danger" :loading="discarding" :disabled="busy && !discarding" @click="discard">
          {{ t('shipping.actions.discard_export') }}
        </WButton>
        <span class="w-flow-file__spacer" />
        <WButton :loading="exporting" :disabled="!canExport || (busy && !exporting)" @click="exportFile">{{ t('shipping.file.export-again') }}</WButton>
        <WButton variant="primary" :disabled="!canImport || busy" @click="importOpen = true">{{ t('shipping.actions.import_numbers') }}</WButton>
      </div>
    </template>

    <!-- 还没导出 -->
    <template v-else-if="!hasTracking && !locked">
      <div class="w-flow-file__head">
        <span class="w-flow-file__intro">{{ t('shipping.file.intro-short', { carrier: carrierName }) }}</span>
        <WHelp :text="t('shipping.file.intro', { carrier: carrierName })" />
      </div>
      <div class="w-flow-file__actions">
        <WButton variant="primary" icon="asn" :loading="exporting" :disabled="!canExport || (busy && !exporting)" @click="exportFile">
          {{ t('shipping.file.export-csv') }}
        </WButton>
        <WButton :disabled="!canImport || busy" @click="importOpen = true">{{ t('shipping.actions.import_numbers') }}</WButton>
      </div>
    </template>

    <CarrierExportProblems v-if="problems.length" :rows="problems" closable @close="problems = []" />

    <CarrierImportModal v-model:open="importOpen" :carrier-id="carrier?.id ?? null" :carrier-name="carrier?.name ?? null"
      :warehouse-id="warehouseId" :highlight-dn-id="dnId" @imported="onImported" />
  </div>
</template>

<style scoped>
.w-flow-file {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-flow-file__head { display: flex; align-items: center; gap: 6px; }
.w-flow-file__intro { color: var(--w-text-2); }
.w-flow-file__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: -6px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-flow-file__name { overflow-wrap: anywhere; font-family: var(--w-font-mono); }
.w-flow-file__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.w-flow-file__spacer { flex: 1; }
</style>
