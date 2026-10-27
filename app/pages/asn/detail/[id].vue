<script setup lang="ts">
import { countryName } from '~/data/countries'
import type { InboundFlow } from '~/composables/asn/inboundFlow'
import { useAsnActions } from '~/composables/asn/useAsnActions'
definePageMeta({})
const route = useRoute()
const id = computed(() => String(route.params.id))
const { t, locale } = useI18n()
useHead({ title: () => `ASN-${id.value}` })
const staff = useStaffStore()
const { bizErrorMessage } = useBizError()
const { busy, run } = useAsnActions()
const record = ref<any>(null)
const supplier = ref<any>(null)
const loading = ref(true)
const error = ref('')
const flow = ref<InboundFlow | null>(null)
const selectedStep = ref<string | null>(null)
const flowRef = ref<{ reload: () => Promise<void> } | null>(null)
let generation = 0
const load = async () => {
  const seq = ++generation
  loading.value = true; error.value = ''
  await httpRequest<any>(`/api/warehouse/asn/${id.value}`, {
    onSuccess: data => {
      if (seq !== generation) return
      record.value = data
      supplier.value = data.supplier
      if (data.supplier_id && staff.hasPermission('supplier_read')) httpRequest<any>('/api/warehouse/supplier/' + data.supplier_id, {
        onSuccess: value => { if (seq === generation) supplier.value = value },
      })
    },
    onError: err => { if (seq === generation) error.value = bizErrorMessage(err) },
    onFinally: () => { if (seq === generation) loading.value = false },
  })
}
const act = async (action: 'receive' | 'close' | 'cancel') => { if (await run(id.value, action)) await Promise.all([load(), flowRef.value?.reload()]) }
watch(id, () => { record.value = null; flow.value = null; selectedStep.value = null; load() })
onMounted(load)
onBeforeUnmount(() => { generation++ })
const columns = computed(() => [
  { key: 'goods', label: t('asn.form-ui.goods-specs'), wrap: true },
  { key: 'quantity', label: t('asn.form-ui.expected'), type: 'qty' as const, keepZero: true, strong: true },
  { key: 'actual_quantity', label: t('common.quantities.actual'), type: 'qty' as const, keepZero: true, value: (row: any) => record.value?.status === 'pending' ? null : row.actual_quantity },
  { key: 'sorted_quantity', label: t('common.quantities.sorted'), type: 'qty' as const },
  { key: 'damage_quantity', label: t('common.quantities.damaged'), type: 'qty' as const },
  { key: 'rejected_quantity', label: t('asn.form-ui.rejected'), type: 'qty' as const },
  { key: 'weight', label: `${t('goods.fields.weight')} (kg)`, type: 'qty' as const },
  { key: 'volume', label: `${t('goods.fields.volume')} (m³)`, type: 'qty' as const },
  { key: 'remark', label: t('common.fields.remark'), wrap: true },
])
const tone = computed(() => flow.value?.stage === 'exception' ? 'bad' : record.value?.status === 'completed' ? 'ok' : record.value?.status === 'received' ? 'warn' : flow.value?.stage === 'in_transit' ? 'info' : 'none')
</script>
<template>
  <div class="asn-detail w-scope">
    <div class="asn-detail__top">
    <nav :aria-label="t('nav.ASN')"><NuxtLink class="w-breadcrumb-link" to="/asn">{{ t('nav.ASN') }}</NuxtLink> / ASN-{{ id }}</nav>
    <header><div class="asn-detail__heading"><h1>ASN-{{ id }}</h1><WStatus v-if="record" :tone="tone" variant="pill">{{ flow ? t('asn.flow.stage.' + flow.stage) : t('common.status.' + record.status) }}</WStatus><span class="asn-detail__type" v-if="record">{{ t('asn.type.' + record.asn_type) }}<template v-if="record.carrier"> · {{ record.carrier.name }}</template></span></div>
      <div v-if="record" class="asn-detail__summary"><span>{{ t('common.entities.supplier') }} <b>{{ record.supplier?.name }}</b></span><span v-if="record.order_number">{{ t('dn.fields.order-no') }} <b>{{ record.order_number }}</b></span><span v-if="record.expected_arrival_date">{{ t('asn.fields.expected-arrival-date') }} <b>{{ record.expected_arrival_date }}</b></span></div>
      <div v-if="record" class="asn-detail__actions">
        <WButton :to="`/asn/print/${id}`" target="_blank">{{ t('button.print') }}</WButton>
        <WButton v-if="record.status === 'pending' && staff.hasPermission('asn_edit')" :to="`/asn/edit/${id}`">{{ t('button.edit') }}</WButton>
        <WButton v-if="record.status === 'received' && staff.hasPermission('sorting_read')" :to="`/sorting?asn_id=${id}`">{{ t('asn.operations.sorting') }}</WButton>
        <WButton variant="danger" v-if="record.status === 'pending' && staff.hasPermission('asn_edit')" :disabled="busy" @click="act('close')">{{ t('button.close') }}</WButton>
        <WButton v-if="record.status === 'received' && staff.hasPermission('asn_edit')" variant="text" :disabled="busy" @click="act('cancel')">{{ t('asn.operations.cancel') }}</WButton>
      </div>
    </header>
    </div>
    <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{ t('dn.list.retry') }}</WButton></template></WAlert>
    <WCard v-if="loading && !record"><span role="status">{{ t('common.status.loading') }}</span></WCard>
    <AsnFlowProgress v-if="flow" :flow="flow" :selected="selectedStep" @select="selectedStep = $event" />
    <div v-if="record" class="asn-detail__layout">
      <div class="asn-detail__main">
        <AsnInboundFlow :key="id" ref="flowRef" :asn-id="id" :selected="selectedStep" @loaded="flow = $event" @changed="load" />
        <WCard class="asn-detail__items" :title="t('common.entities.goods')" :subtitle="t('dn.list.goods', { kinds: record.detail_count, qty: record.total_quantity })" flush>
          <template #actions><WStatus v-if="record.spec_pending_count" tone="warn">{{ t('asn.form-ui.pending-specs', { count: record.spec_pending_count }) }}</WStatus></template>
          <WTable :rows="record.details || []" :columns="columns" row-key="id" inset>
            <template #cell-goods="{ row }"><div class="asn-detail__goods"><NuxtLink class="w-record-link" :to="'/goods/detail/' + row.goods_id">{{ row.goods?.name }}</NuxtLink><div>{{ row.goods?.code }}</div><div class="asn-detail__specs">{{ [row.goods?.weight ? row.goods.weight + ' kg' : '', row.goods?.length && row.goods?.width && row.goods?.height ? [row.goods.length, row.goods.width, row.goods.height].map(value => value / 10).join(' × ') + ' cm' : '', row.goods?.origin_country ? countryName(row.goods.origin_country, locale) : ''].filter(Boolean).join(' · ') }}</div></div></template>
            <template #foot><tr><th>{{ t('asn.form-ui.total') }}</th><td>{{ record.total_quantity }}</td><td>{{ record.status === 'pending' ? '' : record.total_actual_quantity }}</td><td>{{ record.total_sorted_quantity || '' }}</td><td>{{ record.total_damage_quantity || '' }}</td><td>{{ record.total_rejected_quantity || '' }}</td><td>{{ record.total_weight || '' }}</td><td>{{ record.total_volume || '' }}</td><td /></tr></template>
          </WTable>
        </WCard>
      </div>
      <aside :aria-label="t('asn.fields.details')">
        <section class="asn-detail__aside-card"><h3>{{ t('common.entities.supplier') }}</h3><div class="asn-detail__supplier"><NuxtLink class="w-record-link" v-if="supplier" :to="'/supplier/detail/' + supplier.id">{{ supplier.name }}</NuxtLink><span v-if="supplier?.address">{{ supplier.address }}</span></div><p v-if="supplier?.phone || supplier?.contact">{{ [supplier.phone, supplier.contact].filter(Boolean).join(' · ') }}</p></section>
        <section class="asn-detail__aside-card"><h3>{{ t('asn.form-ui.document-info') }}</h3>
          <dl class="asn-detail__facts">
            <dt>{{ t('common.entities.warehouse') }}</dt><dd>{{ record.warehouse?.name }}</dd>
            <template v-if="record.order_number"><dt>{{ t('dn.fields.order-no') }}</dt><dd>{{ record.order_number }}</dd></template>
            <dt>{{ t('common.dates.created') }}</dt><dd>{{ $dayjs(record.created_at, 'MM/DD HH:mm', record) }} · {{ record.creator?.user_name }}</dd>
            <dt>{{ t('common.dates.updated') }}</dt><dd>{{ $dayjs(record.updated_at, 'MM/DD HH:mm', record) }}</dd>
            <dt>{{ t('asn.form-ui.spec-capture') }}</dt><dd>{{ t('asn.form-ui.' + (record.spec_capture?.mode || 'missing')) }}<template v-if="record.spec_capture?.fields?.length"> · {{ record.spec_capture.fields.map((field: string) => t('sorting.spec-pending.fields.' + field.replaceAll('_', '-'))).join('、') }}</template></dd>
            <dt>{{ t('common.fields.remark') }}</dt><dd class="asn-detail__remark">{{ record.remark || '—' }}</dd>
          </dl>
        </section>
      </aside>
    </div>
  </div>
</template>
<style scoped>
.asn-detail { display: flex; flex-direction: column; gap: 24px; max-width: 1216px; padding-bottom: 24px; }
.asn-detail__top { display: flex; flex-direction: column; gap: 8px; }
.asn-detail__summary { display: flex; flex-wrap: wrap; gap: 4px 24px; font-size: 13px; line-height: 20px; color: var(--w-text-3); order: 3; flex-basis: 100%; margin-top: -6px; }
.asn-detail__summary b { color: var(--w-text-1); font-weight: 500; }
.asn-detail__type { font-size: 13px; line-height: 20px; color: var(--w-text-2); }
.asn-detail nav { display: flex; gap: 8px; font-size: 13px; line-height: 20px; color: var(--w-text-2); }
.w-breadcrumb-link { color: var(--w-text-3); }
.asn-detail header, .asn-detail__heading, .asn-detail__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.asn-detail header { justify-content: space-between; }
.asn-detail h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; }
.asn-detail__layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.asn-detail__main { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.asn-detail aside { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.asn-detail__aside-card { background: var(--w-surface); border: 1px solid var(--w-border); border-radius: 10px; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 10px; }
.asn-detail__aside-card h3 { margin: 0; font-size: 14px; line-height: 22px; font-weight: 600; }
.asn-detail__aside-card p { margin: 0; font-size: 12px; line-height: 18px; color: var(--w-text-3); }
.asn-detail__supplier { display: flex; flex-direction: column; font-size: 13px; line-height: 20px; color: var(--w-text-2); }
.asn-detail__supplier a { font-size: 14px; line-height: 22px; font-weight: 600; color: var(--w-text-1); }
.asn-detail__facts { display: grid; grid-template-columns: 88px minmax(0, 1fr); row-gap: 6px; margin: 0; font-size: 13px; line-height: 20px; }
.asn-detail dt { color: var(--w-text-2); font-weight: 400; }
.asn-detail dd { margin: 0; overflow-wrap: anywhere; }
.asn-detail__remark { white-space: pre-wrap; }
.asn-detail__goods { display: flex; flex-direction: column; gap: 0; font-size: 12px; line-height: 18px; color: var(--w-text-3); }
.asn-detail__goods > a { font-size: 13px; line-height: 20px; font-weight: 600; color: var(--w-text-1); }
.asn-detail__items :deep(.w-card__header) { padding: 16px 24px; }
.asn-detail__items :deep(table) { min-width: 800px; }
.asn-detail__items :deep(tfoot td) { text-align: right; }
.asn-detail__goods img { object-fit: contain; }
@media (max-width: 1100px) { .asn-detail__layout { grid-template-columns: minmax(0, 1fr); } }
</style>
