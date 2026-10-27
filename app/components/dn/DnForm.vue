<script setup lang="ts">
import type { WComboboxOption } from '~/components/w/WCombobox.vue'
import type { ServiceOption } from '~/composables/shipping/carrierFile'
import { dnTypesOptions, dnTransportationModesOptions } from '~/data/selectOptions'
import { addressFieldLabel, cleanShipTo, formatAddressOneLine, hasStructuredAddress, shipToFromRecipient } from '~/composables/address/structuredAddress'
import { loadCarrierServiceOptions, optionKeyOfError, optionsChange, optionsPayload, optionsToForm } from '~/composables/dn/shippingOptionsForm'
import { useShippingAddressLine } from '~/composables/dn/shippingAddressLine'
import { mergeDocumentItems, invalidItemQuantity, itemExceedsStock, type DocumentItem } from '~/utils/documentItems'

const props = defineProps<{ dnId?: string }>()
const { t, te } = useI18n()
const router = useRouter()
const warehouseStore = useWarehouseStore()
const staffStore = useStaffStore()
const { bizErrorMessage } = useBizError()
const editing = computed(() => !!props.dnId)
const title = computed(() => editing.value ? t('dn.operations.edit') : t('dn.list.new'))
useHead({ title })
const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const addressLoading = ref(false)
const optionsLoading = ref(false)
const errors = ref<Record<string, string>>({})
const optionErrors = ref<Record<string, string>>({})
const dn = ref<Record<string, any>>({ warehouse_id: null, recipient_id: null, carrier_id: null, dn_type: 'shipping',
  transportation_mode: 'express', order_number: '', shipping_address: '', expected_shipping_date: null,
  packaging_info: '', special_handling: '', remark: '' })
const details = ref<DocumentItem[]>([])
const originalQty = ref<Record<string, number>>({})
const originalShipTo = ref<Record<string, any> | null>(null)
const effectiveShipTo = ref<Record<string, any> | null>(null)
const originalOptions = ref<Record<string, any> | null>(null)
const recipientLabel = ref('')
const carrierLabel = ref('')
const shipTo = ref<Record<string, any>>({})
const addressOpen = ref(false)
const shippingAddress = computed<string | null>({ get: () => dn.value.shipping_address || null, set: value => { dn.value.shipping_address = value } })
const addressLine = useShippingAddressLine(shipTo, shippingAddress)
const schema = ref<ServiceOption[]>([])
const optionForm = ref<Record<string, string>>({})
const bulkOpen = ref(false)
const goodsCode = ref('')
const adding = ref(false)
const canEdit = computed(() => staffStore.hasPermission('dn_edit') && (!editing.value || dn.value.status === 'pending'))
const warehouseOptions = computed(() => {
  const list = [...warehouseStore.warehouses]
  if (dn.value.warehouse && !list.some(w => w.id === dn.value.warehouse.id)) list.push(dn.value.warehouse)
  return list.map(w => ({ value: w.id, label: w.name }))
})
const typeOptions = computed(() => dnTypesOptions.map(value => ({ value, label: t(`dn.type.${value}`) })))
const transportOptions = computed(() => dnTransportationModesOptions.map(value => ({ value, label: t(`dn.transportation.${value}`) })))
const overCount = computed(() => details.value.filter(itemExceedsStock).length)
const total = computed(() => details.value.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0))
const columns = computed(() => [
  { key: 'goods', label: t('common.entities.goods'), wrap: true },
  { key: 'max_qty', label: t('items-import.available'), type: 'qty' as const, keepZero: true, width: '90px' },
  { key: 'quantity', label: t('common.fields.quantity'), width: '150px' },
  { key: 'remark', label: t('common.fields.remark'), width: '220px' },
  { key: 'actions', label: t('common.fields.action'), width: '60px' },
])
const search = async (kind: 'recipient' | 'carrier', name: string): Promise<WComboboxOption<number>[]> => {
  const data = await httpRequest<PaginationData>(`/api/warehouse/${kind}/`, {
    params: { name: name || undefined, per_page: 30 }, headers: warehouseHeaders(dn.value.warehouse_id),
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  return (data?.items || []).map((item: any) => ({ value: item.id, label: item.name, description: kind === 'recipient' ? item.address : item.code }))
}
const searchRecipients = (name: string) => search('recipient', name)
const searchCarriers = (name: string) => search('carrier', name)
let addressGeneration = 0
const selectRecipient = async (option: WComboboxOption<number> | null) => {
  const generation = ++addressGeneration
  recipientLabel.value = option?.label || ''
  errors.value.recipient = ''
  if (!option) { addressLoading.value = false; return }
  addressLoading.value = true
  const data = await httpRequest<any>(`/api/warehouse/recipient/${option.value}`, {
    headers: warehouseHeaders(dn.value.warehouse_id), onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  if (generation !== addressGeneration) return
  addressLoading.value = false
  if (!data) return
  const address = shipToFromRecipient(data)
  shipTo.value = address
  effectiveShipTo.value = null
  shippingAddress.value = hasStructuredAddress(address) ? formatAddressOneLine(address, 'local') : data.address || null
  addressLine.reset()
  errors.value.shipping_address = ''
}
let optionGeneration = 0
const loadOptions = async (initial = false) => {
  const generation = ++optionGeneration
  optionsLoading.value = true
  const next = await loadCarrierServiceOptions(dn.value.carrier_id)
  if (generation !== optionGeneration) return
  schema.value = next
  optionForm.value = optionsToForm(next, initial ? originalOptions.value : null, initial ? {} : optionForm.value)
  optionErrors.value = {}
  optionsLoading.value = false
}
const selectCarrier = (option: WComboboxOption<number> | null) => { carrierLabel.value = option?.label || ''; loadOptions() }
const changeWarehouse = async (id: number | null | undefined) => {
  if (editing.value || id === dn.value.warehouse_id) return
  if (details.value.length && !await wConfirm({ title: t('dn.form-ui.change-warehouse'), message: t('dn.form-ui.clear-items'), confirmText: t('button.confirm'), cancelText: t('button.cancel') })) return
  dn.value.warehouse_id = id ?? null
  details.value = []
  goodsCode.value = ''
  errors.value.warehouse = ''
}
const refreshAvailability = async () => {
  if (!details.value.length) return true
  const data = await httpRequest<any>('/api/warehouse/inventory/availability', {
    method: 'POST', headers: warehouseHeaders(dn.value.warehouse_id), body: { goods_codes: details.value.map(item => item.goods?.code) },
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  if (!data) return false
  details.value = details.value.map(item => {
    const stock = data.items.find((row: any) => row.goods_id === item.goods_id)
    return { ...item, max_qty: stock ? Math.max(0, stock.available_stock_for_sale + (originalQty.value[String(item.goods_id)] || 0)) : 0 }
  })
  return true
}
const load = async () => {
  loading.value = true; loadError.value = ''
  await staffStore.getCurrentStaffInfo()
  await warehouseStore.fetchWarehouses()
  if (editing.value) {
    const data = await httpRequest<any>(`/api/warehouse/dn/${props.dnId}`, { onError: error => { loadError.value = bizErrorMessage(error) } })
    if (!data) { loading.value = false; return }
    dn.value = data
    details.value = (data.details || []).map((item: DocumentItem) => ({ ...item }))
    originalQty.value = details.value.reduce<Record<string, number>>((totals, item) => {
      totals[String(item.goods_id)] = (totals[String(item.goods_id)] || 0) + Number(item.quantity)
      return totals
    }, {})
    originalShipTo.value = cleanShipTo(data.ship_to)
    effectiveShipTo.value = data.ship_to_effective || null
    shipTo.value = { ...(originalShipTo.value || {}) }
    originalOptions.value = data.shipping_options || null
    recipientLabel.value = data.recipient?.name || ''
    carrierLabel.value = data.carrier?.name || ''
    addressLine.reset()
    await Promise.all([loadOptions(true), refreshAvailability()])
  } else {
    dn.value.warehouse_id = warehouseStore.currentWarehouse?.id ?? (warehouseOptions.value.length === 1 ? warehouseOptions.value[0]?.value : null)
  }
  loading.value = false
}
onMounted(load)
const useEffectiveAddress = () => { shipTo.value = { ...(cleanShipTo(effectiveShipTo.value) || {}) }; addressOpen.value = true }
const addGoods = async () => {
  const code = goodsCode.value.trim()
  if (!code || !dn.value.warehouse_id || adding.value) return
  const warehouseId = dn.value.warehouse_id
  adding.value = true
  const data = await httpRequest<any>('/api/warehouse/dn/items/preview', {
    method: 'POST', headers: warehouseHeaders(warehouseId), body: { text: '"' + code.replace(/"/g, '""') + '",1', has_header: false },
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  adding.value = false
  if (!data || warehouseId !== dn.value.warehouse_id) return
  const invalid = data.items.find((row: any) => row.error)
  if (invalid) { showToast(t(`items-import.errors.${invalid.error}`), 'error'); return }
  const merged = mergeDocumentItems(details.value, data.items, 'add', originalQty.value)
  if (merged.length > 500 || merged.some(invalidItemQuantity)) { showToast(t('items-import.limit'), 'error'); return }
  details.value = merged; goodsCode.value = ''; errors.value.details = ''
}
const save = async () => {
  if (submitting.value || loading.value || !canEdit.value || addressLoading.value || optionsLoading.value) return
  errors.value = {}
  if (!dn.value.warehouse_id) errors.value.warehouse = t('common.validation.warehouse-required')
  if (!dn.value.recipient_id) errors.value.recipient = t('common.validation.recipient-required')
  if (!dn.value.expected_shipping_date) errors.value.date = t('common.validation.expected-shipping-date-required')
  if (!dn.value.dn_type) errors.value.type = t('common.validation.type-required')
  if (!String(shippingAddress.value || '').trim() && !hasStructuredAddress(shipTo.value)) errors.value.shipping_address = t('dn.ship-to.required')
  if (!details.value.length || details.value.length > 500 || details.value.some(invalidItemQuantity)) errors.value.details = t('items-import.limit')
  const options = editing.value ? optionsChange(schema.value, optionForm.value, originalOptions.value) : optionsPayload(schema.value, optionForm.value)
  optionErrors.value = Object.fromEntries(options.invalid.map(key => [key, t('shipping.options.invalid-money')]))
  if (Object.keys(errors.value).length || options.invalid.length) return
  submitting.value = true
  let saved = false
  try {
    if (!await refreshAvailability()) return
    if (overCount.value) { errors.value.details = t('dn.form-ui.over-stock', { count: overCount.value }); return }
    const body: Record<string, any> = {}
    for (const key of ['warehouse_id', 'recipient_id', 'carrier_id', 'dn_type', 'transportation_mode', 'order_number', 'expected_shipping_date', 'packaging_info', 'special_handling', 'remark']) body[key] = dn.value[key]
    body.shipping_address = String(shippingAddress.value || '').trim() || null
    body.details = details.value.map(({ id, goods_id, quantity, remark }) => ({ ...(id ? { id } : {}), goods_id, quantity: Number(quantity), remark }))
    if (hasStructuredAddress(shipTo.value)) body.ship_to = cleanShipTo(shipTo.value)
    else if (originalShipTo.value) body.ship_to = null
    if (!editing.value ? !!options.options : ('changed' in options && options.changed)) body.shipping_options = options.options
    await httpRequest<any>(editing.value ? `/api/warehouse/dn/${props.dnId}` : '/api/warehouse/dn/', {
      method: editing.value ? 'PUT' : 'POST', headers: warehouseHeaders(dn.value.warehouse_id), body,
      onSuccess: data => { saved = true; showToast(t('action-results.success'), 'success'); router.push(data?.id ? `/dn/detail/${data.id}` : '/dn') },
      onError: error => {
        const key = error.code === 16139 ? optionKeyOfError(error.field) : null
        if (key) optionErrors.value[key] = error.message
        if (String(error.field || '').startsWith('ship_to')) {
          addressOpen.value = true
          errors.value.shipping_address = t('dn.ship-to.invalid-field', { field: addressFieldLabel(error.field, shipTo.value.country, t, te), message: error.message })
        }
        showToast(bizErrorMessage(error), 'error')
      },
    })
  } finally { if (!saved) submitting.value = false }
}
</script>

<template>
  <div class="dn-form w-scope">
    <div class="dn-form__heading">
    <nav :aria-label="t('dn.detail.breadcrumb')"><NuxtLink class="w-breadcrumb-link" to="/dn">{{ t('nav.DN') }}</NuxtLink><span aria-hidden="true"> / </span>{{ title }}</nav>
    <h1>{{ title }}<span v-if="editing" class="dn-form__number">DN-{{ dnId }}</span></h1>
    </div>
    <WAlert v-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="load">{{ t('dn.list.retry') }}</WButton></template></WAlert>
    <WCard v-else-if="loading"><span role="status">{{ t('common.status.loading') }}</span></WCard>
    <WAlert v-else-if="!canEdit" tone="warn" :title="t('dn.form-ui.readonly')" />
    <form v-else class="dn-form__card" @submit.prevent="save">
      <WFormSection :title="t('common.entities.recipient')">
        <WFormGrid>
          <WField :label="t('common.entities.recipient')" :span="12" :error="errors.recipient">
            <WCombobox v-model="dn.recipient_id" :search="searchRecipients" :selected-label="recipientLabel" two-line :disabled="submitting" :placeholder="t('common.search-placeholder')" @select="selectRecipient" />
          </WField>
          <WField :label="t('dn.fields.shipping-address')" :error="errors.shipping_address">
            <WTextarea :model-value="shippingAddress" :rows="2" :disabled="addressLoading || submitting" @update:model-value="value => addressLine.onInput(value || '')" />
            <WButton v-if="addressLine.differs.value" variant="text" size="sm" @click="addressLine.useFormatted">{{ t('dn.form-ui.use-formatted') }}</WButton>
          </WField>
          <WButton v-if="!originalShipTo && !hasStructuredAddress(shipTo) && hasStructuredAddress(effectiveShipTo)" variant="text" @click="useEffectiveAddress">{{ t('dn.form-ui.use-recipient') }}</WButton>
          <WSwitch v-model="addressOpen" :label="t('dn.form-ui.address-fields')" :disabled="submitting" />
        </WFormGrid>
        <DnShipToFields class="dn-form__address" v-if="addressOpen" v-model="shipTo" :editable="!submitting && !addressLoading" />
      </WFormSection>
      <WFormSection :title="t('dn.form-ui.warehouse-date')">
        <WFormGrid>
          <WField :label="t('common.entities.warehouse')" :span="4" :error="errors.warehouse">
            <WSelect :model-value="dn.warehouse_id" :options="warehouseOptions" :disabled="editing || submitting" :placeholder="t('common.validation.warehouse-required')" @update:model-value="changeWarehouse" />
          </WField>
          <WField :label="t('dn.fields.scheduled-date')" :span="4" :error="errors.date"><WDatePicker v-model="dn.expected_shipping_date" :disabled="submitting" weekday /></WField>
          <WField :label="t('dn.fields.type')" :span="4" :error="errors.type"><WSelect v-model="dn.dn_type" :options="typeOptions" :disabled="submitting" /></WField>
          <WField :label="t('dn.fields.order-no')" :span="4" optional><WInput v-model="dn.order_number" :disabled="submitting" /></WField>
        </WFormGrid>
      </WFormSection>
      <WFormSection :title="t('dn.fields.items')">
        <div class="dn-form__tools">
          <WInput v-model="goodsCode" :disabled="!dn.warehouse_id || submitting" :placeholder="t('common.placeholders.goods-code')" :aria-label="t('common.placeholders.goods-code')" @keydown.enter.prevent="addGoods" />
          <WButton :loading="adding" :disabled="!dn.warehouse_id || submitting" @click="addGoods">{{ t('common.operations.add-item') }}</WButton>
          <WButton :disabled="!dn.warehouse_id || submitting" @click="bulkOpen = true">{{ t('items-import.title') }}</WButton>
        </div>
        <WAlert v-if="errors.details" tone="block" :title="errors.details" />
        <WTable :rows="details" :columns="columns" row-key="goods_id">
          <template #cell-goods="{ row }"><NuxtLink class="w-record-link" :to="`/goods/detail/${row.goods_id}`" target="_blank">{{ row.goods?.name }}</NuxtLink><div class="w-muted">{{ row.goods?.code }}</div></template>
          <template #cell-quantity="{ row }"><WInput v-model.number="row.quantity" type="number" min="1" step="1" :disabled="submitting" :invalid="invalidItemQuantity(row) || itemExceedsStock(row)" :aria-label="`${row.goods?.code} ${t('common.fields.quantity')}`" /><span v-if="itemExceedsStock(row)" class="dn-form__warning">{{ t('common.validation.quantity-exceeds-available', { max: row.max_qty }) }}</span></template>
          <template #cell-remark="{ row }"><WInput v-model="row.remark" :disabled="submitting" :aria-label="`${row.goods?.code} ${t('common.fields.remark')}`" /></template>
          <template #cell-actions="{ row }"><WButton variant="text" size="sm" :disabled="submitting" @click="details = details.filter(item => item !== row)">{{ t('button.delete') }}</WButton></template>
        </WTable>
        <p class="dn-form__totals">{{ t('dn.list.goods', { kinds: details.length, qty: total }) }}</p>
      </WFormSection>
      <WFormSection :title="t('dn.form-ui.shipping')">
        <WFormGrid>



          <WField :label="t('common.entities.carrier')" :span="8" optional><WCombobox v-model="dn.carrier_id" :search="searchCarriers" :selected-label="carrierLabel" clearable :disabled="submitting" @select="selectCarrier" /></WField>
          <WField :label="t('dn.fields.transportation-mode')" :span="4" optional><WSelect v-model="dn.transportation_mode" :options="transportOptions" :disabled="submitting" /></WField>
        </WFormGrid>
        <ShippingOptionsFields v-if="schema.length" v-model="optionForm" :schema="schema" :errors="optionErrors" :disabled="submitting" id-prefix="dn-form-options" />
        <WFormGrid class="dn-form__notes">
          <WField :label="t('dn.fields.packing-info')" :span="6" optional><WTextarea v-model="dn.packaging_info" :disabled="submitting" /></WField>
          <WField :label="t('dn.fields.special-handling')" :span="6" optional><WTextarea v-model="dn.special_handling" :disabled="submitting" /></WField>
          <WField :label="t('common.fields.remark')" optional><WTextarea v-model="dn.remark" :disabled="submitting" /></WField>
        </WFormGrid>
      </WFormSection>
      <footer class="dn-form__footer">
        <span v-if="overCount" class="dn-form__warning">{{ t('dn.form-ui.over-stock', { count: overCount }) }}</span>
        <WButton to="/dn" :disabled="submitting">{{ t('button.cancel') }}</WButton>
        <WButton type="submit" variant="primary" :loading="submitting" :disabled="adding || addressLoading || optionsLoading">{{ title }}</WButton>
      </footer>
    </form>
    <DocumentItemsImport v-model:open="bulkOpen" kind="dn" :warehouse-id="dn.warehouse_id" :existing="details" :reserved="originalQty" @apply="items => { details = items; errors.details = '' }" />
  </div>
</template>

<style scoped>
.dn-form { display: flex; flex-direction: column; gap: 24px; }
.dn-form__heading { display: flex; flex-direction: column; gap: 8px; }
.dn-form nav { display: flex; align-items: center; gap: 8px; line-height: 20px; }
.dn-form .w-breadcrumb-link { color: var(--w-text-3); }
.dn-form nav { font-size: 13px; color: var(--w-text-2); }
.dn-form h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; }
.dn-form__number { margin-left: 12px; font-size: 14px; color: var(--w-text-2); }
.dn-form__card { border: 1px solid var(--w-border); border-radius: var(--w-radius-card); background: var(--w-surface); overflow: hidden; }
.dn-form__tools { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.dn-form__tools > :first-child { flex: 1; min-width: 160px; }
.dn-form__warning { color: var(--w-warn-text); font-size: 12px; white-space: normal; }
.dn-form__totals { text-align: left; margin-top: 12px; color: var(--w-text-2); }
.dn-form__footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid var(--w-border); }
.dn-form__footer > span { margin-right: auto; }
.dn-form .w-record-link { color: var(--w-text-1); font-size: 13px; line-height: 20px; font-weight: 500; }
.dn-form__totals { font-size: 13px; line-height: 20px; margin-bottom: 0; }
.dn-form__address { margin-top: 16px; padding: 16px; border: 1px solid var(--w-border); border-radius: 10px; }
.dn-form__notes { margin-top: 16px; }
.dn-form :deep(.w-table-wrap) { border: 1px solid var(--w-border); border-radius: 10px; }
</style>
