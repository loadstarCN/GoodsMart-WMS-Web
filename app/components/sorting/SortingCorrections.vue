<script setup lang="ts">
import LabelLotPicker from '~/components/goods/LabelLotPicker.vue'
import SortingQuantityFields from './SortingQuantityFields.vue'
import {
  emptySortingQuantities, sameSortingQuantities, sortingQuantityFields, validSortingQuantities, type SortingQuantities,
} from '~/utils/sortingQuantities'

type AsnLine = { goods_id: number; goods?: { name?: string; code?: string } }
type LotRow = { goods_id: number; lot_id: number | null; lot_no: string | null; quantities: SortingQuantities }
type Decision = 'approved' | 'rejected'
type Correction = Omit<LotRow, 'quantities'> & {
  id: number
  before: SortingQuantities
  after: SortingQuantities
  reason: string
  status: 'pending' | Decision
  requested_by: number
  requester: string
  requested_at: string
  reviewer: string | null
  reviewed_at: string | null
  review_note: string | null
}
type Snapshot = { rows: LotRow[]; corrections: Correction[] }

const props = defineProps<{ taskId: number; warehouseId: number; lines: AsnLine[]; canRequest: boolean }>()
const emit = defineEmits<{ approved: [] }>()
const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const auth = useAuthStore()
const staff = useStaffStore()
const canReview = computed(() => staff.refreshed && !!staff.staffInfo && staff.hasPermission('adjustment_approve'))
const endpoint = computed(() => `/api/warehouse/sorting/${props.taskId}/quantity-corrections`)
const headers = computed(() => warehouseHeaders(props.warehouseId))
const snapshot = ref<Snapshot>()
const loadError = ref('')
const loading = ref(false)
const busy = ref(false)
const formError = ref('')
const requestOpen = ref(false)
const reviewOpen = ref(false)
const goodsId = ref<number>()
const lotChoice = ref<number | null>(null)
const otherLot = ref<InstanceType<typeof LabelLotPicker>['modelValue']>(null)
const quantities = ref<SortingQuantities<number | null>>({ ...emptySortingQuantities })
const reason = ref('')
const reviewTarget = ref<Correction>()
const decision = ref<Decision>('approved')
const reviewNote = ref('')

const goods = computed(() => new Map(props.lines.map(line => [line.goods_id, line.goods])))
function goodsLabel(id: number) {
  const item = goods.value.get(id)
  return [item?.name, item?.code].filter(Boolean).join(' · ') || '#' + id
}
const goodsOptions = computed(() => [...goods.value.keys()].map(value => ({ value, label: goodsLabel(value) })))
const goodsLots = computed(() => (snapshot.value?.rows || []).filter(row => row.goods_id === goodsId.value))
const lotOptions = computed(() => [
  ...goodsLots.value.map(row => ({ value: row.lot_id ?? 0, label: row.lot_no || t('lot-rules.unassigned') })),
  ...(!goodsLots.value.some(row => row.lot_id === null) ? [{ value: 0, label: t('lot-rules.unassigned') }] : []),
  { value: -1, label: t('sorting-quantity.other-lot') },
])
const selectedLot = computed(() => lotChoice.value === -1 ? otherLot.value?.id : lotChoice.value || null)
const current = computed(() => goodsLots.value.find(row => row.lot_id === selectedLot.value)?.quantities || emptySortingQuantities)
const canSubmit = computed(() => !!goodsId.value && lotChoice.value !== null && selectedLot.value !== undefined
  && validSortingQuantities(quantities.value) && !sameSortingQuantities(quantities.value, current.value) && !!reason.value.trim())

watch(goodsId, () => {
  lotChoice.value = goodsLots.value.length === 1 ? goodsLots.value[0]!.lot_id ?? 0
    : goodsLots.value.length ? null : 0
  otherLot.value = null
  quantities.value = { ...current.value }
})
watch(selectedLot, () => quantities.value = { ...current.value })

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    snapshot.value = await httpRequest<Snapshot>(endpoint.value, {
      headers: headers.value,
      onError: error => loadError.value = bizErrorMessage(error),
    }) || undefined
  } finally {
    loading.value = false
  }
}
onMounted(load)

function openRequest() {
  goodsId.value = undefined
  lotChoice.value = null
  otherLot.value = null
  quantities.value = { ...emptySortingQuantities }
  reason.value = ''
  formError.value = ''
  requestOpen.value = true
}

async function submit() {
  if (busy.value || !canSubmit.value || !props.canRequest) return
  busy.value = true
  formError.value = ''
  try {
    const result = await httpRequest<Correction>(endpoint.value, {
      method: 'POST',
      headers: headers.value,
      body: { goods_id: goodsId.value, lot_id: selectedLot.value, before: current.value,
        after: quantities.value, reason: reason.value.trim() },
      onError: error => formError.value = bizErrorMessage(error),
    })
    if (result) {
      requestOpen.value = false
      await load()
    }
  } finally {
    busy.value = false
  }
}

function openReview(row: Correction, action: Decision) {
  formError.value = ''
  reviewTarget.value = row
  decision.value = action
  reviewNote.value = ''
  reviewOpen.value = true
}
async function review() {
  if (!reviewTarget.value || busy.value || !canReview.value || (decision.value === 'rejected' && !reviewNote.value.trim())) return
  busy.value = true
  formError.value = ''
  try {
    const result = await httpRequest<Correction>(`${endpoint.value}/${reviewTarget.value.id}/review`, {
      method: 'POST',
      headers: headers.value,
      body: { decision: decision.value, note: reviewNote.value.trim() || null },
      onError: error => formError.value = bizErrorMessage(error),
    })
    if (result) {
      reviewOpen.value = false
      if (result.status === 'approved') emit('approved')
      else await load()
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <WCard>
    <div class="sorting-correction-head">
      <h3>{{ t('sorting-quantity.title') }}</h3>
      <WButton v-if="canRequest" size="sm" :disabled="!snapshot || loading || busy" @click="openRequest">
        {{ t('sorting-quantity.request') }}
      </WButton>
    </div>
    <WAlert v-if="loadError" tone="block" :title="loadError">
      <template #actions><WButton :disabled="loading" @click="load">{{ t('dn.list.retry') }}</WButton></template>
    </WAlert>
    <p v-else-if="loading || !snapshot?.corrections.length" class="sorting-correction-muted">
      {{ t(loading ? 'common.status.loading' : 'sorting-quantity.empty') }}
    </p>
    <ul v-else class="sorting-correction-list">
      <li v-for="row in snapshot.corrections" :key="row.id">
        <div class="sorting-correction-head">
          <strong>{{ goodsLabel(row.goods_id) }}</strong>
          <WStatus :tone="row.status === 'approved' ? 'ok' : row.status === 'pending' ? 'warn' : 'bad'">
            {{ t('sorting-quantity.' + row.status) }}
          </WStatus>
        </div>
        <div class="sorting-correction-muted">{{ row.lot_no || t('lot-rules.unassigned') }}</div>
        <div v-for="field in sortingQuantityFields" :key="field.key">
          {{ t(field.label) }} {{ row.before[field.key] }} → {{ row.after[field.key] }}
        </div>
        <p>{{ row.reason }}</p>
        <div class="sorting-correction-muted">{{ row.requester }} · {{ $dayjs(row.requested_at) }}</div>
        <div v-if="row.reviewed_at" class="sorting-correction-muted">{{ row.reviewer }} · {{ $dayjs(row.reviewed_at) }}</div>
        <p v-if="row.review_note">{{ row.review_note }}</p>
        <div v-if="row.status === 'pending' && canReview && String(row.requested_by) !== String(auth.userInfo?.id)"
          class="sorting-correction-actions">
          <WButton size="sm" :disabled="busy" @click="openReview(row, 'rejected')">{{ t('sorting-quantity.reject') }}</WButton>
          <WButton size="sm" variant="primary" :disabled="busy" @click="openReview(row, 'approved')">{{ t('sorting-quantity.approve') }}</WButton>
        </div>
      </li>
    </ul>
  </WCard>

  <WModal v-model:open="requestOpen" :title="t('sorting-quantity.request')" :closable="!busy" :close-on-backdrop="!busy">
    <form class="sorting-correction-form" @submit.prevent="submit">
      <WAlert v-if="formError" tone="block" :title="formError" />
      <WField :label="t('nav.goods')">
        <WSelect v-model="goodsId" :options="goodsOptions" :placeholder="t('common.select-placeholder')" :disabled="busy" />
      </WField>
      <WField v-if="goodsId" :label="t('goods-label.lot')">
        <WSelect v-model="lotChoice" :options="lotOptions" :placeholder="t('common.select-placeholder')" :disabled="busy" />
      </WField>
      <LabelLotPicker v-if="goodsId && lotChoice === -1" v-model="otherLot" :goods-id="goodsId" :disabled="busy" />
      <SortingQuantityFields v-model="quantities" :original="current" :disabled="busy" />
      <WField :label="t('sorting-quantity.reason')">
        <WTextarea v-model="reason" :maxlength="500" :disabled="busy" required />
      </WField>
      <div class="sorting-correction-actions">
        <WButton type="button" :disabled="busy" @click="requestOpen = false">{{ t('button.cancel') }}</WButton>
        <WButton type="submit" variant="primary" :disabled="!canSubmit || busy" :loading="busy">{{ t('sorting-quantity.submit') }}</WButton>
      </div>
    </form>
  </WModal>

  <WModal v-model:open="reviewOpen" :title="t(decision === 'approved' ? 'sorting-quantity.approve' : 'sorting-quantity.reject')"
    :closable="!busy" :close-on-backdrop="!busy">
    <form v-if="reviewTarget" class="sorting-correction-form" @submit.prevent="review">
      <WAlert v-if="formError" tone="block" :title="formError" />
      <strong>{{ goodsLabel(reviewTarget.goods_id) }} · {{ reviewTarget.lot_no || t('lot-rules.unassigned') }}</strong>
      <div>
        <div v-for="field in sortingQuantityFields" :key="field.key">
          {{ t(field.label) }} {{ reviewTarget.before[field.key] }} → {{ reviewTarget.after[field.key] }}
        </div>
      </div>
      <div v-if="decision === 'approved'">{{ t('sorting-quantity.approval-hint') }}</div>
      <WField :label="t('sorting-quantity.review-note')" :optional="decision === 'approved'">
        <WTextarea v-model="reviewNote" :maxlength="500" :disabled="busy" :required="decision === 'rejected'" />
      </WField>
      <div class="sorting-correction-actions">
        <WButton type="button" :disabled="busy" @click="reviewOpen = false">{{ t('button.cancel') }}</WButton>
        <WButton type="submit" variant="primary" :disabled="busy || (decision === 'rejected' && !reviewNote.trim())" :loading="busy">
          {{ t('button.confirm') }}
        </WButton>
      </div>
    </form>
  </WModal>
</template>

<style scoped>
.sorting-correction-head { display: flex; align-items: start; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.sorting-correction-head h3 { margin: 0; font-size: 14px; line-height: 22px; }
.sorting-correction-muted { color: var(--w-text-3); font-size: 12px; }
.sorting-correction-list { list-style: none; padding: 0; margin: 8px 0 0; }
.sorting-correction-list li { display: grid; gap: 4px; border-top: 1px solid var(--w-line); padding: 12px 0; font-size: 13px; }
.sorting-correction-list p { margin: 0; white-space: pre-wrap; }
.sorting-correction-form { display: grid; gap: 14px; }
.sorting-correction-list, .sorting-correction-form { overflow-wrap: anywhere; }
.sorting-correction-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
