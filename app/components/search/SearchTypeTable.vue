<script setup lang="ts">
/**
 * 结果页单类型页签的表格（设计稿 SearchResults「发货单页签：完整列表」与商品 / 库位页签的列）：列按类型变化，
 * 取值来自 columns（只搜一类时后端才给）。第一列为主：两行（标题 + 单号 / 次要信息），命中部分按 highlights 加底色；
 * 还没有运单号等空值留空。范围是「全部仓库」时加一列仓库。整行可点：打开结果（别的仓库的记录先切换页头仓库）。
 */
import type { WTableColumn } from '~/components/w/WTable.vue'
import type { GlobalSearchItem, GlobalSearchType } from '~/utils/globalSearch'
import { countryName } from '~/data/countries'

const props = withDefaults(defineProps<{
  type: GlobalSearchType
  items: GlobalSearchItem[]
  loading?: boolean
  showWarehouse?: boolean
  caption?: string
}>(), {
  loading: false,
  showWarehouse: false,
  caption: undefined,
})

const { t, locale } = useI18n()
const navigation = useSearchNavigation()
const display = useSearchDisplay()
const { locationTypeLabel } = useOptionLabel()

type Column = WTableColumn<GlobalSearchItem>
const col = (row: GlobalSearchItem, key: string): any => row.columns?.[key] ?? null
const isTask = computed(() => !['dn', 'asn', 'goods', 'location', 'recipient'].includes(props.type))

const columns = computed<Column[]>(() => {
  const warehouse: Column[] = props.showWarehouse
    ? [{ key: 'warehouse', label: t('search.columns.warehouse'), muted: true, value: (row) => col(row, 'warehouse_name') }]
    : []
  const status: Column = { key: 'status', label: t('search.columns.status'), width: '140px' }
  switch (props.type) {
    case 'dn':
      return [
        { key: 'main', label: t('search.columns.dn-main') },
        { key: 'carrier', label: t('search.columns.carrier'), width: '200px' },
        { key: 'date', label: t('search.columns.shipping-date'), width: '120px' },
        status,
        ...warehouse,
      ]
    case 'asn':
      return [
        { key: 'main', label: t('search.columns.asn-main') },
        { key: 'tracking', label: t('search.columns.tracking'), width: '180px' },
        { key: 'date', label: t('search.columns.arrival-date'), width: '120px' },
        status,
        ...warehouse,
      ]
    case 'goods':
      return [
        { key: 'main', label: t('search.columns.goods') },
        { key: 'available', label: t('search.columns.available'), type: 'qty', strong: true, keepZero: true, width: '96px',
          value: (row) => col(row, 'available_stock_for_sale') },
        { key: 'onhand', label: t('search.columns.onhand'), type: 'qty', muted: true, keepZero: true, width: '96px',
          value: (row) => col(row, 'onhand_stock') },
      ]
    case 'location':
      return [
        { key: 'main', label: t('search.columns.location-code') },
        { key: 'location_type', label: t('search.columns.location-type'), muted: true, width: '140px',
          value: (row) => locationTypeLabel(col(row, 'location_type')) },
        ...warehouse,
        { key: 'goods_count', label: t('search.columns.goods-count'), type: 'qty', muted: true, width: '96px',
          value: (row) => col(row, 'goods_count'),
          format: (value) => t('search.kinds', { count: Number(value).toLocaleString(locale.value) }, Number(value)) },
        { key: 'quantity', label: t('search.columns.quantity'), type: 'qty', strong: true, width: '96px',
          value: (row) => col(row, 'quantity') },
      ]
    case 'recipient':
      return [
        { key: 'main', label: t('search.columns.recipient') },
        { key: 'locality', label: t('search.columns.locality'), muted: true, value: (row) => col(row, 'locality') },
        { key: 'admin_area', label: t('search.columns.admin-area'), muted: true, value: (row) => col(row, 'admin_area') },
        { key: 'country', label: t('search.columns.country'), muted: true,
          value: (row) => (col(row, 'country') ? countryName(col(row, 'country'), locale.value) : null) },
      ]
    default:
      return [
        { key: 'main', label: t('search.columns.task') },
        ...(props.type === 'cyclecount' ? [] : [{ key: 'related', label: t('search.columns.related'), width: '140px' }]),
        status,
        ...warehouse,
      ]
  }
})

/** 第一列的第一行：任务是编号；库位是库位码；其余是标题（没有时编号） */
const mainField = (row: GlobalSearchItem): 'code' | 'title' =>
  (isTask.value || row.type === 'location' || !row.title ? 'code' : 'title')
/** 任务第一行编号后面的名称（盘点任务名、调整原因）；与关联单号相同时（拣货等的标题就是关联单号）不重复 */
const taskName = (row: GlobalSearchItem) => (row.title && row.title !== col(row, 'related_code') ? row.title : null)
const goodsAt = (row: GlobalSearchItem) => {
  if (!row.subtitle || !matchedInDetailGoods(row)) return null
  return lastHighlightedSegmentStart(row.subtitle, highlightRanges(row.highlights, 'subtitle', row.subtitle.length))
}
/** 计划发货 / 预计到货（每行算一次） */
const dates = computed(() => new Map(props.items.map((row) => [
  `${row.type}-${row.id}`,
  display.dateLabel(col(row, props.type === 'dn' ? 'expected_shipping_date' : 'expected_arrival_date'), row.warehouse_id),
])))
const relatedOf = (row: GlobalSearchItem) => {
  const hint = col(row, 'related_url_hint')
  return hint && typeof hint === 'object' ? { url_hint: hint, warehouse_id: row.warehouse_id } : null
}
</script>

<template>
  <WTable :columns="columns" :rows="items" :row-key="(row) => `${row.type}-${row.id}`" :loading="loading" clickable inset
    :caption="caption" :empty-title="t('search.no-items')" @row-click="navigation.open">
    <template #cell-main="{ row }">
      <span class="w-st-main">
        <a :href="navigation.hrefOf(row)" class="w-st-main__title" :class="{ 'is-code': mainField(row) === 'code' }"
          @click="navigation.onLinkClick($event, row)">
          <SearchHighlight :text="row[mainField(row)]" :highlights="row.highlights" :field="mainField(row)" />
          <span v-if="isTask && taskName(row)" class="w-st-main__name">
            <SearchHighlight :text="taskName(row)" :highlights="row.highlights" field="title" />
          </span>
        </a>
        <span v-if="type === 'dn' || type === 'asn'" class="w-st-main__sub">
          <span class="w-st-main__code"><SearchHighlight :text="row.code" :highlights="row.highlights" field="code" /></span>
          <template v-if="col(row, 'order_number')"> · <SearchHighlight :text="col(row, 'order_number')"
            :highlights="row.highlights" field="columns.order_number" /></template>
        </span>
        <span v-else-if="type === 'goods'" class="w-st-main__sub">
          <SearchHighlight :text="row.code" :highlights="row.highlights" field="code" />
          <template v-if="col(row, 'brand')"> · {{ col(row, 'brand') }}</template>
        </span>
        <span v-else-if="type === 'location' && row.title" class="w-st-main__sub">{{ row.title }}</span>
        <span v-else-if="isTask && row.subtitle" class="w-st-main__sub">
          <SearchHighlight :text="row.subtitle" :highlights="row.highlights" field="subtitle" :insert-at="goodsAt(row)"
            :insert-text="t('search.contains')" />
        </span>
      </span>
    </template>

    <template #cell-carrier="{ row }">
      <span class="w-st-two">
        <span>{{ col(row, 'carrier_name') }}</span>
        <span class="w-st-two__sub"><SearchHighlight :text="col(row, 'tracking_number')" :highlights="row.highlights"
          field="columns.tracking_number" /></span>
      </span>
    </template>
    <template #cell-tracking="{ row }">
      <SearchHighlight :text="col(row, 'tracking_number')" :highlights="row.highlights" field="columns.tracking_number" />
    </template>
    <template #cell-date="{ row }">
      <span v-if="dates.get(`${row.type}-${row.id}`)" :class="{ 'w-st-today': dates.get(`${row.type}-${row.id}`)?.today }">
        {{ dates.get(`${row.type}-${row.id}`)?.text }}
      </span>
    </template>
    <template #cell-status="{ row }">
      <WStatus v-if="type === 'dn' && col(row, 'shipping_stage')" :tone="shippingStageTone(col(row, 'shipping_stage'))" muted>
        {{ display.stageLabel(col(row, 'shipping_stage')) }}
      </WStatus>
      <WStatus v-else-if="row.status" :tone="searchStatusTone(row.status)" muted>{{ display.statusLabel(row.status) }}</WStatus>
    </template>
    <template #cell-related="{ row }">
      <a v-if="relatedOf(row)" :href="navigation.hrefOf(relatedOf(row)!)" class="w-st-link"
        @click="navigation.onLinkClick($event, relatedOf(row)!)">
        <SearchHighlight :text="col(row, 'related_code')" :highlights="row.highlights" field="columns.related_code" />
      </a>
      <SearchHighlight v-else :text="col(row, 'related_code')" :highlights="row.highlights" field="columns.related_code" />
    </template>
  </WTable>
</template>

<style scoped>
.w-st-main,
.w-st-two {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.w-st-main__title {
  color: var(--w-text-1);
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-medium);
  text-decoration: none;
}
.w-st-main__title.is-code { font-weight: var(--w-fw-semibold); }
.w-st-main__title:hover { color: var(--w-link-hover); }
.w-st-main__title:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
.w-st-main__name {
  margin-left: 8px;
  font-weight: var(--w-fw-regular);
  color: var(--w-text-2);
}
.w-st-main__sub,
.w-st-two__sub {
  min-height: 18px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
.w-st-main__code { color: var(--w-text-2); }
.w-st-today { color: var(--w-text-1); font-weight: var(--w-fw-semibold); }
.w-st-link {
  color: var(--w-link);
  text-decoration: none;
}
.w-st-link:hover { color: var(--w-link-hover); }
.w-st-link:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
</style>
