<script setup lang="ts">
import { bulkPutawayRecords, type PendingSourceRow, type PutawaySelection } from '~/composables/inventory/bulkPutaway'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ rows: PutawaySelection[] }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const { locationTypeLabel } = useOptionLabel()
const staff = useStaffStore()

const locationId = ref<number | null>(null)
const warehouseId = computed(() => props.rows[0]?.warehouse_id)
const goodsCount = computed(() => new Set(props.rows.map(row => row.goods_id)).size)
const quantity = computed(() => props.rows.reduce((sum, row) => sum + row.sorted_stock, 0))
const damaged = computed(() => props.rows.some(row => (row.sorted_damage_stock ?? 0) > 0))
const busy = ref(false)
const uncertain = ref(false)
const error = ref('')
const searchError = ref('')
let searchGeneration = 0

const valid = computed(() => locationId.value && warehouseId.value && props.rows.length > 0
  && props.rows.every(row => row.warehouse_id === warehouseId.value && row.sorted_stock > 0)
  && staff.hasPermission('putaway_edit') && !uncertain.value)

watch(open, () => {
  searchGeneration++
  locationId.value = null
  error.value = ''
  searchError.value = ''
  uncertain.value = false
})
useUnsavedForm(() => busy.value, () => busy.value)

type Location = { id: number; code: string; location_type: string }
const searchLocations = async (code: string) => {
  const id = warehouseId.value
  if (!id) return []
  const seq = ++searchGeneration
  searchError.value = ''
  const params = { warehouse_id: id, location_type: damaged.value ? 'damaged' : undefined, per_page: 50 }
  const headers = warehouseHeaders(id)
  const onError = (e: HttpRequestError) => {
    if (open.value && seq === searchGeneration) searchError.value = bizErrorMessage(e)
  }
  let locations: Location[]
  if (staff.hasPermission('location_read')) {
    const data = await httpRequest<PaginationData<Location>>('/api/warehouse/location/', {
      params: { ...params, code, is_active: true }, headers, onError,
    })
    locations = data?.items ?? []
  } else {
    // Both inventory pages can be used without access to the location management page.
    const data = await httpRequest<PaginationData<{ location: Location }>>('/api/warehouse/inventory/by-location', {
      params: { ...params, keyword: code, include_inactive: false }, headers, onError,
    })
    locations = data?.items.map(item => item.location) ?? []
  }
  return locations.map(location => ({
    value: location.id, label: location.code, description: locationTypeLabel(location.location_type),
  }))
}

const refresh = () => {
  open.value = false
  emit('saved')
}

const close = () => {
  if (busy.value) return
  if (uncertain.value) refresh()
  else open.value = false
}

const submit = async () => {
  const id = warehouseId.value
  const destination = locationId.value
  if (!valid.value || busy.value || !id || !destination) return
  busy.value = true
  error.value = ''
  try {
    const headers = warehouseHeaders(id)
    const records = await bulkPutawayRecords(props.rows, destination, async row => {
      const data = await httpRequest<{ items: PendingSourceRow[] }>(
        `/api/warehouse/inventory/goods/${row.goods_id}/warehouse/${id}/pending-lots`,
        { headers, onError: e => { error.value = bizErrorMessage(e) } },
      )
      return data?.items ?? null
    })
    if (!records?.length) {
      error.value ||= t('pending-bulk.stock-changed')
      return
    }
    if (records.length > 500) {
      error.value = t('pending-bulk.too-many-sources')
      return
    }
    const result = await httpRequest('/api/warehouse/putaway/bulk', {
      method: 'POST', headers, body: records,
      onError: e => {
        error.value = bizErrorMessage(e)
        uncertain.value = e.status <= 0 || e.status >= 500
      },
    })
    if (result) {
      showToast(t('action-results.success'), 'success')
      refresh()
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <WModal :open="open" :title="t('pending-bulk.title')" :closable="!busy" @close="close">
    <div class="bulk-putaway">
      <p>{{ t('pending-bulk.summary', { goods: goodsCount, quantity }) }}</p>
      <WField :label="t('putaway.target-location')" :hint="damaged ? t('putaway.damaged-hint') : undefined">
        <WCombobox v-model="locationId" :search="searchLocations" :disabled="busy || uncertain" two-line />
      </WField>
      <WAlert v-if="searchError" tone="block" :title="searchError" />
      <WAlert v-if="error" tone="block" :title="error">
        <template v-if="!uncertain" #actions><WButton :disabled="busy" @click="refresh">{{ t('pending-bulk.refresh') }}</WButton></template>
      </WAlert>
      <WAlert v-if="uncertain" tone="warn" :title="t('pending-bulk.uncertain')">
        <template #actions><WButton @click="refresh">{{ t('pending-bulk.refresh') }}</WButton></template>
      </WAlert>
    </div>
    <template #footer>
      <WButton :disabled="busy" @click="close">{{ t('button.cancel') }}</WButton>
      <WButton variant="primary" :loading="busy" :disabled="!valid" @click="submit">{{ t('pending-bulk.confirm') }}</WButton>
    </template>
  </WModal>
</template>

<style scoped>
.bulk-putaway { display: grid; gap: 16px; }
.bulk-putaway p { margin: 0; }
</style>
