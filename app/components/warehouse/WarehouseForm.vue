<script setup lang="ts">
import { preserveAddressPatch } from '~/utils/addressPatch'
import { currenciesOptions } from '~/data/selectOptions'
import { hasNonLatin } from '~/composables/customs/customsDocuments'

const props = defineProps<{ warehouseId?: string }>()
const { t } = useI18n()
const staff = useStaffStore(), router = useRouter(), { bizErrorMessage } = useBizError()
const editing = computed(() => !!props.warehouseId)
const canEdit = computed(() => staff.hasPermission('warehouse_edit'))
const title = computed(() => t(editing.value ? 'warehouse.operations.edit' : 'warehouse.ui.create'))
const record = ref<Record<string, any>>({ name: '', phone: '', country_code: 'JP', timezone: null,
  default_currency: staff.staffInfo?.company?.default_currency || 'JPY', manager_id: null,
  address: '', address_en: '', contact_name_en: '', is_active: true,
  default_spec_capture_fields: [], default_spec_capture_mode: 'missing', spec_capture_enforcement: 'warn' })
const fields = ['name', 'phone', 'country_code', 'timezone', 'default_currency', 'manager_id', 'address',
  'address_en', 'contact_name_en', 'is_active', 'zip_code', 'admin_area', 'locality', 'address_line1',
  'address_line2', 'latin', 'default_spec_capture_fields', 'default_spec_capture_mode', 'spec_capture_enforcement']
const loading = ref(false), busy = ref(false), error = ref(''), errors = ref<Record<string, string>>({})
const defaultZone = ref<string | null>(null)
let original = '', generation = 0
const payload = () => Object.fromEntries(fields.map(key => [key, record.value[key]]))
const dirty = computed(() => JSON.stringify(payload()) !== original)
useHead({ title })
const load = async () => {
  const seq = ++generation
  if (!props.warehouseId) { original = JSON.stringify(payload()); return }
  loading.value = true
  const data = await httpRequest<any>('/api/warehouse/warehouse/' + props.warehouseId, {
    onError: err => { if (seq === generation) error.value = bizErrorMessage(err) },
  })
  if (seq !== generation) return
  if (data) {
    defaultZone.value = data.timezone_configured ? null : data.timezone
    record.value = { ...data, timezone: data.timezone_configured ?? null }
    original = JSON.stringify(payload())
  }
  loading.value = false
}
onMounted(load)
watch(() => props.warehouseId, load)
onBeforeUnmount(() => generation++)
const searchStaff = async (user_name: string) => {
  const data = await httpRequest<PaginationData>('/api/warehouse/staff/', { params: { user_name, per_page: 30 } })
  return (data?.items || []).map(row => ({ value: row.id, label: row.user_name || row.name }))
}
const zoneOptions = computed(() => {
  const zones = supportedTimeZones()
  if (record.value.timezone && !zones.includes(record.value.timezone)) zones.unshift(record.value.timezone)
  return [{ value: '__default__', label: defaultZone.value ? t('timezone.default-with', { zone: timeZoneDescription(defaultZone.value) }) : t('timezone.default') },
    ...zones.map(value => ({ value, label: timeZoneDescription(value) }))]
})
const zone = computed({ get: () => record.value.timezone || '__default__', set: value => { record.value.timezone = value === '__default__' ? null : value } })
const save = async () => {
  if (busy.value || !canEdit.value) return
  errors.value = {}; error.value = ''
  if (!String(record.value.name || '').trim()) errors.value.name = t('common.validation.name-required', { entity: t('warehouse.entity') })
  if (Object.keys(errors.value).length) return
  busy.value = true
  try {
    if (!staff.staffInfo) await staff.getCurrentStaffInfo()
    const previous = original ? JSON.parse(original) : {}
    const body = editing.value ? Object.fromEntries(Object.entries(payload()).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])))
      : { ...payload(), company_id: staff.staffInfo?.company_id }
    if (!Object.keys(body).length) return
    let success = false
    await httpRequest('/api/warehouse/warehouse/' + (props.warehouseId || ''), {
      method: editing.value ? 'PUT' : 'POST', body: preserveAddressPatch(body, record.value),
      onSuccess: () => { success = true }, onError: err => { error.value = bizErrorMessage(err) },
    })
    if (success) {
      original = JSON.stringify(payload())
      await staff.refreshStaffInfo()
      showToast(t('action-results.success'), 'success')
      await router.push('/warehouse')
    }
  } finally { busy.value = false }
}
</script>
<template>
  <div class="w-warehouse-form w-scope">
    <header><nav><NuxtLink class="w-warehouse-link" to="/warehouse">{{ t('nav.warehouse') }}</NuxtLink><span>/</span><span>{{ title }}</span></nav><h1>{{ title }}</h1></header>
    <WAlert v-if="error" tone="block" :title="error" />
    <WEmptyState v-if="loading" :title="t('common.status.loading')" />
    <WCard v-else-if="!editing || record.id" flush><form @submit.prevent="save">
      <WFormSection :title="t('warehouse.ui.basic')"><WFormGrid>
        <WField :label="t('warehouse.fields.name')" :error="errors.name"><WInput v-model="record.name" :disabled="busy || !canEdit" maxlength="255" /></WField>
        <WField :label="t('common.fields.phone')" optional :span="4"><WInput v-model="record.phone" type="tel" :disabled="busy || !canEdit" /></WField>
        <WField :label="t('common.users.manager')" optional :span="4"><WCombobox v-model="record.manager_id" :search="searchStaff" :selected-label="record.manager?.user_name" clearable :disabled="busy || !canEdit" /></WField>
        <WField :label="t('warehouse.ui.currency')" :span="4"><WSelect v-model="record.default_currency" :options="currenciesOptions.map(value => ({ value, label: value }))" :disabled="busy || !canEdit" /></WField>
      </WFormGrid></WFormSection>
      <WFormSection :title="t('common.fields.address')"><StructuredAddressFields v-model="record" id-prefix="warehouse" country-key="country_code" legacy-latin-key="address_en" :latin-keys="['address_line1','address_line2','locality','admin_area']" :editable="!busy && canEdit" /></WFormSection>
      <WFormSection :title="t('warehouse.fields.timezone')"><WFormGrid><WField :label="t('warehouse.fields.timezone')" :hint="t('warehouse.tips.timezone')" :span="6"><WCombobox v-model="zone" :options="zoneOptions" :placeholder="t('timezone.search')" :disabled="busy || !canEdit" /></WField></WFormGrid></WFormSection>
      <WFormSection :title="t('warehouse.ui.pickup-contact')"><WFormGrid><WField :label="t('warehouse.fields.contact-name-en')" optional :span="6" :hint="hasNonLatin(record.contact_name_en) ? t('common.tips.non-latin') : t('warehouse.tips.export')"><WInput v-model="record.contact_name_en" maxlength="100" :disabled="busy || !canEdit" /></WField></WFormGrid></WFormSection>
      <WFormSection :title="t('warehouse.ui.capture')"><WFormGrid>
        <WField :label="t('warehouse.ui.capture-fields')"><div class="w-warehouse-checks"><WCheckbox v-for="field in ['weight','dimensions','origin_country']" :key="field" v-model="record.default_spec_capture_fields" :value="field" :label="t('warehouse.ui.' + field)" :disabled="busy || !canEdit" /></div></WField>
        <WField :label="t('warehouse.ui.capture-mode')" :span="6"><WSelect v-model="record.default_spec_capture_mode" :options="['missing','remeasure'].map(value=>({value,label:t('warehouse.ui.'+value)}))" :disabled="busy || !canEdit" /></WField>
        <WField :label="t('warehouse.ui.capture-enforcement')" :span="6"><WSelect v-model="record.spec_capture_enforcement" :options="['warn','block'].map(value=>({value,label:t('warehouse.ui.'+value)}))" :disabled="busy || !canEdit" /></WField>
      </WFormGrid></WFormSection>
      <footer><span v-if="dirty">{{ t('recipient.ui.unsaved') }}</span><WButton to="/warehouse" :disabled="busy">{{ t('button.cancel') }}</WButton><WButton v-if="canEdit" type="submit" variant="primary" :disabled="!dirty" :loading="busy">{{ t('button.save') }}</WButton></footer>
    </form></WCard>
  </div>
</template>
<style scoped>
.w-warehouse-form { display:flex; flex-direction:column; gap:16px; }
.w-warehouse-form header { display:flex; flex-direction:column; gap:8px; }
.w-warehouse-form nav { display:flex; gap:8px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-warehouse-link { color:var(--w-text-3); }
.w-warehouse-form h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-warehouse-form :deep(.w-form-grid) { gap:12px 16px; }
.w-warehouse-form :deep(.w-field__optional) { font-size:13px; }
.w-warehouse-checks { display:flex; flex-wrap:wrap; gap:12px 24px; min-height:36px; align-items:center; }
.w-warehouse-form footer { display:flex; gap:8px; padding:16px 24px; border-top:1px solid var(--w-border); justify-content:flex-end; align-items:center; }
.w-warehouse-form footer>span { flex:1; font-size:13px; color:var(--w-text-2); }
</style>
