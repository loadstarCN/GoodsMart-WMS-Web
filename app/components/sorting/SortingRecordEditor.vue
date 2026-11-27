<script setup lang="ts">
import SortingQuantityFields from './SortingQuantityFields.vue'
import {
  sameSortingQuantities, validSortingQuantities, type SortingQuantities,
} from '~/utils/sortingQuantities'

type EditableLine = SortingQuantities & {
  id: number
  goods?: { name?: string }
  lot_no?: string
  rejection_reason?: string
}

const props = defineProps<{ taskId: number; warehouseId: number; line: EditableLine | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const { bizErrorMessage } = useBizError()
const quantities = ref<SortingQuantities<number | null>>({ sorted_quantity: 0, damage_quantity: 0, rejected_quantity: 0 })
const reason = ref('')
const error = ref('')
const busy = ref(false)
watch(open, value => {
  if (!value || !props.line) return
  const { sorted_quantity, damage_quantity, rejected_quantity } = props.line
  quantities.value = { sorted_quantity, damage_quantity, rejected_quantity: rejected_quantity ?? 0 }
  reason.value = props.line.rejection_reason || ''
  error.value = ''
})

const canSave = computed(() => {
  const line = props.line
  return !!line && validSortingQuantities(quantities.value)
    && (!quantities.value.rejected_quantity || !!reason.value.trim())
    && (!sameSortingQuantities(quantities.value, line) || reason.value.trim() !== (line.rejection_reason || ''))
})

async function save() {
  const line = props.line
  if (!line || busy.value || !canSave.value) return
  busy.value = true
  error.value = ''
  try {
    const updated = await httpRequest(`/api/warehouse/sorting/${props.taskId}/details/${line.id}`, {
      method: 'PUT',
      headers: warehouseHeaders(props.warehouseId),
      body: {
        ...quantities.value,
        rejection_reason: quantities.value.rejected_quantity ? reason.value.trim() : '',
        expected_quantities: {
          sorted_quantity: line.sorted_quantity,
          damage_quantity: line.damage_quantity,
          rejected_quantity: line.rejected_quantity ?? 0,
        },
      },
      onError: value => error.value = bizErrorMessage(value),
    })
    if (updated) {
      open.value = false
      emit('saved')
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <WModal v-model:open="open" :title="t('sorting-quantity.edit')" :closable="!busy" :close-on-backdrop="!busy">
    <form class="sorting-record-editor" @submit.prevent="save">
      <div><strong>{{ line?.goods?.name }}</strong> · {{ line?.lot_no || t('lot-rules.unassigned') }}</div>
      <WAlert v-if="error" tone="block" :title="error" />
      <SortingQuantityFields v-model="quantities" :disabled="busy" />
      <WField v-if="quantities.rejected_quantity" :label="t('receiving-exceptions.rejection-reason')">
        <WTextarea v-model="reason" :maxlength="500" :disabled="busy" required />
      </WField>
      <div class="sorting-record-editor-actions">
        <WButton type="button" :disabled="busy" @click="open = false">{{ t('button.cancel') }}</WButton>
        <WButton type="submit" variant="primary" :disabled="!canSave || busy" :loading="busy">{{ t('button.save') }}</WButton>
      </div>
    </form>
  </WModal>
</template>

<style scoped>
.sorting-record-editor { display: grid; gap: 14px; overflow-wrap: anywhere; }
.sorting-record-editor-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
