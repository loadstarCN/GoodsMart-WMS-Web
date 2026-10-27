<script setup lang="ts">
import { INBOUND_STAGE_TABS } from '~/composables/asn/inboundFlow'
import { asnTypesOptions } from '~/data/selectOptions'
import { useAsnActions } from '~/composables/asn/useAsnActions'
definePageMeta({})
const { t, locale } = useI18n()
useHead({ title: () => t('nav.ASN') })
const route = useRoute()
const router = useRouter()
const staff = useStaffStore()
const warehouses = useWarehouseStore()
const { bizErrorMessage } = useBizError()
const { busy, run } = useAsnActions()
const loading = ref(false)
const error = ref('')
const data = ref<PaginationData | null>(null)
const keyword = ref(String(route.query.keyword || ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const stage = computed(() => String(route.query.inbound_stage || 'all'))
const status = computed(() => String(route.query.status || ''))
const type = computed(() => String(route.query.asn_type || ''))
const counts = ref<Record<string, number>>({})
const specCount = ref<number>()
const suppliers = ref<{value:number;label:string}[]>([])
const moreFilters = ref(false)
const dateFrom = ref(String(route.query.expected_arrival_date || ''))
const listStages = ['expected','in_transit','receiving','sorting','putaway','completed','exception','closed']
const loadSuppliers = async () => {
  if (!staff.hasPermission('supplier_read')) return
  const options: {value:number;label:string}[] = []
  for (const is_active of [true, false]) {
    let page = 1
    while (true) {
      const result = await httpRequest<PaginationData>('/api/warehouse/supplier/', {params:{is_active,page,per_page:100}})
      if (!result) return
      options.push(...result.items.map((row:any)=>({value:row.id,label:row.name})))
      if (page >= result.pages) break
      page++
    }
  }
  suppliers.value = options
}
const number = (value:unknown) => Number(value || 0).toLocaleString(locale.value)
const shortDate = (value:string) => value ? value.slice(5).replace('-', '/') : ''
const tabs = computed(() => [{ key: 'all', label: t('common.status.all'), count: counts.value.all }, ...listStages.map(key => ({ key, label: t(`asn.flow.stage.${key}`), count: counts.value[key], attention: ['receiving', 'putaway'].includes(key), error: key === 'exception' }))])
const statuses = computed(() => [{ value: '', label: t('common.status.all') }, ...['pending', 'received', 'completed', 'closed'].map(value => ({ value, label: t(`common.status.${value}`) }))])
const types = computed(() => [{ value: '', label: t('common.status.all') }, ...asnTypesOptions.map(value => ({ value, label: t(`asn.type.${value}`) }))])
const columns = computed(() => [
  { key: 'number', label: t('asn.entity'), wrap: true },
  { key: 'supplier', label: t('common.entities.supplier'), value: (row: any) => row.supplier?.name, wrap: true },
  { key: 'goods', label: t('common.entities.goods'), wrap: true },
  { key: 'carrier', label: t('asn.list.tracking'), wrap: true },
  ...(!warehouses.currentWarehouse ? [{ key: 'warehouse', label: t('common.entities.warehouse'), value: (row: any) => row.warehouse?.name }] : []),
  { key: 'expected_arrival_date', label: t('asn.list.arrival') },
  { key: 'stage', label: t('asn.list.stage'), wrap: true },
  { key: 'actions', label: t('button.next'), align: 'right' as const, wrap: true },
])
const go = (patch: Record<string, unknown>, keepPage = false) => {
  const query: Record<string, any> = { ...route.query, ...patch }
  for (const key of Object.keys(query)) if (query[key] == null || query[key] === '' || query[key] === 'all') delete query[key]
  if (!keepPage) delete query.page
  router.push({ query })
}
let generation = 0, countGeneration = 0
const fetchList = async () => {
  const seq = ++generation
  loading.value = true; error.value = ''
  await httpRequest<PaginationData>('/api/warehouse/asn/', {
    params: { ...route.query, page: page.value, per_page: 20 },
    onSuccess: value => { if (seq === generation) data.value = value },
    onError: err => { if (seq === generation) error.value = bizErrorMessage(err) },
    onFinally: () => { if (seq === generation) loading.value = false },
  })
}
const fetchCounts = async () => {
  const seq = ++countGeneration
  const params: Record<string, any> = { ...route.query, per_page: 1 }
  delete params.page; delete params.inbound_stage
  counts.value = {}; specCount.value = undefined
  const specParams = {...params}; delete specParams.spec_pending
  const specResult = await httpRequest<PaginationData>('/api/warehouse/asn/', {params:{...specParams,spec_pending:true}})
  if (seq !== countGeneration) return
  if (specResult) specCount.value = specResult.total
  await Promise.all(['all', ...INBOUND_STAGE_TABS].map(async key => {
    const result = await httpRequest<PaginationData>('/api/warehouse/asn/', { params: { ...params, ...(key === 'all' ? {} : { inbound_stage: key }) } })
    if (seq === countGeneration && result) counts.value[key] = result.total
  }))
}
const countKey = computed(() => { const q = { ...route.query }; delete q.page; delete q.inbound_stage; return JSON.stringify(q) })
watch(() => route.query, () => { keyword.value = String(route.query.keyword || ''); dateFrom.value = String(route.query.expected_arrival_date || ''); fetchList() })
watch(countKey, fetchCounts)
const act = async (id: number, action: 'receive' | 'close' | 'cancel' | 'delete') => { if (await run(id, action)) await Promise.all([fetchList(), fetchCounts()]) }
onMounted(() => { fetchList(); fetchCounts(); loadSuppliers() })
onBeforeUnmount(() => { generation++; countGeneration++ })
const tone = (value: string): 'ok' | 'warn' | 'bad' | 'info' | 'none' => value === 'exception' ? 'bad' : value === 'completed' ? 'ok' : ['receiving', 'putaway'].includes(value) ? 'warn' : ['in_transit', 'sorting'].includes(value) ? 'info' : 'none'
</script>
<template>
  <div class="asn-list w-scope">
    <header><h1>{{ t('nav.ASN') }} <small>{{ warehouses.currentWarehouse?.name ? warehouses.currentWarehouse.name + ' · ' : '' }}{{ data ? t('asn.list.count', {count:number(data.total)}) : '' }}</small></h1><WButton v-if="staff.hasPermission('asn_edit')" variant="primary" icon="plus" to="/asn/add">{{ t('asn.list.create') }}</WButton></header>
    <WCard flush>
      <WTabs inset :model-value="stage" :items="tabs" :label="t('asn.flow.stage-column')" @update:model-value="value => go({ inbound_stage: value })" />
      <form class="asn-list__filters" @submit.prevent="go({ keyword: keyword.trim() })">
        <WInput v-model="keyword" type="search" :placeholder="t('asn.list.search')" :aria-label="t('common.search')" @change="go({keyword:keyword.trim()})"><template #prefix><WIcon name="search" :size="16" /></template></WInput>
        <WFilterSelect v-if="staff.hasPermission('supplier_read')" :model-value="Number(route.query.supplier_id)||null" :options="suppliers" :label="t('common.entities.supplier')" @change="value=>go({supplier_id:value})" />
        <WFilterSelect :model-value="type || null" :options="types.filter(option => option.value)" :label="t('asn.list.type')" @change="value => go({ asn_type: value })" />
        <WDropdown :label="t('asn.list.arrival')" width="260px"><template #trigger="{attrs}"><button v-bind="attrs" class="w-asn-filter" type="button"><span>{{ t('asn.list.arrival') }}</span><span>{{ dateFrom || t('common.status.all') }}</span><WIcon name="chevron-down" :size="14" /></button></template>
          <div class="w-asn-date" data-keep-open><WField :label="t('asn.list.arrival-from')" optional><WInput v-model="dateFrom" type="date" @change="go({expected_arrival_date:dateFrom})" /></WField><WButton size="sm" @click="go({expected_arrival_date:null})">{{ t('common.status.all') }}</WButton></div>
        </WDropdown>
        <button class="w-asn-spec-filter" type="button" :aria-pressed="route.query.spec_pending==='true'" @click="go({spec_pending:route.query.spec_pending==='true'?null:'true'})"><span class="w-asn-spec-dot" />{{ t('asn.list.spec-pending') }}<strong v-if="specCount!==undefined">{{ number(specCount) }}</strong></button>
        <WButton variant="text" :aria-expanded="moreFilters" @click="moreFilters=!moreFilters">{{ t('dn.list.more-filters') }}</WButton>
        <div v-if="moreFilters" class="w-asn-more"><WFilterSelect :model-value="status || null" :options="statuses.filter(option => option.value)" :label="t('shipping.dn.status-filter')" @change="value => go({ status: value })" /></div>
      </form>
      <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="fetchList">{{ t('dn.list.retry') }}</WButton></template></WAlert>
      <WTable :rows="data?.items || []" :columns="columns" :loading="loading" inset valign="top">
        <template #cell-number="{ row }"><div class="w-asn-number"><NuxtLink class="w-asn-record-link" :to="`/asn/detail/${row.id}`">ASN-{{ row.id }}</NuxtLink><span v-if="row.asn_type !== 'inbound'" class="w-asn-type">{{ t(`asn.type.${row.asn_type}`) }}</span></div><div v-if="row.order_number" class="w-asn-sub">{{ row.order_number }}</div></template>
        <template #cell-goods="{ row }"><div>{{ t('asn.list.goods-count', { lines: number(row.detail_count), quantity: number(row.total_quantity) }) }}</div><span v-if="row.spec_pending_count" class="w-asn-spec-badge">{{ t('asn.form-ui.pending-specs',{count:row.spec_pending_count}) }}</span></template>
        <template #cell-carrier="{ row }"><span :class="{'w-asn-muted':!row.carrier?.name}">{{ row.carrier?.name || t('asn.list.no-tracking') }}</span><div v-if="row.tracking_number" class="w-asn-sub">{{ row.tracking_number }}</div></template>
        <template #cell-expected_arrival_date="{row}"><span class="w-asn-date-text">{{ shortDate(row.expected_arrival_date) }}</span></template>
        <template #cell-stage="{ row }"><WStatus muted :tone="tone(row.inbound_stage)">{{ t(`asn.flow.stage.${row.inbound_stage || 'expected'}`) }}</WStatus><div class="w-asn-sub w-asn-stage-sub">{{ t(`common.status.${row.status}`) }}</div></template>
        <template #cell-actions="{ row }"><div class="asn-list__actions">
          <WButton v-if="row.status === 'pending' && staff.hasPermission('asn_receive', 'asn_edit')" size="sm" :disabled="busy" @click="act(row.id, 'receive')">{{ t('asn.operations.receive') }}</WButton>
          <WButton v-if="row.inbound_stage === 'sorting' && staff.hasPermission('sorting_read')" size="sm" :to="`/sorting?asn_id=${row.id}`">{{ t('asn.operations.sorting') }}</WButton>
          <WButton v-if="row.inbound_stage==='putaway' && staff.hasPermission('inventory_read')" size="sm" :to="{path:'/inventory',query:{pending_putaway:'true',warehouse_id:row.warehouse_id}}">{{ t('asn.flow.steps.putaway') }}</WButton>
          <WDropdown :label="t('common.fields.action')" placement="bottom-end" width="180px">
            <template #trigger="{ attrs }"><WButton v-bind="attrs" variant="text" class="w-asn-more-button" icon="more" icon-only size="sm" :aria-label="t('common.fields.action')" /></template>
            <NuxtLink class="w-menu-item" role="menuitem" :to="`/asn/detail/${row.id}`">{{ t('asn.fields.details') }}</NuxtLink>
            <NuxtLink class="w-menu-item" role="menuitem" v-if="row.status === 'pending' && staff.hasPermission('asn_edit')" :to="`/asn/edit/${row.id}`">{{ t('asn.operations.edit') }}</NuxtLink>
            <button class="w-menu-item" role="menuitem" v-if="row.status === 'pending' && staff.hasPermission('asn_edit')" :disabled="busy" @click="act(row.id, 'close')">{{ t('button.close') }}</button>
            <button class="w-menu-item" role="menuitem" v-if="row.status === 'received' && staff.hasPermission('asn_edit')" :disabled="busy" @click="act(row.id, 'cancel')">{{ t('asn.operations.cancel') }}</button>
            <button class="w-menu-item" role="menuitem" v-if="row.status === 'pending' && staff.hasPermission('asn_delete')" :disabled="busy" @click="act(row.id, 'delete')">{{ t('button.delete') }}</button>
          </WDropdown>
        </div></template>
      </WTable>
      <div class="asn-list__pagination"><WPagination :page="page" :total="data?.total" :page-size="20" show-total @update:page="value => go({ page: value }, true)" /></div>
    </WCard>
  </div>
</template>
<style scoped>
.asn-list { display: flex; flex-direction: column; gap: 16px; }
.asn-list header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.asn-list h1 { display: flex; align-items: baseline; gap: 12px; font-size: 24px; line-height: 32px; font-weight: 600; margin: 0; }
.asn-list h1 small { font-size: 13px; line-height: 20px; color: var(--w-text-2); font-weight: 400; }
.asn-list__filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--w-line); }
.asn-list__filters > :first-child { flex: 1 1 260px; min-width: 200px; max-width: 320px; }
.asn-list__filters > .w-select { width: auto; min-width: 150px; }
.asn-list__actions { display: flex; align-items: flex-start; justify-content: flex-end; gap: 8px; }
.asn-list__pagination { padding: 12px 20px; border-top: 1px solid var(--w-border); }
.asn-list :deep(.w-table-wrap.is-inset) { --w-table-edge:20px; }
.asn-list :deep(.w-table) { min-width:1000px; border-collapse:collapse; }
.asn-list :deep(.w-table thead th) { height:auto; line-height:16px; padding-top:10px; padding-bottom:8px; }
.asn-list :deep(.w-table__head) { vertical-align:top; }
.asn-list__filters :deep(input[type="search"]) { font-size:13px; }
.w-asn-record-link { font-size:14px; line-height:20px; font-weight:600; color:var(--w-text-1); text-decoration:none; white-space:nowrap; }
.w-asn-record-link:hover { color:var(--w-link); }
.w-asn-number { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.w-asn-sub { font-size:12px; line-height:18px; color:var(--w-text-3); margin-top:2px; }
.w-asn-stage-sub { padding-left:12px; }
.w-asn-date-text { color:var(--w-text-2); white-space:nowrap; }
.w-asn-muted { color:var(--w-text-3); }
.w-asn-type,.w-asn-spec-badge { display:inline-block; font-size:12px; line-height:16px; font-weight:500; padding:0 6px; border:1px solid var(--w-border); border-radius:6px; color:var(--w-text-2); white-space:nowrap; }
.w-asn-spec-badge { margin-top:2px; border-color:#F8D399; color:#92500B; }
.w-asn-filter,.w-asn-spec-filter { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px; border:1px solid var(--w-border-strong); border-radius:6px; background:var(--w-surface); font:inherit; font-size:13px; line-height:20px; cursor:pointer; color:var(--w-text-2); }
.w-asn-filter span:nth-child(2) { color:var(--w-text-1); }
.w-asn-spec-filter { border-radius:999px; border-color:var(--w-border); }
.w-asn-spec-filter[aria-pressed="true"] { border-color:var(--w-sel); background:var(--w-sel-soft); }
.w-asn-spec-filter strong { font-weight:600; color:var(--w-text-1); }
.w-asn-spec-dot { width:6px; height:6px; border-radius:50%; background:var(--w-warn-dot); }
.w-asn-date { display:flex; flex-direction:column; gap:8px; padding:8px; }
.w-asn-more { display:flex; flex-basis:100%; padding-top:4px; }
.w-asn-more-button { color:var(--w-text-2); }
</style>
