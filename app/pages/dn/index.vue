<script lang="ts" setup>
/**
 * 发货单列表（设计稿 DnList.dc.html）：/dn?shipping_stage=&status=&carrier_id=&dn_type=&recipient_id=&keyword=&page=
 * - 页签 = 发货阶段（与流程接口同一口径），数量灰字；仓库要动手的阶段前加琥珀点、异常加红点。
 *   后端没有按阶段汇总的接口，数量按当前筛选（不含阶段、页码）逐个阶段各请求一次（per_page=1 取 total），筛选变了才重新请求
 * - 筛选条：搜索（DN 号 / 订单号 / 商品编码 / 运单号，停 0.5 秒或回车）、单据状态、承运商；更多筛选：发货类型、收货方
 * - 表格：发货单（单号 + 订单号）、收货方（名称 + 国家 · 城市）、商品（种 · 件）、进度（阶段 + 9 段进度条 + 单据状态）、
 *   承运商 · 运单号、（页头选「全部仓库」时）仓库、计划发货、下一步（要做的事的按钮 / 灰字 / 承运商查询页）+ 更多菜单
 * - 文件方式的批量操作：勾选运单方式 = 文件的承运商、待建运单 / 待导回运单号的发货单 → 批量操作条「导出文件」；
 *   「导回运单号」在页头；「最近的文件」在批量操作条（及这两个页签的筛选条右侧）
 * 统计卡与近 6 个月柱状图不放在列表页（设计稿 Patterns：统计集中到首页和报表）。
 */
import type { WTabItem } from '~/components/w/WTabs.vue'
import type { WTableColumn } from '~/components/w/WTable.vue'
import type { WFilterOption } from '~/components/w/WFilterSelect.vue'
import type { WComboboxOption } from '~/components/w/WCombobox.vue'
import type { HttpRequestError } from '~/utils/http'
import {
  CARRIER_FILE_BIZ_CODES,
  exportCarrierFile,
  exportProblemRows,
  type ExportProblemRow,
  type FileCarrierOption,
} from '~/composables/shipping/carrierFile'
import {
  DN_ATTENTION_STAGES,
  DN_STAGE_TABS,
  DN_STATUSES,
  dnExportCarrier,
  dnFilterParams,
  dnNextStep,
  dnPlannedDate,
  dnProgressSegments,
  dnStageTone,
  isDnStage,
  type DnCarrierInfo,
  type DnNextStep,
} from '~/utils/dnList'
import { countryName } from '~/data/countries'
import { useDnActions } from '~/composables/dn/useDnActions'

definePageMeta({})

const PER_PAGE = 20
/** 文件方式的批量操作只对这两个阶段的发货单 */
const FILE_STAGES = ['awaiting_waybill', 'awaiting_number']

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const staffStore = useStaffStore()
const warehouseStore = useWarehouseStore()
const { bizErrorMessage } = useBizError()
const { busy: actionBusy, start } = useDnActions()
const uid = useId()
const panelId = `${uid}-panel`

useHead({ title: () => t('nav.DN') })

// ------------------ URL 参数 ----------------------
const stage = computed(() => (isDnStage(route.query.shipping_stage) ? String(route.query.shipping_stage) : 'all'))
const filters = computed(() => dnFilterParams(route.query as Record<string, unknown>))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const perPage = computed(() => Math.min(100, Math.max(1, Number(route.query.per_page) || PER_PAGE)))
const hasFilters = computed(() => Object.keys(filters.value).length > 0)

/** 改 URL 参数（undefined / '' 去掉）；除翻页外都回到第 1 页 */
const go = (patch: Record<string, string | number | null | undefined>, keepPage = false) => {
  const query: Record<string, any> = { ...route.query, ...patch }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') delete query[key]
  }
  if (!keepPage) delete query.page
  router.push({ query })
}

// ------------------ 列表 ----------------------
const pageData = ref<PaginationData | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
let listSeq = 0

const fetchList = async () => {
  const seq = ++listSeq
  loading.value = true
  loadError.value = null
  const params: Record<string, any> = { ...filters.value, page: page.value, per_page: perPage.value }
  if (stage.value !== 'all') params.shipping_stage = stage.value
  await httpRequest<PaginationData>('/api/warehouse/dn/', {
    method: 'GET',
    params,
    onSuccess: (data) => {
      if (seq === listSeq) pageData.value = data
    },
    onError: (error) => {
      if (seq === listSeq) loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      if (seq === listSeq) loading.value = false
    },
  })
}
const rows = computed<any[]>(() => pageData.value?.items || [])

// ------------------ 页签数量（每个阶段一个 per_page=1 的请求；筛选变了才重新请求） ----------------------
const counts = ref<Record<string, number | null>>({})
let countsKey = ''
let countsSeq = 0
const fetchCounts = async (force = false) => {
  const key = JSON.stringify(filters.value)
  if (!force && key === countsKey) return
  countsKey = key
  const seq = ++countsSeq
  const result: Record<string, number | null> = {}
  await Promise.all(['all', ...DN_STAGE_TABS].map((s) => httpRequest<PaginationData>('/api/warehouse/dn/', {
    method: 'GET',
    params: { ...filters.value, page: 1, per_page: 1, ...(s === 'all' ? {} : { shipping_stage: s }) },
    onSuccess: (data) => {
      result[s] = Number(data?.total) || 0
    },
    onError: () => {
      result[s] = null
    },
  })))
  if (seq === countsSeq) counts.value = result
}

const refresh = async () => {
  await Promise.all([fetchList(), fetchCounts(true)])
}

watch(() => route.query, () => {
  selected.value = []
  exportProblems.value = []
  syncKeyword()
  fetchList()
  fetchCounts()
}, { deep: true })
onMounted(() => {
  fetchList()
  fetchCounts()
  loadCarriers()
})

const tabs = computed<WTabItem[]>(() => [
  { key: 'all', label: t('common.status.all'), count: counts.value.all ?? null },
  ...DN_STAGE_TABS.map((s) => {
    const count = counts.value[s] ?? null
    return {
      key: s,
      label: t(`shipping.stage.${s}`),
      count,
      attention: DN_ATTENTION_STAGES.includes(s) && !!count,
      error: s === 'exception' && !!count,
    }
  }),
])
const activeTab = computed({
  get: () => stage.value,
  set: (key: string) => go({ shipping_stage: key === 'all' ? undefined : key }),
})
const headerCount = computed(() => counts.value.all ?? pageData.value?.total ?? null)

// ------------------ 筛选 ----------------------
const keyword = ref('')
const syncKeyword = () => {
  const value = String(route.query.keyword ?? '')
  if (value.trim() !== keyword.value.trim()) keyword.value = value
}
syncKeyword()
let keywordTimer: ReturnType<typeof setTimeout> | null = null
const applyKeyword = () => {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = null
  const value = keyword.value.trim()
  if (value !== String(route.query.keyword ?? '').trim()) go({ keyword: value })
}
watch(keyword, () => {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(applyKeyword, 500)
})
onBeforeUnmount(() => {
  if (keywordTimer) clearTimeout(keywordTimer)
})

const statusOptions = computed<WFilterOption<string>[]>(() =>
  DN_STATUSES.map((s) => ({ value: s, label: t(`dn.status.${s}`) })))
const statusFilter = computed({
  get: () => (route.query.status ? String(route.query.status) : null),
  set: (value: string | null) => go({ status: value }),
})

// 承运商（筛选选项、每行的运单 / 揽收方式、文件方式的批量操作）
const carriers = ref<DnCarrierInfo[]>([])
const carrierNames = ref<Record<number, string>>({})
const loadCarriers = async () => {
  await httpRequest<any>('/api/warehouse/carrier/', {
    method: 'GET',
    params: { all: true },
    onSuccess: (data) => {
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
      carriers.value = items.map((c: any) => ({
        id: Number(c.id),
        waybill_method: c.waybill_method,
        pickup_method: c.pickup_method,
        tracking_method: c.tracking_method,
        tracking_url_template: c.tracking_url_template,
        is_active: c.is_active !== false,
      }))
      carrierNames.value = Object.fromEntries(items.map((c: any) => [Number(c.id), String(c.name || c.code || c.id)]))
    },
  })
}
const carrierOf = (id: unknown): DnCarrierInfo | null =>
  (id === null || id === undefined ? null : carriers.value.find((c) => c.id === Number(id)) || null)
const carrierOptions = computed<WFilterOption<number>[]>(() =>
  carriers.value.map((c) => ({ value: c.id, label: carrierNames.value[c.id] || String(c.id) })))
const carrierFilter = computed({
  get: () => (route.query.carrier_id ? Number(route.query.carrier_id) : null),
  set: (value: number | null) => go({ carrier_id: value }),
})

// 更多筛选：发货类型、收货方
const DN_TYPES = ['shipping', 'return_to_supplier', 'damage_to_supplier', 'transfer']
const typeOptions = computed<WFilterOption<string>[]>(() => DN_TYPES.map((v) => ({ value: v, label: t(`dn.type.${v}`) })))
const typeFilter = computed({
  get: () => (route.query.dn_type ? String(route.query.dn_type) : null),
  set: (value: string | null) => go({ dn_type: value }),
})
const moreCount = computed(() => (route.query.dn_type ? 1 : 0) + (route.query.recipient_id ? 1 : 0))
const moreOpen = ref(moreCount.value > 0)
const recipientFilter = computed({
  get: () => (route.query.recipient_id ? Number(route.query.recipient_id) : null),
  set: (value: number | null) => go({ recipient_id: value }),
})
const recipientLabel = ref('')
const searchRecipients = async (q: string): Promise<WComboboxOption<number>[]> => {
  const data = await httpRequest<PaginationData>('/api/warehouse/recipient/', {
    method: 'GET', params: { per_page: 20, keyword: q || undefined },
  })
  return (data?.items || []).map((r: any) => ({ value: Number(r.id), label: String(r.name || r.id) }))
}
const onRecipient = (option: WComboboxOption<number> | null) => {
  recipientLabel.value = option?.label || ''
}
const clearFilters = () => {
  keyword.value = ''
  go({ keyword: undefined, status: undefined, carrier_id: undefined, dn_type: undefined, recipient_id: undefined })
}

// ------------------ 文件方式的批量操作 ----------------------
/** 导出 / 导回要发货的权限（与建运单相同：打包或配送的编辑权限） */
const canShipEdit = computed(() => staffStore.hasPermission('packing_edit', 'delivery_edit'))
/** 运单方式 = 文件的承运商（启用中的） */
const fileCarriers = computed<FileCarrierOption[]>(() => carriers.value
  .filter((c: any) => c.waybill_method === 'file' && c.is_active !== false)
  .map((c) => ({ id: c.id, name: carrierNames.value[c.id] || String(c.id) })))
const fileMode = computed(() => fileCarriers.value.length > 0 && canShipEdit.value)
const rowCarrierId = (row: any): number | null => {
  const id = row?.shipping?.carrier_id ?? row?.carrier_id ?? row?.carrier?.id
  return id === null || id === undefined || id === '' ? null : Number(id)
}
const rowCarrierName = (row: any): string =>
  String(row?.shipping?.carrier_name || row?.carrier?.name || carrierNames.value[rowCarrierId(row) ?? -1] || '')
/** 能勾选：运单方式 = 文件的承运商，且在待建运单 / 待导回运单号 */
const rowSelectable = (row: any) => fileMode.value && FILE_STAGES.includes(String(row?.shipping_stage))
  && fileCarriers.value.some((c) => c.id === rowCarrierId(row))

const selected = ref<(string | number)[]>([])
const selectedRows = computed<any[]>(() => rows.value.filter((row) => selected.value.includes(row.id)))
const selectedCarrier = computed<FileCarrierOption | null>(() => {
  const { carrierId } = dnExportCarrier(selectedRows.value)
  return fileCarriers.value.find((c) => c.id === carrierId) || null
})
/** 勾选的都在同一个仓库时传给后端（批次按仓库记） */
const selectedWarehouse = computed<{ id: number; name: string } | null>(() => {
  const list = [...new Map(selectedRows.value.map((row) => [row.warehouse_id ?? row.warehouse?.id, row.warehouse])).entries()]
  if (list.length !== 1 || list[0]![0] === null || list[0]![0] === undefined) return null
  return { id: Number(list[0]![0]), name: String(list[0]![1]?.name || '') }
})
const selectionContext = computed(() =>
  [selectedCarrier.value?.name || '', selectedWarehouse.value?.name || ''].filter(Boolean).join(' · '))

const exporting = ref(false)
const exportProblems = ref<ExportProblemRow[]>([])
const exportRows = async (list: any[]) => {
  if (exporting.value || !list.length) return
  exportProblems.value = []
  const title = t('shipping.file.batch-export-title')
  const { carrierId, missing, mixed } = dnExportCarrier(list)
  if (missing.length) {
    wAlert({ title, message: t('shipping.file.batch-no-carrier', { dns: missing.map((id) => `DN-${id}`).join(', ') }), tone: 'warning' })
    return
  }
  if (mixed) {
    const names = [...new Set(list.map(rowCarrierName).filter(Boolean))]
    wAlert({ title, message: t('shipping.file.batch-mixed-carriers', { carriers: names.join(t('shipping.list-separator')) || '—' }), tone: 'warning' })
    return
  }
  const carrier = fileCarriers.value.find((c) => c.id === carrierId)
  if (!carrier) {
    wAlert({ title, message: t('shipping.file.batch-not-file', { carrier: rowCarrierName(list[0]) || '—' }), tone: 'warning' })
    return
  }
  const warehouses = [...new Set(list.map((row) => row.warehouse_id ?? row.warehouse?.id ?? null))]
  exporting.value = true
  let fileName: string | null = null
  try {
    fileName = await exportCarrierFile({
      carrier_id: carrier.id,
      dn_ids: list.map((row) => Number(row.id)),
      warehouse_id: warehouses.length === 1 && warehouses[0] !== null ? Number(warehouses[0]) : null,
    })
  } catch (e) {
    const error = e as HttpRequestError
    if (error.code === CARRIER_FILE_BIZ_CODES.EXPORT_PROBLEMS) exportProblems.value = exportProblemRows(error)
    if (!exportProblems.value.length) showToast(bizErrorMessage(error), 'error')
  } finally {
    exporting.value = false
  }
  if (fileName) {
    showToast(t('shipping.file.batch-exported-toast', { count: list.length, file: fileName }), 'success')
    selected.value = []
    await refresh()
  }
}

const importOpen = ref(false)
const importCarrierId = ref<number | null>(null)
const importWarehouseId = ref<number | null>(null)
const openImport = (carrierId: number | null = null, warehouseId: number | null = null) => {
  importCarrierId.value = carrierId ?? selectedCarrier.value?.id ?? (fileCarriers.value.length === 1 ? fileCarriers.value[0]!.id : null)
  importWarehouseId.value = warehouseId ?? selectedWarehouse.value?.id ?? null
  importOpen.value = true
}
const onImported = async () => {
  selected.value = []
  await refresh()
}

const batchesOpen = ref(false)
/** 筛选条右侧的「最近的文件」：在待建运单 / 待导回运单号页签、有文件方式的承运商时 */
const showRecentFiles = computed(() => fileMode.value && FILE_STAGES.includes(stage.value))

// ------------------ 行 ----------------------
const allWarehouses = computed(() => !warehouseStore.currentWarehouse)
const columns = computed<WTableColumn<any>[]>(() => [
  { key: 'dn', label: t('dn.list.columns.dn') },
  { key: 'recipient', label: t('dn.list.columns.recipient') },
  { key: 'goods', label: t('dn.list.columns.goods'), muted: true },
  { key: 'progress', label: t('dn.list.columns.progress') },
  { key: 'carrier', label: t('dn.list.columns.carrier') },
  ...(allWarehouses.value ? [{ key: 'warehouse', label: t('common.entities.warehouse'), muted: true }] : []),
  { key: 'date', label: t('dn.list.columns.date') },
  { key: 'next', label: t('dn.list.columns.next'), align: 'right' as const },
])

const regionText = (row: any): string => {
  const ship = row?.ship_to && typeof row.ship_to === 'object' ? row.ship_to : null
  const country = String(ship?.country || '').toUpperCase()
  const city = ship?.locality || ship?.admin_area || ''
  return [country ? countryName(country, locale.value) : '', city].filter(Boolean).join(' · ')
}
const goodsText = (row: any) => t('dn.list.goods', {
  kinds: (Number(row?.detail_count) || 0).toLocaleString(locale.value),
  qty: (Number(row?.total_quantity) || 0).toLocaleString(locale.value),
})
const stageText = (row: any) => (row?.shipping_stage ? t(`shipping.stage.${row.shipping_stage}`) : '')
const toneOf = (row: any) => dnStageTone(row?.shipping_stage, row?.status)
const segmentsOf = (row: any) => dnProgressSegments(row?.shipping_stage, row?.status, {
  customs: !!row?.is_export, hasTracking: !!row?.shipping?.tracking_number,
})
const dateOf = (row: any) => dnPlannedDate(row?.expected_shipping_date, zonedToday(resolveTimeZone(row)))
const nextOf = (row: any): DnNextStep => dnNextStep(row, carrierOf(rowCarrierId(row)))
/** 下一步要这个人能做才给按钮：开始作业要 dn_edit；导出 / 导回要打包或配送的编辑权限；其余进详情去做 */
const nextRun = (row: any): DnNextStep['run'] | null => {
  const step = nextOf(row)
  if (step.run === 'progress') return staffStore.hasPermission('dn_edit') ? 'progress' : null
  if (step.run === 'export' || step.run === 'import') return canShipEdit.value ? step.run : 'open'
  return step.run ?? null
}
const signedText = (row: any) => {
  const at = row?.completed_at
  return at ? t('dn.list.next.signed', { date: formatInTimeZone(at, 'MM/DD', resolveTimeZone(row), { withZone: false }) }) : ''
}

const openRow = (row: any) => router.push(`/dn/detail/${row.id}`)
const onNext = async (row: any) => {
  switch (nextRun(row)) {
    case 'progress':
      if (await start(row.id)) await refresh()
      return
    case 'export':
      await exportRows([row])
      return
    case 'import':
      openImport(rowCarrierId(row), row.warehouse_id ?? null)
      return
    default:
      await openRow(row)
  }
}

// ------------------ 分页 ----------------------
const currentPage = computed({
  get: () => page.value,
  set: (value: number) => go({ page: value > 1 ? value : undefined }, true),
})
const rangeText = computed(() => {
  const data = pageData.value
  if (!data || !data.total) return ''
  const from = (data.page - 1) * data.per_page + 1
  const to = Math.min(data.total, from + rows.value.length - 1)
  return t('dn.list.range', {
    from: from.toLocaleString(locale.value), to: to.toLocaleString(locale.value), total: data.total.toLocaleString(locale.value),
  })
})
</script>

<template>
  <div class="w-dnl w-scope">
    <div class="w-dnl__head">
      <div class="w-dnl__title">
        <h1>{{ t('nav.DN') }}</h1>
        <span v-if="headerCount !== null" class="w-dnl__count">{{ t('dn.list.count', { count: headerCount.toLocaleString(locale) }, headerCount) }}</span>
      </div>
      <div class="w-dnl__actions">
        <WButton v-if="fileMode" icon="asn" @click="openImport()">{{ t('shipping.actions.import_numbers') }}</WButton>
        <WButton v-if="staffStore.hasPermission('dn_edit')" variant="primary" icon="plus" to="/dn/add">{{ t('dn.list.new') }}</WButton>
      </div>
    </div>

    <section class="w-dnl__card" :aria-label="t('dn.list.label')">
      <WTabs inset v-model="activeTab" class="w-dnl__tabs" :items="tabs" :label="t('dn.list.tabs-label')" :panel-id="panelId" />

      <div class="w-dnl__filters">
        <WInput v-model="keyword" class="w-dnl__search" clearable :placeholder="t('dn.list.search-placeholder')"
          :aria-label="t('dn.list.search-label')" @keydown.enter.prevent="applyKeyword" @clear="applyKeyword">
          <template #prefix><WIcon name="search" :size="16" /></template>
        </WInput>
        <WFilterSelect v-model="statusFilter" :label="t('shipping.dn.status-filter')" :options="statusOptions" />
        <WFilterSelect v-model="carrierFilter" :label="t('common.entities.carrier')" :options="carrierOptions" />
        <WButton variant="text" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
          {{ moreOpen ? t('dn.list.fewer-filters') : t('dn.list.more-filters') }}<template v-if="moreCount && !moreOpen"> · {{ moreCount }}</template>
        </WButton>
        <WButton v-if="hasFilters" variant="text" @click="clearFilters">{{ t('dn.list.clear-filters') }}</WButton>
        <span class="w-dnl__spacer" />
        <WButton v-if="showRecentFiles && !selected.length" variant="text" @click="batchesOpen = true">{{ t('shipping.file.recent-files') }}</WButton>
      </div>
      <div v-if="moreOpen" class="w-dnl__filters w-dnl__filters--more">
        <WFilterSelect v-model="typeFilter" :label="t('dn.fields.type')" :options="typeOptions" />
        <div class="w-dnl__recipient">
          <WCombobox v-model="recipientFilter" :search="searchRecipients" :selected-label="recipientLabel || (recipientFilter ? `#${recipientFilter}` : '')"
            clearable :placeholder="t('dn.list.recipient-placeholder')" :aria-label="t('common.entities.recipient')"
            @select="onRecipient" />
        </div>
      </div>

      <!-- 批量操作条：勾选了文件方式的发货单 -->
      <div v-if="selected.length" class="w-dnl__batch" role="region" :aria-label="t('dn.list.batch-label')">
        <span class="w-dnl__batch-count">{{ t('shipping.file.batch-selected', { count: selected.length }) }}</span>
        <span v-if="selectionContext" class="w-dnl__batch-context">{{ selectionContext }}</span>
        <span class="w-dnl__spacer" />
        <WButton variant="text" size="sm" @click="batchesOpen = true">{{ t('shipping.file.recent-files') }}</WButton>
        <WButton variant="text" size="sm" @click="selected = []">{{ t('dn.list.clear-selection') }}</WButton>
        <WButton size="sm" @click="openImport()">{{ t('shipping.actions.import_numbers') }}</WButton>
        <WButton variant="primary" size="sm" icon="asn" :loading="exporting" @click="exportRows(selectedRows)">
          {{ t('shipping.file.export-csv') }}
        </WButton>
        <WHelp :text="t('dn.list.export-help')" />
      </div>

      <div v-if="exportProblems.length" class="w-dnl__problems">
        <CarrierExportProblems :rows="exportProblems" closable @close="exportProblems = []" />
      </div>

      <div :id="panelId" role="tabpanel" :aria-labelledby="undefined">
        <WAlert v-if="loadError && !loading" tone="block" :title="loadError" class="w-dnl__error">
          <template #actions><WButton size="sm" @click="refresh">{{ t('dn.list.retry') }}</WButton></template>
        </WAlert>
        <WTable v-else v-model:selected="selected" :columns="columns" :rows="rows" :loading="loading && !pageData"
          :selectable="fileMode" :row-selectable="rowSelectable" clickable inset valign="top" :skeleton-rows="8"
          :caption="t('nav.DN')" @row-click="openRow">
          <template #cell-dn="{ row }">
            <div class="w-dnl__stack">
              <NuxtLink :to="`/dn/detail/${row.id}`" class="w-dnl__dn">DN-{{ row.id }}</NuxtLink>
              <span v-if="row.order_number" class="w-dnl__sub">{{ row.order_number }}</span>
            </div>
          </template>
          <template #cell-recipient="{ row }">
            <div class="w-dnl__stack">
              <span class="w-dnl__name">{{ row.recipient?.name || '' }}</span>
              <span v-if="regionText(row)" class="w-dnl__sub">{{ regionText(row) }}</span>
            </div>
          </template>
          <template #cell-goods="{ row }">{{ goodsText(row) }}</template>
          <template #cell-progress="{ row }">
            <div class="w-dnl__progress">
              <WStatus :tone="toneOf(row)" muted>{{ stageText(row) }}</WStatus>
              <span class="w-dnl__segments" :class="`is-${toneOf(row)}`" aria-hidden="true">
                <span v-for="(seg, i) in segmentsOf(row)" :key="i" class="w-dnl__seg" :class="`is-${seg}`" />
              </span>
              <span class="w-dnl__sub">{{ t('dn.list.doc-status', { status: t(`dn.status.${row.status}`) }) }}</span>
            </div>
          </template>
          <template #cell-carrier="{ row }">
            <div class="w-dnl__stack">
              <span>{{ rowCarrierName(row) }}</span>
              <span v-if="row.shipping?.tracking_number" class="w-dnl__sub w-dnl__mono">{{ row.shipping.tracking_number }}</span>
            </div>
          </template>
          <template #cell-warehouse="{ row }">{{ row.warehouse?.name || '' }}</template>
          <template #cell-date="{ row }">
            <span v-if="dateOf(row)" class="w-dnl__date" :class="{ 'is-today': dateOf(row)?.isToday }">
              {{ dateOf(row)?.isToday ? t('dn.list.today', { date: dateOf(row)?.text }) : dateOf(row)?.text }}
            </span>
          </template>
          <template #cell-next="{ row }">
            <div class="w-dnl__next">
              <template v-if="nextOf(row).kind === 'action' && nextRun(row)">
                <WButton size="sm" :loading="actionBusy === `start-${row.id}` || (exporting && nextRun(row) === 'export')"
                  @click="onNext(row)">{{ t(`dn.list.next.${nextOf(row).key}`) }}</WButton>
              </template>
              <WButton v-else-if="nextOf(row).kind === 'problem'" size="sm" variant="danger" @click="onNext(row)">
                {{ t(`dn.list.next.${nextOf(row).key}`) }}
              </WButton>
              <a v-else-if="nextOf(row).kind === 'link'" :href="nextOf(row).href" target="_blank" rel="noopener" class="w-dnl__ext">
                {{ t(`dn.list.next.${nextOf(row).key}`) }}<WIcon name="external" :size="12" />
              </a>
              <span v-else-if="nextOf(row).kind === 'info'" class="w-dnl__info">
                {{ nextOf(row).key === 'signed' ? signedText(row) : t(`dn.list.next.${nextOf(row).key}`) }}
              </span>
              <DnActionsMenu :dn-id="row.id" :status="row.status" @changed="refresh" @deleted="refresh" />
            </div>
          </template>
          <template #empty>
            <WEmptyState v-if="hasFilters || stage !== 'all'" :title="t('dn.list.empty-filtered')" icon="search-off" compact>
              <template v-if="hasFilters" #action><WButton size="sm" @click="clearFilters">{{ t('dn.list.clear-filters') }}</WButton></template>
            </WEmptyState>
            <WEmptyState v-else :title="t('dn.list.empty')" icon="dn" compact>
              <template v-if="staffStore.hasPermission('dn_edit')" #action>
                <WButton size="sm" variant="primary" to="/dn/add">{{ t('dn.list.new') }}</WButton>
              </template>
            </WEmptyState>
          </template>
        </WTable>
      </div>

      <div v-if="pageData && pageData.total > 0" class="w-dnl__foot">
        <span>{{ rangeText }}</span>
        <WPagination v-model:page="currentPage" :page-count="pageData.pages" />
      </div>
    </section>

    <CarrierImportModal v-model:open="importOpen" :carriers="fileCarriers" :carrier-id="importCarrierId"
      :warehouse-id="importWarehouseId" @imported="onImported" />
    <CarrierFileBatches v-model:open="batchesOpen" :carriers="fileCarriers" :carrier-id="selectedCarrier?.id ?? null"
      :warehouse-id="selectedWarehouse?.id ?? null" />
  </div>
</template>

<style scoped>
/* 列表占满内容区宽度 */
.w-dnl {
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-16);
}
.w-dnl__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.w-dnl__title { display: flex; align-items: baseline; gap: 12px; }
.w-dnl__title h1 {
  margin: 0;
  font-size: var(--w-fs-24);
  line-height: var(--w-lh-24);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-dnl__count { font-size: var(--w-fs-13); line-height: var(--w-lh-13); color: var(--w-text-2); }
.w-dnl__actions { display: flex; flex-wrap: wrap; gap: 8px; }

.w-dnl__card {
  --w-card-pad: 20px;
  overflow: hidden;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
}
.w-dnl__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px var(--w-card-pad);
  border-bottom: 1px solid var(--w-line);
}
.w-dnl__filters--more { padding-top: 0; border-bottom: 1px solid var(--w-line); }
.w-dnl__search { width: 300px; max-width: 100%; }
.w-dnl__recipient { width: 260px; max-width: 100%; }
.w-dnl__spacer { flex: 1; }

.w-dnl__batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px var(--w-card-pad);
  border-bottom: 1px solid var(--w-sel-line);
  background: var(--w-sel-soft);
}
.w-dnl__batch-count {
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  font-weight: var(--w-fw-semibold);
  color: var(--w-sel-text);
}
.w-dnl__batch-context { font-size: var(--w-fs-13); color: var(--w-text-2); }
.w-dnl__problems { padding: 12px var(--w-card-pad); border-bottom: 1px solid var(--w-line); }
.w-dnl__error { margin: 16px var(--w-card-pad); }

.w-dnl__stack { display: flex; flex-direction: column; min-width: 0; }
.w-dnl__dn {
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
  text-decoration: none;
  white-space: nowrap;
}
.w-dnl__dn:hover { color: var(--w-link); }
.w-dnl__name { font-weight: var(--w-fw-medium); white-space: nowrap; }
.w-dnl__sub {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
  white-space: nowrap;
}
.w-dnl__mono { font-variant-numeric: tabular-nums; }

.w-dnl__progress { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.w-dnl__progress :deep(.w-status) { font-size: var(--w-fs-13); }
.w-dnl__segments { display: flex; gap: 3px; }
.w-dnl__seg {
  width: 12px;
  height: 4px;
  border-radius: 2px;
  background: var(--w-line);
}
.w-dnl__seg.is-done { background: var(--w-nontext); }
.w-dnl__segments.is-warn .w-dnl__seg.is-current { background: var(--w-warn-dot); }
.w-dnl__segments.is-info .w-dnl__seg.is-current { background: var(--w-info-dot); }
.w-dnl__segments.is-bad .w-dnl__seg.is-current { background: var(--w-bad-dot); }
.w-dnl__segments.is-ok .w-dnl__seg.is-current { background: var(--w-nontext); }

.w-dnl__date { color: var(--w-text-2); white-space: nowrap; }
.w-dnl__date.is-today { color: var(--w-text-1); font-weight: var(--w-fw-medium); }

.w-dnl__next {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  white-space: nowrap;
}
.w-dnl__info { color: var(--w-text-3); }
.w-dnl__ext {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--w-link);
  text-decoration: none;
}
.w-dnl__ext:hover { color: var(--w-link-hover); }

.w-dnl__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px var(--w-card-pad);
  border-top: 1px solid var(--w-line);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-3);
}
@media (max-width: 767.98px) {
  .w-dnl__search, .w-dnl__recipient { width: 100%; }
}
.w-dnl :deep(.w-table) { border-collapse:collapse; }
.w-dnl :deep(.w-table thead th) { height:auto; padding-top:10px; padding-bottom:8px; line-height:16px; }
.w-dnl :deep(.w-table__head) { vertical-align:top; }
.w-dnl__dn { font-size:14px; line-height:20px; }
</style>
