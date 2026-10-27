<script setup lang="ts">
import type { WComboboxOption } from '~/components/w/WCombobox.vue'
import { asnTypesOptions } from '~/data/selectOptions'
import { mergeDocumentItems, invalidItemQuantity, type DocumentItem } from '~/utils/documentItems'

const props = defineProps<{ asnId?: string }>()
const { t } = useI18n()
const router = useRouter()
const staff = useStaffStore()
const warehouses = useWarehouseStore()
const { bizErrorMessage } = useBizError()
const editing = computed(() => !!props.asnId)
const title = computed(() => t(editing.value ? 'asn.operations.edit' : 'asn.operations.add'))
useHead({ title })
const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const adding = ref(false)
const bulkOpen = ref(false)
const goodsCode = ref('')
const errors = ref<Record<string, string>>({})
const record = ref<Record<string, any>>({ warehouse_id: null, supplier_id: null, carrier_id: null,
  asn_type: 'inbound', expected_arrival_date: null, tracking_number: '', remark: '' })
const details = ref<DocumentItem[]>([])
const supplierLabel = ref('')
const carrierLabel = ref('')
const canEdit = computed(() => staff.hasPermission('asn_edit') && (!editing.value || record.value.status === 'pending'))
const warehouseOptions = computed(() => {
  const list = [...warehouses.warehouses]
  if (record.value.warehouse && !list.some(w => w.id === record.value.warehouse.id)) list.push(record.value.warehouse)
  return list.map(w => ({ value: w.id, label: w.name }))
})
const columns = computed(() => [
  { key: 'goods', label: t('common.entities.goods'), wrap: true },
  { key: 'quantity', label: t('common.fields.quantity'), width: '120px' },
  { key: 'weight', label: `${t('goods.fields.weight')} (kg)`, width: '120px' },
  { key: 'volume', label: `${t('goods.fields.volume')} (m³)`, width: '120px' },
  { key: 'remark', label: t('common.fields.remark'), width: '180px' },
  { key: 'actions', label: t('common.fields.action'), width: '60px' },
])
const total = computed(() => details.value.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0))
const search = async (kind: 'supplier' | 'carrier', name: string): Promise<WComboboxOption<number>[]> => {
  const data = await httpRequest<PaginationData>(`/api/warehouse/${kind}/`, {
    params: { name: name || undefined, per_page: 30 }, headers: warehouseHeaders(record.value.warehouse_id),
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  return (data?.items || []).map((row: any) => ({ value: row.id, label: row.name, description: row.address || row.code }))
}
const searchSuppliers = (name: string) => search('supplier', name)
const searchCarriers = (name: string) => search('carrier', name)
const load = async () => {
  loading.value = true; loadError.value = ''
  await staff.getCurrentStaffInfo()
  await warehouses.fetchWarehouses()
  if (editing.value) {
    const data = await httpRequest<any>(`/api/warehouse/asn/${props.asnId}`, { onError: error => { loadError.value = bizErrorMessage(error) } })
    if (data) {
      record.value = data
      details.value = (data.details || []).map((row: DocumentItem) => ({ ...row }))
      supplierLabel.value = data.supplier?.name || ''
      carrierLabel.value = data.carrier?.name || ''
    }
  } else record.value.warehouse_id = warehouses.currentWarehouse?.id ?? (warehouseOptions.value.length === 1 ? warehouseOptions.value[0]?.value : null)
  loading.value = false
}
onMounted(load)
const changeWarehouse = async (id: number | null | undefined) => {
  if (editing.value || id === record.value.warehouse_id) return
  if (details.value.length && !await wConfirm({ title: t('dn.form-ui.change-warehouse'), message: t('dn.form-ui.clear-items'), confirmText: t('button.confirm'), cancelText: t('button.cancel') })) return
  record.value.warehouse_id = id ?? null; details.value = []; goodsCode.value = ''
}
const addGoods = async () => {
  const code = goodsCode.value.trim()
  const wid = record.value.warehouse_id
  if (!code || !wid || adding.value) return
  adding.value = true
  const data = await httpRequest<any>('/api/warehouse/asn/items/preview', {
    method: 'POST', headers: warehouseHeaders(wid), body: { text: '"' + code.replace(/"/g, '""') + '",1' },
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  adding.value = false
  if (!data || wid !== record.value.warehouse_id) return
  const invalid = data.items.find((row: any) => row.error)
  if (invalid) { showToast(t(`items-import.errors.${invalid.error}`), 'error'); return }
  const merged = mergeDocumentItems(details.value, data.items, 'add')
  if (merged.length > 500 || merged.some(invalidItemQuantity)) { showToast(t('items-import.limit'), 'error'); return }
  details.value = merged; goodsCode.value = ''; errors.value.details = ''
}
const invalidMeasure = (value: unknown) => value != null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)
const save = async () => {
  if (submitting.value || adding.value || !canEdit.value) return
  errors.value = {}
  if (!record.value.warehouse_id) errors.value.warehouse = t('common.validation.warehouse-required')
  if (!record.value.supplier_id) errors.value.supplier = t('common.validation.supplier-required')
  if (!record.value.asn_type) errors.value.type = t('common.validation.type-required')
  if (!details.value.length || details.value.length > 500 || details.value.some(invalidItemQuantity)) errors.value.details = t('items-import.limit')
  if (details.value.some(row => invalidMeasure(row.weight) || invalidMeasure(row.volume))) errors.value.details = t('asn.form-ui.invalid-measure')
  if (Object.keys(errors.value).length) return
  submitting.value = true
  let saved = false
  try {
    const body: Record<string, any> = {}
    for (const key of ['warehouse_id', 'supplier_id', 'carrier_id', 'asn_type', 'expected_arrival_date', 'tracking_number', 'remark']) body[key] = record.value[key]
    body.details = details.value.map(({ id, goods_id, quantity, weight, volume, remark }) => ({ ...(id ? { id } : {}),
      goods_id, quantity: Number(quantity), weight: toNullableNumber(weight), volume: toNullableNumber(volume), remark }))
    await httpRequest<any>(editing.value ? `/api/warehouse/asn/${props.asnId}` : '/api/warehouse/asn/', {
      method: editing.value ? 'PUT' : 'POST', headers: warehouseHeaders(record.value.warehouse_id), body,
      onSuccess: data => { saved = true; showToast(t('action-results.success'), 'success'); router.push(data?.id ? `/asn/detail/${data.id}` : '/asn') },
      onError: error => showToast(bizErrorMessage(error), 'error'),
    })
  } finally { if (!saved) submitting.value = false }
}
</script>

<template>
  <div class="asn-form w-scope">
    <div class="asn-form__heading">
    <nav :aria-label="t('nav.ASN')"><NuxtLink class="w-breadcrumb-link" to="/asn">{{ t('nav.ASN') }}</NuxtLink> / {{ title }}</nav>
    <h1>{{ title }} <small v-if="editing">ASN-{{ asnId }}</small></h1>
    </div>
    <WAlert v-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="load">{{ t('dn.list.retry') }}</WButton></template></WAlert>
    <WCard v-else-if="loading"><span role="status">{{ t('common.status.loading') }}</span></WCard>
    <WAlert v-else-if="!canEdit" tone="warn" :title="t('asn.form-ui.readonly')" />
    <form v-else class="asn-form__card" @submit.prevent="save">
      <WFormSection :title="t('asn.form-ui.supplier-type')">
        <WFormGrid>
          <WField :label="t('common.entities.supplier')" :error="errors.supplier"><WCombobox v-model="record.supplier_id" :search="searchSuppliers" :selected-label="supplierLabel" two-line :disabled="submitting" @select="option => supplierLabel = option?.label || ''" /></WField>
          <WField :label="t('asn.fields.type')" :error="errors.type">
            <div class="asn-form__types"><label v-for="type in asnTypesOptions" :key="type" :class="{ selected: record.asn_type === type }"><input v-model="record.asn_type" type="radio" name="asn-type" :value="type" :disabled="submitting">{{ t(`asn.type.${type}`) }}</label></div>
          </WField>
        </WFormGrid>
      </WFormSection>
      <WFormSection :title="t('asn.form-ui.warehouse-arrival')">
        <WFormGrid>
          <WField :label="t('common.entities.warehouse')" :span="4" :error="errors.warehouse"><WSelect :model-value="record.warehouse_id" :options="warehouseOptions" :placeholder="t('common.validation.warehouse-required')" :disabled="editing || submitting" @update:model-value="changeWarehouse" /></WField>
          <WField :label="t('asn.fields.expected-arrival-date')" :span="4" optional><WDatePicker v-model="record.expected_arrival_date" :disabled="submitting" weekday /></WField>
        </WFormGrid>
      </WFormSection>
      <WFormSection :title="t('asn.fields.items')">
        <div class="asn-form__tools"><WInput v-model="goodsCode" :disabled="!record.warehouse_id || submitting" :placeholder="t('common.placeholders.goods-code')" :aria-label="t('common.placeholders.goods-code')" @keydown.enter.prevent="addGoods" /><WButton :loading="adding" :disabled="!record.warehouse_id || submitting" @click="addGoods">{{ t('common.operations.add-item') }}</WButton><WButton :disabled="!record.warehouse_id || submitting" @click="bulkOpen = true">{{ t('items-import.title') }}</WButton></div>
        <WAlert v-if="errors.details" tone="block" :title="errors.details" />
        <WTable :rows="details" :columns="columns" row-key="goods_id">
          <template #cell-goods="{ row }"><NuxtLink class="w-record-link" :to="`/goods/detail/${row.goods_id}`" target="_blank">{{ row.goods?.name }}</NuxtLink><div class="w-muted">{{ row.goods?.code }}</div></template>
          <template #cell-quantity="{ row }"><WInput v-model.number="row.quantity" type="number" min="1" step="1" :invalid="invalidItemQuantity(row)" :disabled="submitting" :aria-label="`${row.goods?.code} ${t('common.fields.quantity')}`" /></template>
          <template #cell-weight="{ row }"><WInput v-model="row.weight" type="number" min="0" step="any" :invalid="invalidMeasure(row.weight)" :disabled="submitting" :aria-label="`${row.goods?.code} ${t('goods.fields.weight')}`" /></template>
          <template #cell-volume="{ row }"><WInput v-model="row.volume" type="number" min="0" step="any" :invalid="invalidMeasure(row.volume)" :disabled="submitting" :aria-label="`${row.goods?.code} ${t('goods.fields.volume')}`" /></template>
          <template #cell-remark="{ row }"><WInput v-model="row.remark" :disabled="submitting" :aria-label="`${row.goods?.code} ${t('common.fields.remark')}`" /></template>
          <template #cell-actions="{ row }"><WButton variant="text" size="sm" :disabled="submitting" @click="details = details.filter(item => item !== row)">{{ t('button.delete') }}</WButton></template>
        </WTable>
        <p class="asn-form__totals">{{ t('asn.flow.summary.lines', { lines: details.length, quantity: total }) }}</p>
      </WFormSection>
      <WFormSection :title="t('asn.fields.tracking-info')"><WFormGrid>
        <WField :label="t('common.entities.carrier')" :span="6" optional><WCombobox v-model="record.carrier_id" :search="searchCarriers" :selected-label="carrierLabel" clearable :disabled="submitting" @select="option => carrierLabel = option?.label || ''" /></WField>
        <WField :label="t('common.placeholders.tracking-number')" :span="6" optional><WInput v-model="record.tracking_number" :disabled="submitting" /></WField>
      </WFormGrid></WFormSection>
      <WFormSection :title="t('common.fields.remark')"><WField :label="t('common.fields.remark')" optional><WTextarea v-model="record.remark" :disabled="submitting" /></WField></WFormSection>
      <footer class="asn-form__footer"><WButton to="/asn" :disabled="submitting">{{ t('button.cancel') }}</WButton><WButton type="submit" variant="primary" :loading="submitting" :disabled="adding">{{ title }}</WButton></footer>
    </form>
    <DocumentItemsImport v-model:open="bulkOpen" kind="asn" :warehouse-id="record.warehouse_id" :existing="details" @apply="items => { details = items; errors.details = '' }" />
  </div>
</template>

<style scoped>
.asn-form { display: flex; flex-direction: column; gap: 24px; }
.asn-form__heading { display: flex; flex-direction: column; gap: 8px; }
.asn-form nav { display: flex; align-items: center; gap: 8px; line-height: 20px; }
.asn-form .w-breadcrumb-link { color: var(--w-text-3); }
.asn-form nav, .asn-form small { font-size: 13px; color: var(--w-text-2); }
.asn-form h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; }
.asn-form__card { background: var(--w-surface); border: 1px solid var(--w-border); border-radius: var(--w-radius-card); overflow: hidden; }
.asn-form__tools, .asn-form__types { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.asn-form__tools > :first-child { flex: 1; min-width: 160px; }
.asn-form__types label { flex: 1; min-width: 140px; display: flex; gap: 10px; align-items: center; border: 1px solid var(--w-border); border-radius: 6px; height: 40px; box-sizing: border-box; padding: 0 12px; font-size: 14px; line-height: 20px; cursor: pointer; }
.asn-form__types label.selected { border-color: var(--w-pri); background: var(--w-sel-soft); }
.asn-form__types { margin-bottom: 0; }
.asn-form__types label.selected { font-weight: 500; }
.asn-form__types input { accent-color: var(--w-pri); width: 14px; height: 14px; margin: 0; flex: none; }
.asn-form__totals { text-align: right; color: var(--w-text-2); margin-top: 12px; }
.asn-form__footer { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--w-border); padding: 16px 24px; }
.asn-form .w-record-link { color: var(--w-text-1); font-size: 13px; line-height: 20px; font-weight: 500; }
.asn-form__totals { font-size: 13px; line-height: 20px; margin-bottom: 0; }
</style>
