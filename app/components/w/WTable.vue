<script setup lang="ts" generic="R extends Record<string, any>">
/**
 * 表格：表头不铺底（12 / 500 弱化字，下边 1px 描边），行分隔线，单元格 13 / 20；行高随密度（舒适 48 / 紧凑 36）。
 *
 * 列（WTableColumn）：
 * - type：text / qty / money，决定空值规则（utils/cellDisplay）——数量 0、不适用、空文本留空；金额 0 显示弱化「0」；
 *   emptyText 写有含义的空（「未设置」）；keepZero 用于关键列 / 合计（0 照常显示）。qty / money 默认右对齐、千分位
 * - strong：关键列（可售、数量）600 字重，表头也 600；muted：次要列用次要文字色
 * - value(row) 取值、format(value, row) 自己格式化（空值规则先于 format）；复杂内容用插槽 #cell-{key}
 *
 * 其他：selectable + v-model:selected（行键数组）带勾选列，选中行浅紫底；loading 显示骨架行；没有数据时显示空状态
 * （#empty 插槽可换成带操作的 WEmptyState）。粘性表头：给 maxHeight 时表格自己滚动、表头固定；
 * 只给 stickyHeader 时表头贴在顶栏下面随页面滚动（此时表格不横向滚动，列多的表请给 maxHeight）。
 * 密度跟随页面（<html data-density>），也可以用 density 单独指定这张表。
 */
import type { CellType } from '~/utils/cellDisplay'

export interface WTableColumn<Row = any> {
  key: string
  label: string
  type?: CellType
  align?: 'left' | 'right' | 'center'
  strong?: boolean
  muted?: boolean
  keepZero?: boolean
  emptyText?: string
  width?: string
  /** 表头旁的「?」说明 */
  help?: string
  /** 允许换行（默认不换行） */
  wrap?: boolean
  value?: (row: Row) => unknown
  format?: (value: any, row: Row) => string
}

type RowKey = string | number

const props = withDefaults(defineProps<{
  columns: WTableColumn<R>[]
  rows: R[]
  rowKey?: string | ((row: R) => RowKey)
  selectable?: boolean
  /** 行可点（整行悬停变色，点击发 row-click） */
  clickable?: boolean
  density?: 'comfortable' | 'compact'
  stickyHeader?: boolean
  maxHeight?: string
  loading?: boolean
  skeletonRows?: number
  /** 给读屏软件的表格标题（看不见） */
  caption?: string
  emptyTitle?: string
  /** 表格贴着卡片边放（WCard flush）时，首尾列留出卡片内边距 */
  inset?: boolean
}>(), {
  rowKey: 'id',
  selectable: false,
  clickable: false,
  stickyHeader: false,
  loading: false,
  skeletonRows: 5,
  inset: false,
})

const selected = defineModel<RowKey[]>('selected', { default: () => [] })
const emit = defineEmits<{ 'row-click': [row: R] }>()
const { t, locale } = useI18n()

const keyOf = (row: R, index: number): RowKey => {
  if (typeof props.rowKey === 'function') return props.rowKey(row)
  const value = row[props.rowKey]
  return value === undefined || value === null ? index : value
}
const alignOf = (col: WTableColumn<R>) => col.align || (col.type === 'qty' || col.type === 'money' ? 'right' : 'left')

const cellOf = (row: R, col: WTableColumn<R>) => {
  const raw = col.value ? col.value(row) : row[col.key]
  const base = tableCellDisplay(raw, { type: col.type, keepZero: col.keepZero, emptyText: col.emptyText, locale: locale.value })
  if (!col.format) return { ...base, raw }
  const numericZero = col.type !== undefined && col.type !== 'text' && raw !== null && raw !== '' && Number(raw) === 0
  // 空值规则优先：空、0、空写词不交给 format
  if (base.text === '' || base.muted || numericZero) return { ...base, raw }
  return { text: col.format(raw, row), muted: false, raw }
}

const rowKeys = computed(() => props.rows.map((row, index) => keyOf(row, index)))
const selectedSet = computed(() => new Set(selected.value))
/** 每行先算好各单元格的显示（键、是否选中、每列的文字 / 弱化） */
const bodyRows = computed(() => props.rows.map((row, index) => {
  const key = keyOf(row, index)
  return {
    row,
    key,
    selected: selectedSet.value.has(key),
    cells: props.columns.map((col) => ({ col, ...cellOf(row, col) })),
  }
}))
const allSelected = computed(() => rowKeys.value.length > 0 && rowKeys.value.every((key) => selectedSet.value.has(key)))
const someSelected = computed(() => !allSelected.value && rowKeys.value.some((key) => selectedSet.value.has(key)))

const toggleAll = (value: boolean | unknown[] | undefined) => {
  const keys = new Set(rowKeys.value)
  const others = selected.value.filter((key) => !keys.has(key))
  selected.value = value ? [...others, ...rowKeys.value] : others
}
const toggleRow = (key: RowKey, value: boolean | unknown[] | undefined) => {
  selected.value = value ? [...selected.value.filter((k) => k !== key), key] : selected.value.filter((k) => k !== key)
}

const onRowClick = (row: R, event: MouseEvent) => {
  if (!props.clickable) return
  // 点在行内的链接、按钮、勾选框上时不当作点行
  if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label')) return
  emit('row-click', row)
}

const colspan = computed(() => props.columns.length + (props.selectable ? 1 : 0))
const sticky = computed(() => props.stickyHeader || !!props.maxHeight)
const wrapStyle = computed(() => (props.maxHeight ? { maxHeight: props.maxHeight } : undefined))
const skeletonWidths = ['72%', '48%', '60%', '36%', '54%']
</script>

<template>
  <div class="w-table-wrap" :style="wrapStyle"
    :class="{ 'is-scroll': !!maxHeight, 'is-sticky': sticky, 'is-page-sticky': stickyHeader && !maxHeight, 'is-inset': inset }">
    <!-- 密度加在 <table> 上：行高跟这张表，首尾列的内边距（inset）仍跟外面的卡片 -->
    <table class="w-table" :data-density="density" :aria-busy="loading || undefined">
      <caption v-if="caption" class="w-sr-only">{{ caption }}</caption>
      <colgroup>
        <col v-if="selectable" class="w-table__select-col">
        <col v-for="col in columns" :key="col.key" :style="col.width ? { width: col.width } : undefined">
      </colgroup>
      <thead>
        <tr>
          <th v-if="selectable" class="w-table__select" scope="col">
            <WCheckbox :model-value="allSelected" :indeterminate="someSelected" :disabled="loading || rows.length === 0"
              :aria-label="t('w.table.select-all')" @update:model-value="toggleAll" />
          </th>
          <th v-for="col in columns" :key="col.key" scope="col"
            :class="[`is-${alignOf(col)}`, { 'is-strong': col.strong }]">
            <span class="w-table__head">
              <slot :name="`head-${col.key}`" :column="col">{{ col.label }}</slot>
              <WHelp v-if="col.help" :text="col.help" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody v-if="loading">
        <tr v-for="n in skeletonRows" :key="`sk-${n}`" class="w-table__skeleton-row" aria-hidden="true">
          <td v-if="selectable" class="w-table__select" />
          <td v-for="(col, ci) in columns" :key="col.key" :class="`is-${alignOf(col)}`">
            <span class="w-table__skeleton" :style="{ width: skeletonWidths[(n + ci) % skeletonWidths.length] }" />
          </td>
        </tr>
      </tbody>
      <tbody v-else-if="rows.length === 0">
        <tr class="w-table__empty-row">
          <td :colspan="colspan">
            <slot name="empty">
              <WEmptyState :title="emptyTitle || t('w.table.empty')" compact />
            </slot>
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr v-for="item in bodyRows" :key="item.key" :class="{ 'is-selected': item.selected, 'is-clickable': clickable }"
          @click="onRowClick(item.row, $event)">
          <td v-if="selectable" class="w-table__select">
            <WCheckbox :model-value="item.selected" :aria-label="t('w.table.select-row')"
              @update:model-value="toggleRow(item.key, $event)" />
          </td>
          <td v-for="cell in item.cells" :key="cell.col.key"
            :class="[`is-${alignOf(cell.col)}`, { 'is-strong': cell.col.strong, 'is-muted': cell.col.muted, 'is-wrap': cell.col.wrap }]">
            <slot :name="`cell-${cell.col.key}`" :row="item.row" :column="cell.col" :value="cell.raw" :display="cell">
              <span :class="{ 'w-table__faint': cell.muted }">{{ cell.text }}</span>
            </slot>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="$slots.foot && !loading && rows.length > 0">
        <slot name="foot" />
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.w-table-wrap {
  --w-table-edge: 12px;
  --w-table-sticky-top: 0px;
  position: relative;
  width: 100%;
  overflow-x: auto;
  font-family: var(--w-font);
}
.w-table-wrap.is-inset { --w-table-edge: var(--w-card-pad); }
.w-table-wrap.is-scroll { overflow: auto; }
/* 跟随页面滚动的粘性表头：外层不能是滚动容器（否则 sticky 只相对外层），表头贴在顶栏下面 */
.w-table-wrap.is-page-sticky { overflow: visible; --w-table-sticky-top: var(--w-topbar-h); }

.w-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--w-text-1);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  font-variant-numeric: tabular-nums;
}
.w-table th,
.w-table td {
  padding: 0 12px;
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}
.w-table th:first-child,
.w-table td:first-child { padding-left: var(--w-table-edge); }
.w-table th:last-child,
.w-table td:last-child { padding-right: var(--w-table-edge); }

.w-table thead th {
  height: var(--w-th-h);
  border-bottom: 1px solid var(--w-border);
  background: var(--w-surface);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
}
.w-table thead th.is-strong { color: var(--w-text-2); font-weight: var(--w-fw-semibold); }
.w-table-wrap.is-sticky thead th {
  position: sticky;
  top: var(--w-table-sticky-top);
  z-index: 1;
}
.w-table__head { display: inline-flex; align-items: center; gap: 4px; }

.w-table tbody td {
  height: var(--w-row-h);
  padding-top: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--w-line);
}
.w-table tbody tr:last-child td { border-bottom: 0; }
.w-table td.is-strong { font-weight: var(--w-fw-semibold); }
.w-table td.is-muted { color: var(--w-text-2); }
.w-table td.is-wrap { white-space: normal; }
.w-table .is-right { text-align: right; }
.w-table .is-center { text-align: center; }
.w-table__faint { color: var(--w-text-3); font-weight: var(--w-fw-regular); }

/* 底色画在行上（不画在单元格上），单元格之间不会露出细缝 */
.w-table tbody tr.is-clickable { cursor: pointer; }
.w-table tbody tr.is-clickable:hover { background: var(--w-surface-2); }
.w-table tbody tr.is-selected { background: var(--w-sel-soft); }

.w-table__select-col { width: 44px; }
.w-table th.w-table__select,
.w-table td.w-table__select { width: 44px; padding-right: 0; }

.w-table__skeleton {
  display: inline-block;
  height: 12px;
  border-radius: 4px;
  background: var(--w-skeleton);
  vertical-align: middle;
}
.w-table__empty-row td { height: auto; padding: 0; border-bottom: 0; white-space: normal; }
.w-table tfoot :deep(td),
.w-table tfoot :deep(th) {
  height: var(--w-row-h);
  padding: 6px 12px;
  border-top: 1px solid var(--w-border);
  font-weight: var(--w-fw-semibold);
}
</style>
