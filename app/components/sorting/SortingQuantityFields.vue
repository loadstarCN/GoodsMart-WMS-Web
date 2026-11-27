<script setup lang="ts">
import { sortingQuantityFields, type SortingQuantities } from '~/utils/sortingQuantities'

defineProps<{ disabled?: boolean; original?: SortingQuantities }>()
const quantities = defineModel<SortingQuantities<number | null>>({ required: true })
const { t } = useI18n()
</script>

<template>
  <div class="sorting-quantity-fields">
    <WField v-for="field in sortingQuantityFields" :key="field.key" :label="t(field.label)"
      :hint="original ? t('sorting-quantity.original-count', { count: original[field.key] }) : undefined">
      <WInput :model-value="quantities[field.key]" :disabled="disabled" type="number" min="0" step="1" required
        @update:model-value="value => quantities = { ...quantities, [field.key]: value == null || value === '' ? null : Number(value) }" />
    </WField>
  </div>
</template>

<style scoped>
.sorting-quantity-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
</style>
