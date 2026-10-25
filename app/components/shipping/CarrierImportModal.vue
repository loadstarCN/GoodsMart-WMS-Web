<script lang="ts" setup>
/**
 * 导回运单号（运单方式 = 文件：在承运商软件里打完单，把它导出的带运单号的 CSV 导回 WMS）。
 * 发货流程的运单一步（单张 DN）和发货单列表（批量）共用。
 *
 * 1. 选承运商（列表页；流程里固定为这张 DN 的承运商）和文件
 * 2. 预览：POST /dn/carrier-files/import dry_run = true → 逐行结果（matched 会写入 / not_found 没找到发货单 /
 *    already_has_number 已有别的运单号（不改，要换号请到发货单上处理）/ same_number 已导入过（忽略）/ invalid 格式不对）
 * 3. 确认：同一个文件以 dry_run = false 提交，只写 matched 的行 → 显示结果，emit imported（父组件刷新）
 * 文件不对 / 承运商不是文件方式：400 16138，在弹窗里显示。
 * highlightDnId：流程里打开时，这张 DN 的行加粗（文件里可能还有别的 DN，也一起导入）。
 */
import type { HttpRequestError } from '~/utils/http'
import type { WSelectOption } from '~/components/w/WSelect.vue'
import {
  IMPORT_RESULTS,
  importCarrierFile,
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
const carrierOptions = computed<WSelectOption<number>[]>(() => (props.carriers || []).map((c) => ({ value: c.id, label: c.name })))

const visible = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value && !busy.value) emit('update:open', false)
  },
})

watch(() => props.open, (open: boolean) => {
  if (!open) return
  step.value = 'choose'
  file.value = null
  preview.value = null
  result.value = null
  failure.value = null
  onlyProblems.value = false
  chosenCarrier.value = props.carrierId ?? (props.carriers?.length === 1 ? props.carriers[0]!.id : null)
}, { immediate: true })
watch(file, () => {
  failure.value = null
})

const close = () => {
  if (!busy.value) emit('update:open', false)
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
}

const shown = computed<ImportResult | null>(() => (step.value === 'done' ? result.value : preview.value))
const visibleRows = computed<ImportRow[]>(() => (shown.value?.rows || [])
  .filter((r: ImportRow) => !onlyProblems.value || (r.result !== 'matched' && r.result !== 'same_number')))
const isHighlighted = (r: ImportRow) =>
  props.highlightDnId !== null && props.highlightDnId !== undefined && String(r.dn_id) === String(props.highlightDnId)
const resultText = (r: string) => t(`shipping.file.results.${r}`)
const RESULT_TONES: Record<string, 'ok' | 'warn' | 'bad' | 'none'> = {
  matched: 'ok', same_number: 'none', already_has_number: 'warn', not_found: 'bad', invalid: 'bad',
}
const resultTone = (r: string) => RESULT_TONES[r] || 'none'
const rowMessage = (r: ImportRow) => importRowMessage(r, t, te)
</script>

<template>
  <WModal v-model:open="visible" :title="carrierLabel ? `${t('shipping.file.import-title')} · ${carrierLabel}` : t('shipping.file.import-title')"
    size="xl" :closable="!busy">
    <div class="w-cimp">
      <!-- 1. 选文件 -->
      <WFormGrid v-if="step === 'choose'">
        <WField v-if="selectable" :label="t('common.entities.carrier')" :span="5"
          :hint="!(carriers || []).length ? t('shipping.file.no-file-carriers') : undefined">
          <WSelect v-model="chosenCarrier" :options="carrierOptions" :placeholder="t('shipping.file.choose-carrier')" :disabled="busy" />
        </WField>
        <WField :label="t('shipping.file.file')" :span="selectable ? 7 : 12"
          :help="t('shipping.file.import-intro', { carrier: carrierLabel || t('customs.carrier.carrier-fallback') })">
          <WFilePicker v-model="file" accept=".csv,.txt,text/csv,text/plain" :hint="t('shipping.file.file-hint')" :disabled="busy" />
        </WField>
      </WFormGrid>

      <!-- 2. 预览 / 3. 结果 -->
      <template v-else-if="shown">
        <WAlert v-if="step === 'done'" tone="ok">
          {{ t('shipping.file.import-done', { count: shown.summary.matched }) }}
          <span v-if="shown.batch_id" class="w-faint">· {{ t('shipping.file.batch', { id: shown.batch_id }) }}</span>
        </WAlert>
        <div class="w-cimp__summary">
          <span v-if="step !== 'done'" class="w-cimp__file">{{ file?.name }}</span>
          <WStatus v-for="r in IMPORT_RESULTS" :key="r" :tone="resultTone(r)" muted>{{ resultText(r) }} {{ shown.summary[r] }}</WStatus>
          <WCheckbox v-model="onlyProblems" class="w-cimp__only" :label="t('shipping.file.only-problems')" />
        </div>
        <WAlert v-if="shown.summary.already_has_number" tone="warn">{{ t('shipping.file.already-has-number-hint') }}</WAlert>
        <div class="w-cimp__table">
          <table class="w-cimp__grid">
            <thead>
              <tr>
                <th scope="col" class="is-right">{{ t('shipping.file.fields.line') }}</th>
                <th scope="col">{{ t('shipping.file.fields.reference') }}</th>
                <th scope="col">{{ t('shipping.file.fields.dn') }}</th>
                <th scope="col">{{ t('shipping.file.fields.order-number') }}</th>
                <th scope="col">{{ t('shipping.file.fields.tracking-numbers') }}</th>
                <th scope="col">{{ t('shipping.file.fields.result') }}</th>
                <th scope="col">{{ t('shipping.file.fields.message') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in visibleRows" :key="`ir-${i}`" :class="{ 'is-highlight': isHighlighted(r) }">
                <td class="is-right w-faint">{{ r.line ?? '' }}</td>
                <td class="is-mono">{{ r.reference || '' }}</td>
                <td class="is-nowrap">
                  <NuxtLink v-if="r.dn_id && r.result !== 'not_found'" :to="`/dn/detail/${r.dn_id}`" target="_blank"
                    class="w-cimp__link">DN-{{ r.dn_id }}</NuxtLink>
                </td>
                <td>{{ r.order_number || '' }}</td>
                <td class="is-mono">{{ r.tracking_numbers.join(', ') }}</td>
                <td class="is-nowrap"><WStatus :tone="resultTone(r.result)" muted>{{ resultText(r.result) }}</WStatus></td>
                <td class="w-muted" :title="r.message || ''">{{ rowMessage(r) }}</td>
              </tr>
              <tr v-if="!visibleRows.length">
                <td colspan="7" class="w-cimp__empty">{{ t('w.table.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <WAlert v-if="failure" tone="block" :title="failure" />
    </div>
    <template #footer>
      <template v-if="step === 'choose'">
        <WButton :disabled="busy" @click="close">{{ t('button.cancel') }}</WButton>
        <WButton variant="primary" :loading="busy" :disabled="!file || !chosenCarrier" @click="runPreview">{{ t('shipping.file.preview') }}</WButton>
      </template>
      <template v-else-if="step === 'preview'">
        <WButton variant="text" class="w-cimp__back" :disabled="busy" @click="back">{{ t('shipping.file.choose-again') }}</WButton>
        <WButton :disabled="busy" @click="close">{{ t('button.cancel') }}</WButton>
        <WButton variant="primary" :loading="busy" :disabled="!preview?.summary.matched" @click="apply">
          {{ t('shipping.file.apply', { count: preview?.summary.matched ?? 0 }) }}
        </WButton>
      </template>
      <WButton v-else variant="primary" @click="close">{{ t('button.close') }}</WButton>
    </template>
  </WModal>
</template>

<style scoped>
.w-cimp {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-12);
  color: var(--w-text-1);
}
.w-cimp__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  font-size: var(--w-fs-13);
}
.w-cimp__file { font-weight: var(--w-fw-semibold); }
.w-cimp__only { margin-left: auto; font-size: var(--w-fs-13); }
.w-cimp__table {
  max-height: 50vh;
  overflow: auto;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
}
.w-cimp__grid {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-cimp__grid th {
  position: sticky;
  top: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--w-border);
  background: var(--w-raised);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  text-align: left;
  white-space: nowrap;
}
.w-cimp__grid td {
  padding: 8px 12px;
  border-top: 1px solid var(--w-line);
  vertical-align: top;
}
.w-cimp__grid tbody tr:first-child td { border-top: 0; }
.w-cimp__grid tr.is-highlight td { background: var(--w-sel-soft); font-weight: var(--w-fw-semibold); }
.w-cimp__grid .is-right { text-align: right; }
.w-cimp__grid .is-nowrap { white-space: nowrap; }
.w-cimp__grid .is-mono { font-family: var(--w-font-mono); font-size: var(--w-fs-12); overflow-wrap: anywhere; }
.w-cimp__link { color: var(--w-link); text-decoration: none; font-weight: var(--w-fw-medium); }
.w-cimp__empty { padding: 24px; text-align: center; color: var(--w-text-3); }
.w-cimp__back { margin-right: auto; }
</style>
