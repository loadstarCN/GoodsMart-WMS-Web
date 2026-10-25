<script setup lang="ts">
/**
 * 分页：28 方块页码，当前页浅紫底；页数多时中间用「…」。v-model:page 从 1 开始。
 * 页数由 pageCount 给，或由 total + pageSize 算；只有 1 页时不显示页码（showTotal 时仍显示总数）。
 */
const props = withDefaults(defineProps<{
  pageCount?: number
  total?: number
  pageSize?: number
  /** 当前页两侧各显示几个页码 */
  siblings?: number
  showTotal?: boolean
}>(), {
  pageSize: 20,
  siblings: 1,
  showTotal: false,
})

const page = defineModel<number>('page', { default: 1 })
const { t, locale } = useI18n()

const pages = computed(() => {
  if (props.pageCount !== undefined) return Math.max(1, props.pageCount)
  if (props.total !== undefined) return Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize)))
  return 1
})

/** 页码序列：数字或省略号（'…start' / '…end'） */
const items = computed<(number | string)[]>(() => {
  const count = pages.value
  const current = Math.min(Math.max(1, page.value), count)
  const width = props.siblings * 2 + 5 // 首、尾、当前、两侧、两个省略号
  if (count <= width) return Array.from({ length: count }, (_, i) => i + 1)
  const left = Math.max(2, current - props.siblings)
  const right = Math.min(count - 1, current + props.siblings)
  const list: (number | string)[] = [1]
  if (left > 2) list.push('…start')
  else for (let p = 2; p < left; p++) list.push(p)
  for (let p = left; p <= right; p++) list.push(p)
  if (right < count - 1) list.push('…end')
  else for (let p = right + 1; p < count; p++) list.push(p)
  list.push(count)
  return list
})

const go = (target: number) => {
  const next = Math.min(Math.max(1, target), pages.value)
  if (next !== page.value) page.value = next
}
const totalText = computed(() =>
  props.total !== undefined ? t('w.pagination.total', { total: props.total.toLocaleString(locale.value) }) : '')
</script>

<template>
  <div class="w-pagination">
    <span v-if="showTotal && total !== undefined" class="w-pagination__total">{{ totalText }}</span>
    <nav v-if="pages > 1" class="w-pagination__nav" :aria-label="t('w.pagination.label')">
      <button type="button" class="w-pagination__item" :disabled="page <= 1" :aria-label="t('w.pagination.previous')"
        @click="go(page - 1)">
        <WIcon name="chevron-left" :size="14" :stroke-width="2" />
      </button>
      <template v-for="item in items" :key="item">
        <span v-if="typeof item === 'string'" class="w-pagination__gap" aria-hidden="true">…</span>
        <button v-else type="button" class="w-pagination__item" :class="{ 'is-current': item === page }"
          :aria-current="item === page ? 'page' : undefined" :aria-label="t('w.pagination.page', { page: item })"
          @click="go(item)">
          {{ item }}
        </button>
      </template>
      <button type="button" class="w-pagination__item" :disabled="page >= pages" :aria-label="t('w.pagination.next')"
        @click="go(page + 1)">
        <WIcon name="chevron-right" :size="14" :stroke-width="2" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.w-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--w-sp-12);
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-pagination__total { color: var(--w-text-3); }
.w-pagination__nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.w-pagination__item,
.w-pagination__gap {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
}
.w-pagination__item {
  border: 1px solid transparent;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-2);
  font: inherit;
  cursor: pointer;
}
.w-pagination__item:hover:not(:disabled):not(.is-current) { background: var(--w-surface-2); color: var(--w-text-1); }
.w-pagination__item:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-pagination__item:disabled { color: var(--w-nontext); cursor: not-allowed; }
.w-pagination__item.is-current {
  border-color: var(--w-sel-line);
  background: var(--w-sel-soft);
  color: var(--w-sel-text);
  font-weight: var(--w-fw-semibold);
}
.w-pagination__gap { color: var(--w-text-3); }
</style>
