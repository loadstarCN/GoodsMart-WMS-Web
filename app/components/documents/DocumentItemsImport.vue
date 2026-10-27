<script setup lang="ts">
import { authFetch } from '~/composables/auth/authFetch'
import { mergeDocumentItems, invalidItemQuantity, type DocumentItem, type ItemPreview } from '~/utils/documentItems'

const props = withDefaults(defineProps<{
  kind: 'dn' | 'asn'
  warehouseId: number | null
  existing: DocumentItem[]
  reserved?: Record<string, number>
}>(), { reserved: () => ({}) })
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ apply: [items: DocumentItem[]] }>()
const { t, locale } = useI18n()
const { bizErrorMessage } = useBizError()
const inputMode = ref<'paste' | 'file'>('paste')
const text = ref('')
const file = ref<File | null>(null)
const header = ref(false)
const sheet = ref<string | null>(null)
const sheets = ref<string[]>([])
const mergeMode = ref<'add' | 'keep'>('add')
const rows = ref<ItemPreview[]>([])
const busy = ref(false)
const error = ref('')
let generation = 0
const invalidate = () => { generation++; rows.value = []; error.value = ''; busy.value = false }
watch([text, header, sheet, () => props.warehouseId], invalidate)
watch(file, () => { sheet.value = null; sheets.value = []; invalidate() })
watch(inputMode, (mode) => { header.value = mode === 'file'; invalidate() })
watch(open, () => { invalidate() })
const goodRows = computed(() => rows.value.filter((row) => !row.error && row.goods))
const merged = computed(() => mergeDocumentItems(props.existing, rows.value, mergeMode.value, props.reserved))
const canApply = computed(() => !busy.value && goodRows.value.length > 0 && merged.value.length <= 500 && !merged.value.some(invalidItemQuantity))
const columns = computed(() => [
  { key: 'lines', label: t('items-import.line'), format: (v: number[]) => v.join(', ') },
  { key: 'goods', label: t('common.entities.goods'), wrap: true },
  ...(props.kind === 'dn' ? [{ key: 'available', label: t('items-import.available'), align: 'right' as const }] : []),
  { key: 'quantity', label: t('common.fields.quantity'), align: 'right' as const },
  { key: 'remark', label: t('common.fields.remark'), wrap: true },
  { key: 'result', label: t('items-import.result'), wrap: true },
])
const quantityAfter = (row: ItemPreview) => merged.value.find((item) => item.goods_id === row.goods?.goods_id)?.quantity
const available = (row: ItemPreview) => typeof row.goods?.available_stock_for_sale === 'number'
  ? Math.max(0, row.goods.available_stock_for_sale + (props.reserved[String(row.goods.goods_id)] || 0)) : null
const over = (row: ItemPreview) => available(row) !== null && Number(quantityAfter(row)) > available(row)!
const result = (row: ItemPreview) => {
  if (row.error) return t(`items-import.errors.${row.error}`)
  if (over(row)) return t('items-import.low-stock')
  const existing = props.existing.some((item) => item.goods_id === row.goods?.goods_id)
  return t(existing ? `items-import.${mergeMode.value === 'keep' ? 'kept' : 'merged'}` : 'items-import.new')
}
const preview = async () => {
  if (!props.warehouseId || busy.value) return
  const seq = ++generation
  busy.value = true
  rows.value = []
  error.value = ''
  let body: Record<string, any> | FormData = { text: text.value, has_header: header.value }
  if (inputMode.value === 'file') {
    if (!file.value) { busy.value = false; return }
    body = new FormData()
    body.append('file', file.value)
    body.append('has_header', String(header.value))
    if (sheet.value) body.append('sheet', sheet.value)
  }
  await httpRequest<any>(`/api/warehouse/${props.kind}/items/preview`, {
    method: 'POST', headers: warehouseHeaders(props.warehouseId), body,
    onSuccess: (data) => {
      if (seq !== generation) return
      rows.value = data.items
      sheets.value = data.sheets || []
    },
    onError: (err) => {
      if (seq !== generation) return
      const reason = err.details?.reason
      error.value = reason ? t(`items-import.errors.${reason}`) : bizErrorMessage(err)
    },
    onFinally: () => { if (seq === generation) busy.value = false },
  })
}
const download = async (format: 'csv' | 'xlsx') => {
  try {
    const response = await authFetch(`/api/warehouse/${props.kind}/items/template?format=${format}&lang=${locale.value}`)
    if (!response.ok) throw new Error(String(response.status))
    const url = URL.createObjectURL(await response.blob())
    const a = document.createElement('a')
    a.href = url; a.download = `items-template.${format}`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { error.value = t('items-import.download-error') }
}
const apply = () => { if (canApply.value) { emit('apply', merged.value); open.value = false } }
</script>

<template>
  <WModal v-model:open="open" :title="t('items-import.title')" size="xl">
    <WTabs v-model="inputMode" :label="t('items-import.source')" :items="[
      { key: 'paste', label: t('items-import.paste') }, { key: 'file', label: t('items-import.file') }]" />
    <p class="w-muted">{{ t('items-import.help') }}</p>
    <WTextarea v-if="inputMode === 'paste'" v-model="text" :rows="6" :aria-label="t('items-import.paste')" :placeholder="t('items-import.placeholder')" />
    <WFilePicker v-else v-model="file" accept=".csv,.xlsx" :max-size="10 * 1024 * 1024" :hint="t('items-import.file-hint')"
      @reject="error = t('items-import.file-hint')" />
    <WSelect v-if="sheets.length > 1" v-model="sheet" :options="sheets.map(value => ({ value, label: value }))" :placeholder="t('items-import.first-sheet')" :aria-label="t('items-import.sheet')" />
    <div class="items-import__tools">
      <WCheckbox v-model="header">{{ t('items-import.header') }}</WCheckbox>
      <WButton variant="text" size="sm" @click="download('csv')">{{ t('items-import.csv-template') }}</WButton>
      <WButton variant="text" size="sm" @click="download('xlsx')">{{ t('items-import.xlsx-template') }}</WButton>
      <WButton :loading="busy" :disabled="!warehouseId || (inputMode === 'paste' ? !text.trim() : !file)" @click="preview">{{ t('items-import.preview') }}</WButton>
    </div>
    <WAlert v-if="error" tone="block" :title="error" />
    <WTable v-if="rows.length" :rows="rows" :columns="columns" :row-key="row => row.lines.join(',')" max-height="360px">
      <template #cell-goods="{ row }"><b>{{ row.goods?.name || row.code }}</b><div class="w-muted">{{ row.goods ? row.code : '' }}</div></template>
      <template #cell-available="{ row }">{{ available(row) ?? '—' }}</template>
      <template #cell-result="{ row }"><span :class="{ 'items-import__error': row.error || over(row) }">{{ result(row) }}</span></template>
    </WTable>
    <WField v-if="rows.length" :label="t('items-import.existing')">
      <WSelect v-model="mergeMode" :options="[{ value: 'add', label: t('items-import.add') }, { value: 'keep', label: t('items-import.keep') }]" />
    </WField>
    <WAlert v-if="rows.length && (merged.length > 500 || merged.some(invalidItemQuantity))" tone="block" :title="t('items-import.limit')" />
    <template #footer>
      <span class="items-import__summary">{{ t('items-import.summary', { valid: goodRows.length, errors: rows.length - goodRows.length }) }}</span>
      <WButton @click="open = false">{{ t('button.cancel') }}</WButton>
      <WButton variant="primary" :disabled="!canApply" @click="apply">{{ t('items-import.apply') }}</WButton>
    </template>
  </WModal>
</template>

<style scoped>
.items-import__tools { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.items-import__error { color: var(--w-warn-text); }
.items-import__summary { margin-right: auto; font-size: 13px; color: var(--w-text-2); }
</style>
