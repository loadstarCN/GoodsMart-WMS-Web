<script setup lang="ts">
import { pendingPutaway } from '~/composables/inventory/putawayStock'

interface PendingSource {
  lot_id: number | null
  lot_no: string | null
  expiry_date: string | null
  receipt_source_id: number
  asn_id: number | null
  dn_id?: number | null
  source_type?: string
  sorted_stock: number
  sorted_damage_stock: number
}

const props = defineProps<{ rows?: PendingSource[] | null }>()
const { t, n } = useI18n()
const staff = useStaffStore()

const details = computed(() => (props.rows ?? []).map(row => {
  const pending = pendingPutaway(row)!
  const source = row.asn_id ? `ASN-${row.asn_id}` : row.dn_id ? `DN-${row.dn_id}` : t('putaway-source.unknown')
  const link = row.asn_id && staff.hasPermission('asn_read') ? `/asn/detail/${row.asn_id}`
    : row.dn_id && staff.hasPermission('dn_read') ? `/dn/detail/${row.dn_id}` : undefined
  return { ...row, source, link, good: pending.good, damaged: pending.damaged }
}))
</script>

<template>
  <ul v-if="details.length" class="pending-sources" role="list" :aria-label="t('pending-age.sources')">
    <li v-for="row in details" :key="`${row.lot_id ?? 0}:${row.receipt_source_id}`">
      <NuxtLink v-if="row.link" class="source" :to="row.link">{{ row.source }}</NuxtLink>
      <span v-else class="source" :class="{ 'source--unknown': !row.asn_id && !row.dn_id }">{{ row.source }}</span>
      <span v-if="row.dn_id && row.source_type" class="metadata">{{ t('ledger.movements.' + row.source_type) }}</span>
      <span class="metadata">{{ row.lot_no ? t('pending-age.lot-number', { lot: row.lot_no }) : t('lot-rules.unassigned') }}</span>
      <span v-if="row.expiry_date" class="metadata">{{ t('pending-age.lot-expiry', { date: row.expiry_date }) }}</span>
      <span class="quantities">
        <span v-if="row.good">{{ t('inventory.pending.good') }} <strong>{{ n(row.good) }}</strong></span>
        <span v-if="row.damaged" class="quantity--damaged">{{ t('inventory.pending.damaged') }} <strong>{{ n(row.damaged) }}</strong></span>
      </span>
    </li>
  </ul>
  <p v-else class="sources-unavailable">{{ t('pending-age.sources-unavailable') }}</p>
</template>

<style scoped>
.pending-sources {
  display: grid;
  gap: 5px;
  margin: 8px 0 0;
  padding: 0;
  padding-inline-start: 10px;
  border-inline-start: 2px solid var(--w-border);
  list-style: none;
}
.pending-sources li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  color: var(--w-text-2);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.source {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--w-surface-2);
  color: var(--w-text-1);
  font-weight: 600;
}
a.source { color: var(--w-link); text-decoration: none; }
a.source:hover, a.source:focus-visible { text-decoration: underline; }
.source--unknown { font-weight: 400; }
.metadata { color: var(--w-text-3); }
.quantities { display: inline-flex; gap: 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.quantity--damaged { color: var(--w-warn-text); }
.sources-unavailable { margin: 8px 0 0; color: var(--w-text-3); font-size: 12px; line-height: 18px; }
</style>
