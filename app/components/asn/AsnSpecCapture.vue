<script setup lang="ts">
import { COUNTRY_NAMES_EN, countryName } from '~/data/countries'

const props = defineProps<{ asn: any; line: any; disabled?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const { t, locale } = useI18n()
const staff = useStaffStore()
const { bizErrorMessage } = useBizError()
const open = ref(false), busy = ref(false), error = ref('')
const values = ref<Record<string, string | number | null>>({})
const numericFields = ['weight', 'length', 'width', 'height']
const canCapture = computed(() => !!staff.refreshed && !!staff.staffInfo && staff.hasPermission('goods_edit', 'sorting_edit', 'packing_edit')
  && ['received', 'completed'].includes(props.asn?.status))
const countries = computed(() => [{ value: '', label: '—' }, ...Object.keys(COUNTRY_NAMES_EN).map(value => ({ value, label: countryName(value, locale.value) }))])
const begin = () => { values.value = {}; error.value = ''; open.value = true }
const save = async () => {
  if (busy.value || !canCapture.value) return
  const body: Record<string, unknown> = { spec_source: 'receiving' }
  for (const field of numericFields) {
    const value = values.value[field]
    if (value !== '' && value != null) body[field] = Number(value)
  }
  if (values.value.origin_country) body.origin_country = values.value.origin_country
  if (String(values.value.note || '').trim()) body.note = String(values.value.note).trim()
  busy.value = true; error.value = ''
  await httpRequest(`/api/warehouse/asn/${props.asn.id}/details/${props.line.id}/spec`, {
    method: 'PUT', headers: warehouseHeaders(props.asn.warehouse_id), body,
    onSuccess: () => { open.value = false; showToast(t('action-results.success'), 'success'); emit('saved') },
    onError: failure => { error.value = bizErrorMessage(failure) },
    onFinally: () => { busy.value = false },
  })
}
</script>

<template>
  <div class="w-spec-capture">
    <span v-if="line.spec_pending?.length" class="pending">{{line.spec_pending.map((field: string) => t('sorting.spec-pending.fields.' + field.replaceAll('_', '-'))).join(' · ')}}</span>
    <span v-if="line.spec_capture_note" class="note">{{t('receiving-spec.skip')}}: {{line.spec_capture_note}}</span>
    <WButton v-if="canCapture" size="sm" variant="text" :disabled="disabled" @click="begin">{{t('receiving-spec.title')}}</WButton>
    <WModal v-model:open="open" :title="t('receiving-spec.title')" :closable="!busy">
      <form class="spec-form" @submit.prevent="save">
        <strong>{{line.goods?.code}} · {{line.goods?.name}}</strong>
        <p>{{t('receiving-spec.help')}}</p>
        <WAlert v-if="asn.spec_capture?.mode === 'remeasure'" tone="warn" :title="t('receiving-spec.remeasure')" />
        <WAlert v-if="error" tone="block" :title="error" />
        <div class="spec-fields">
          <WField v-for="field in numericFields" :key="field" :label="t('goods.fields.' + field) + (field === 'weight' ? ' (kg)' : ' (mm)')" optional>
            <WInput v-model="values[field]" type="number" :min="field === 'weight' ? 0.001 : 1" :step="field === 'weight' ? 0.001 : 1" :disabled="busy" :placeholder="line.goods?.[field] != null ? String(line.goods[field]) : '—'" />
          </WField>
          <WField :label="t('sorting.spec-pending.fields.origin-country')" optional><WSelect v-model="values.origin_country" :options="countries" :disabled="busy" /></WField>
          <WField :label="t('receiving-spec.skip')" optional><WInput v-model="values.note" :maxlength="255" :disabled="busy" /></WField>
        </div>
        <div class="spec-actions"><WButton :disabled="busy" @click="open=false">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="busy">{{t('button.save')}}</WButton></div>
      </form>
    </WModal>
  </div>
</template>

<style scoped>
.w-spec-capture{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:4px}.pending{font-size:12px;color:var(--w-warn-text,#92500B)}.note{font-size:12px;color:var(--w-text-3);overflow-wrap:anywhere}.spec-form{display:flex;flex-direction:column;gap:16px}.spec-form p{margin:0;color:var(--w-text-2);font-size:13px;line-height:20px}.spec-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.spec-actions{display:flex;justify-content:flex-end;gap:8px}@media(max-width:600px){.spec-fields{grid-template-columns:minmax(0,1fr)}}
</style>
