<script lang="ts" setup>
/**
 * 导回运单号（运单方式 = 文件：在承运商软件里打完单，把它导出的带运单号的 CSV 导回 WMS）。
 * 发货流程的运单一步（单张 DN）和出库单列表的「待导回」（批量）共用。
 *
 * 1. 选承运商（列表页；流程里固定为这张 DN 的承运商）和文件
 * 2. 预览：POST /dn/carrier-files/import dry_run = true → 逐行结果（matched 会写入 / not_found 没找到出库单 /
 *    already_has_number 已有别的运单号（不改，要换号请到出库单上处理）/ same_number 已导入过（忽略）/ invalid 格式不对）
 * 3. 确认：同一个文件以 dry_run = false 提交，只写 matched 的行 → 显示结果，emit imported（父组件刷新）
 * 文件不对 / 承运商不是文件方式：400 16138，在弹窗里显示。
 * highlightDnId：流程里打开时，这张 DN 的行加粗（文件里可能还有别的 DN，也一起导入）。
 */
import type { HttpRequestError } from '~/utils/http'
import {
  IMPORT_RESULTS,
  importCarrierFile,
  importResultColor,
  importRowMessage,
  type FileCarrierOption,
  type ImportResult,
  type ImportRow,
} from '~/composables/shipping/carrierFile'

const props = withDefaults(defineProps<{
  open: boolean
  /** 固定的承运商（流程里）；列表页传 carriers 让人选，这里是默认选中的 */
  carrierId?: number | null
  carrierName?: string | null
  /** 可选的承运商（文件方式的）；不传 = 固定为 carrierId */
  carriers?: FileCarrierOption[] | null
  warehouseId?: number | string | null
  highlightDnId?: number | string | null
}>(), {
  carrierId: null,
  carrierName: null,
  carriers: null,
  warehouseId: null,
  highlightDnId: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 已提交（dry_run = false 成功） */
  (e: 'imported', result: ImportResult): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()

type Step = 'choose' | 'preview' | 'done'
const step = ref<Step>('choose')
const chosenCarrier = ref<number | null>(null)
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const preview = ref<ImportResult | null>(null)
const result = ref<ImportResult | null>(null)
const busy = ref(false)
const failure = ref<string | null>(null)
const onlyProblems = ref(false)

const carrierLabel = computed(() => {
  const id = chosenCarrier.value
  return props.carriers?.find((c: FileCarrierOption) => c.id === id)?.name || props.carrierName || ''
})
const selectable = computed(() => Array.isArray(props.carriers))

watch(() => props.open, (open: boolean) => {
  if (!open) return
  step.value = 'choose'
  file.value = null
  preview.value = null
  result.value = null
  failure.value = null
  onlyProblems.value = false
  chosenCarrier.value = props.carrierId ?? (props.carriers?.length === 1 ? props.carriers[0]!.id : null)
  if (fileInput.value) fileInput.value.value = ''
}, { immediate: true })

const close = () => {
  if (!busy.value) emit('update:open', false)
}

const chooseFile = (event: Event) => {
  file.value = (event.target as HTMLInputElement).files?.[0] || null
  failure.value = null
}

const warehouse = computed(() =>
  props.warehouseId === null || props.warehouseId === undefined || props.warehouseId === '' ? null : Number(props.warehouseId))

const send = async (dryRun: boolean): Promise<ImportResult | null> => {
  if (!file.value || !chosenCarrier.value) return null
  busy.value = true
  failure.value = null
  const data = await importCarrierFile(
    { file: file.value, carrier_id: chosenCarrier.value, dry_run: dryRun, warehouse_id: warehouse.value },
    (error: HttpRequestError) => {
      failure.value = bizErrorMessage(error)
    },
  )
  busy.value = false
  return data
}

const runPreview = async () => {
  const data = await send(true)
  if (!data) return
  preview.value = data
  step.value = 'preview'
}

const apply = async () => {
  if (!preview.value?.summary.matched) return
  const data = await send(false)
  if (!data) return
  result.value = data
  step.value = 'done'
  showToast(t('shipping.file.import-done-toast', { count: data.summary.matched }), 'success')
  emit('imported', data)
}

const back = () => {
  step.value = 'choose'
  preview.value = null
  failure.value = null
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const shown = computed<ImportResult | null>(() => (step.value === 'done' ? result.value : preview.value))
const visibleRows = computed<ImportRow[]>(() => (shown.value?.rows || [])
  .filter((r: ImportRow) => !onlyProblems.value || (r.result !== 'matched' && r.result !== 'same_number')))
const isHighlighted = (r: ImportRow) =>
  props.highlightDnId !== null && props.highlightDnId !== undefined && String(r.dn_id) === String(props.highlightDnId)
const resultText = (r: string) => t(`shipping.file.results.${r}`)
const rowMessage = (r: ImportRow) => importRowMessage(r, t, te)
</script>

<template>
  <Teleport to="body">
    <div class="modal fade" :class="{ show: open }" :style="{ display: open ? 'block' : 'none' }" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">
              {{ t('shipping.file.import-title') }}<template v-if="carrierLabel"> · {{ carrierLabel }}</template>
            </h6>
            <button type="button" class="btn-close" :disabled="busy" @click="close"></button>
          </div>
          <div class="modal-body">
            <!-- 1. 选文件 -->
            <template v-if="step === 'choose'">
              <p class="fs-13 text-muted mb-3">{{ t('shipping.file.import-intro', { carrier: carrierLabel || t('customs.carrier.carrier-fallback') }) }}</p>
              <div class="row g-3">
                <div class="col-md-5" v-if="selectable">
                  <label class="form-label" for="carrier-import-carrier">{{ t('common.entities.carrier') }} <abbr title="required" class="text-danger">*</abbr></label>
                  <select class="form-select" id="carrier-import-carrier" v-model.number="chosenCarrier" :disabled="busy">
                    <option :value="null" disabled>{{ t('shipping.file.choose-carrier') }}</option>
                    <option v-for="c in carriers || []" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                  <div class="form-text" v-if="!(carriers || []).length">{{ t('shipping.file.no-file-carriers') }}</div>
                </div>
                <div :class="selectable ? 'col-md-7' : 'col-12'">
                  <label class="form-label" for="carrier-import-file">{{ t('shipping.file.file') }} <abbr title="required" class="text-danger">*</abbr></label>
                  <input type="file" ref="fileInput" class="form-control" id="carrier-import-file" accept=".csv,.txt,text/csv,text/plain"
                    :disabled="busy" @change="chooseFile">
                  <div class="form-text">{{ t('shipping.file.file-hint') }}</div>
                </div>
              </div>
            </template>

            <!-- 2. 预览 / 3. 结果 -->
            <template v-else-if="shown">
              <div class="alert alert-success-transparent fs-13 py-2" v-if="step === 'done'">
                <i class="ri-checkbox-circle-line me-1"></i>{{ t('shipping.file.import-done', { count: shown.summary.matched }) }}
                <span class="text-muted ms-1" v-if="shown.batch_id">{{ t('shipping.file.batch', { id: shown.batch_id }) }}</span>
              </div>
              <p class="fs-13 mb-2" v-else>
                {{ t('shipping.file.preview-intro', { file: file?.name || '' }) }}
              </p>

              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span class="badge" :class="`bg-${importResultColor(r)}-transparent`" v-for="r in IMPORT_RESULTS" :key="r">
                  {{ resultText(r) }} {{ shown.summary[r] }}
                </span>
                <label class="form-check form-check-inline fs-12 ms-auto mb-0">
                  <input class="form-check-input" type="checkbox" v-model="onlyProblems">
                  <span class="form-check-label">{{ t('shipping.file.only-problems') }}</span>
                </label>
              </div>
              <p class="fs-12 text-warning mb-2" v-if="shown.summary.already_has_number">
                <i class="ri-error-warning-line me-1"></i>{{ t('shipping.file.already-has-number-hint') }}
              </p>

              <div class="table-responsive import-rows">
                <table class="table table-sm table-bordered mb-0 fs-12">
                  <thead>
                    <tr>
                      <th scope="col" class="text-end">{{ t('shipping.file.fields.line') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.reference') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.dn') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.order-number') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.tracking-numbers') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.result') }}</th>
                      <th scope="col">{{ t('shipping.file.fields.message') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in visibleRows" :key="`ir-${i}`" :class="{ 'fw-semibold': isHighlighted(r) }">
                      <td class="text-end text-muted">{{ r.line ?? '—' }}</td>
                      <td class="font-monospace">{{ r.reference || '—' }}</td>
                      <td class="text-nowrap">
                        <NuxtLink :to="`/dn/detail/${r.dn_id}`" target="_blank" v-if="r.dn_id && r.result !== 'not_found'">DN-{{ r.dn_id }}</NuxtLink>
                        <span v-else>—</span>
                      </td>
                      <td>{{ r.order_number || '—' }}</td>
                      <td class="font-monospace text-wrap">{{ r.tracking_numbers.join(', ') || '—' }}</td>
                      <td class="text-nowrap"><span class="badge" :class="`bg-${importResultColor(r.result)}-transparent`">{{ resultText(r.result) }}</span></td>
                      <td class="text-wrap text-muted" :title="r.message || ''">{{ rowMessage(r) }}</td>
                    </tr>
                  </tbody>
                </table>
                <div class="text-center text-muted fs-12 p-3 border border-top-0" v-if="!visibleRows.length">{{ t('common.status.nothing-show') }}</div>
              </div>
            </template>

            <div class="alert alert-danger-transparent fs-13 mt-3 mb-0" v-if="failure">{{ failure }}</div>
          </div>
          <div class="modal-footer">
            <template v-if="step === 'choose'">
              <button type="button" class="btn btn-light" :disabled="busy" @click="close">{{ t('button.cancel') }}</button>
              <button type="button" class="btn btn-primary" :disabled="busy || !file || !chosenCarrier" @click="runPreview">
                <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>{{ t('shipping.file.preview') }}
              </button>
            </template>
            <template v-else-if="step === 'preview'">
              <button type="button" class="btn btn-light me-auto" :disabled="busy" @click="back">{{ t('shipping.file.choose-again') }}</button>
              <button type="button" class="btn btn-light" :disabled="busy" @click="close">{{ t('button.cancel') }}</button>
              <button type="button" class="btn btn-primary" :disabled="busy || !preview?.summary.matched" @click="apply">
                <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
                {{ t('shipping.file.apply', { count: preview?.summary.matched ?? 0 }) }}
              </button>
            </template>
            <button type="button" class="btn btn-primary" v-else @click="close">{{ t('button.close') }}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="open" @click="close"></div>
  </Teleport>
</template>

<style scoped>
.import-rows {
  max-height: 50vh;
  overflow-y: auto;
}
</style>
