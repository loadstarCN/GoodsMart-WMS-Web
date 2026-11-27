<script setup lang="ts">
import {
  sortingQuantityFields, type SortingCorrection, type SortingCorrectionSnapshot,
} from '~/utils/sortingQuantities'

type Decision = 'approved' | 'rejected'

const props = defineProps<{
  taskId: number
  warehouseId: number
  lines: { goods_id: number; goods?: { name?: string; code?: string } }[]
  editing?: boolean
}>()
const emit = defineEmits<{ approved: []; loaded: [SortingCorrectionSnapshot | undefined] }>()
const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const auth = useAuthStore()
const staff = useStaffStore()
const canReview = computed(() => staff.refreshed && !!staff.staffInfo && staff.hasPermission('adjustment_approve'))
const endpoint = computed(() => `/api/warehouse/sorting/${props.taskId}/quantity-corrections`)
const headers = computed(() => warehouseHeaders(props.warehouseId))
const snapshot = ref<SortingCorrectionSnapshot>()
const loadError = ref('')
const loading = ref(false)
const busy = ref(false)
const formError = ref('')
const reviewOpen = ref(false)
const reviewTarget = ref<SortingCorrection[]>()
const decision = ref<Decision>('approved')
const reviewNote = ref('')

const goods = computed(() => new Map(props.lines.map(line => [line.goods_id, line.goods])))
function goodsLabel(id: number) {
  const item = goods.value.get(id)
  return [item?.name, item?.code].filter(Boolean).join(' · ') || '#' + id
}
const requests = computed(() => {
  const result = new Map<string, SortingCorrection[]>()
  for (const row of snapshot.value?.corrections ?? []) {
    const key = row.request_group || String(row.id)
    const group = result.get(key)
    if (group) group.push(row)
    else result.set(key, [row])
  }
  return [...result.values()]
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    snapshot.value = await httpRequest<SortingCorrectionSnapshot>(endpoint.value, {
      headers: headers.value,
      onError: error => loadError.value = bizErrorMessage(error),
    }) || undefined
    emit('loaded', snapshot.value)
  } finally {
    loading.value = false
  }
}
onMounted(load)
defineExpose({ load })

function openReview(rows: SortingCorrection[], action: Decision) {
  if (props.editing) return
  formError.value = ''
  reviewTarget.value = rows
  decision.value = action
  reviewNote.value = ''
  reviewOpen.value = true
}

async function review() {
  const row = reviewTarget.value?.[0]
  if (!row || busy.value || !canReview.value || (decision.value === 'rejected' && !reviewNote.value.trim())) return
  busy.value = true
  formError.value = ''
  try {
    const result = await httpRequest(`${endpoint.value}/${row.id}/review`, {
      method: 'POST',
      headers: headers.value,
      body: { decision: decision.value, note: reviewNote.value.trim() || null, request_group: row.request_group },
      onError: error => formError.value = bizErrorMessage(error),
    })
    if (result) {
      reviewOpen.value = false
      if (decision.value === 'approved') emit('approved')
      else await load()
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <WCard>
    <h3>{{ t('sorting-quantity.title') }}</h3>
    <WAlert v-if="loadError" tone="block" :title="loadError">
      <template #actions><WButton :disabled="loading" @click="load">{{ t('dn.list.retry') }}</WButton></template>
    </WAlert>
    <p v-else-if="loading || !requests.length" class="sorting-correction-muted">
      {{ t(loading ? 'common.status.loading' : 'sorting-quantity.empty') }}
    </p>
    <ul v-else class="sorting-correction-list">
      <li v-for="rows in requests" :key="rows[0]!.id">
        <template v-if="rows[0]">
          <div class="sorting-correction-head">
            <strong>{{ t('sorting-quantity.row-count', { count: rows.length }) }}</strong>
            <WStatus :tone="rows[0].status === 'approved' ? 'ok' : rows[0].status === 'pending' ? 'warn' : 'bad'">
              {{ t('sorting-quantity.' + rows[0].status) }}
            </WStatus>
          </div>
          <div v-for="row in rows" :key="row.id" class="sorting-correction-line">
            <strong>{{ goodsLabel(row.goods_id) }}</strong>
            <div v-if="row.lot_no" class="sorting-correction-muted">{{ row.lot_no }}</div>
            <div v-for="field in sortingQuantityFields" v-show="row.before[field.key] !== row.after[field.key]" :key="field.key">
              {{ t(field.label) }} {{ row.before[field.key] }} → {{ row.after[field.key] }}
            </div>
          </div>
          <p>{{ rows[0].reason }}</p>
          <div class="sorting-correction-muted">{{ rows[0].requester }} · {{ $dayjs(rows[0].requested_at) }}</div>
          <div v-if="rows[0].reviewed_at" class="sorting-correction-muted">{{ rows[0].reviewer }} · {{ $dayjs(rows[0].reviewed_at) }}</div>
          <p v-if="rows[0].review_note">{{ rows[0].review_note }}</p>
          <div v-if="rows[0].status === 'pending' && canReview && String(rows[0].requested_by) !== String(auth.userInfo?.id)"
            class="sorting-correction-actions">
            <WButton size="sm" :disabled="busy || editing" @click="openReview(rows, 'rejected')">{{ t('sorting-quantity.reject') }}</WButton>
            <WButton size="sm" variant="primary" :disabled="busy || editing" @click="openReview(rows, 'approved')">{{ t('sorting-quantity.approve') }}</WButton>
          </div>
        </template>
      </li>
    </ul>
  </WCard>

  <WModal v-model:open="reviewOpen" :title="t(decision === 'approved' ? 'sorting-quantity.approve' : 'sorting-quantity.reject')"
    :closable="!busy" :close-on-backdrop="!busy">
    <form v-if="reviewTarget" class="sorting-correction-form" @submit.prevent="review">
      <WAlert v-if="formError" tone="block" :title="formError" />
      <div v-for="row in reviewTarget" :key="row.id" class="sorting-correction-line">
        <strong>{{ goodsLabel(row.goods_id) }}<template v-if="row.lot_no"> · {{ row.lot_no }}</template></strong>
        <div v-for="field in sortingQuantityFields" v-show="row.before[field.key] !== row.after[field.key]" :key="field.key">
          {{ t(field.label) }} {{ row.before[field.key] }} → {{ row.after[field.key] }}
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
h3 { margin: 0; font-size: 14px; line-height: 22px; }
.sorting-correction-muted { color: var(--w-text-3); font-size: 12px; }
.sorting-correction-list { list-style: none; padding: 0; margin: 8px 0 0; }
.sorting-correction-list li { display: grid; gap: 8px; border-top: 1px solid var(--w-line); padding: 12px 0; font-size: 13px; }
.sorting-correction-line { border-inline-start: 2px solid var(--w-border); padding-inline-start: 8px; }
.sorting-correction-list p { margin: 0; white-space: pre-wrap; }
.sorting-correction-form { display: grid; gap: 14px; }
.sorting-correction-list, .sorting-correction-form { overflow-wrap: anywhere; }
.sorting-correction-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
