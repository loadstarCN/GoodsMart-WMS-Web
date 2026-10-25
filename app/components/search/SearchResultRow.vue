<script setup lang="ts">
/**
 * 搜索结果的一行（面板与结果页共用，设计稿 TopbarSpec「全局搜索」/ SearchResults）：两行式——
 * 类型图标 · 第一行标题（主）+ 单号（次）· 第二行次要信息（命中在明细商品时该商品前写「含」）· 右侧状态（圆点 + 文字）。
 * 没有标题（库位没写描述）时单号当标题。根元素是链接（href 是真实地址，可在新标签页打开）；role、id、点击由使用方加。
 * size：sm = 面板（图标 28），md = 结果页（图标 32）。
 */
import type { GlobalSearchItem } from '~/utils/globalSearch'

const props = withDefaults(defineProps<{
  item: GlobalSearchItem
  href?: string
  size?: 'sm' | 'md'
  /** 键盘 / 鼠标选中（浅紫底） */
  active?: boolean
  /** 选中时右侧显示 Enter 提示（面板） */
  enterHint?: boolean
}>(), {
  href: undefined,
  size: 'md',
  active: false,
  enterHint: false,
})

const { t } = useI18n()
const display = useSearchDisplay()
const meta = computed(() => GLOBAL_SEARCH_TYPE_META[props.item.type])
const titleField = computed(() => (props.item.title ? 'title' : 'code'))
const titleText = computed(() => props.item.title || props.item.code || '')
const codeText = computed(() => (props.item.title ? props.item.code : null))
/** 命中在明细商品：副标题里该商品那一部分的起点（在它前面写「含」） */
const goodsAt = computed(() => {
  const subtitle = props.item.subtitle
  if (!subtitle || !matchedInDetailGoods(props.item)) return null
  return lastHighlightedSegmentStart(subtitle, highlightRanges(props.item.highlights, 'subtitle', subtitle.length))
})
const statusText = computed(() => display.statusLabel(props.item.status))
</script>

<template>
  <a :href="href" class="w-sr-row" :class="[`w-sr-row--${size}`, { 'is-active': active }]">
    <span class="w-sr-row__icon" aria-hidden="true"><WIcon :name="meta.icon" :size="size === 'sm' ? 14 : 16" /></span>
    <span class="w-sr-row__main">
      <span class="w-sr-row__line1">
        <span class="w-sr-row__title"><SearchHighlight :text="titleText" :highlights="item.highlights" :field="titleField" /></span>
        <span v-if="codeText" class="w-sr-row__code"><SearchHighlight :text="codeText" :highlights="item.highlights" field="code" /></span>
      </span>
      <span v-if="item.subtitle" class="w-sr-row__line2"><SearchHighlight :text="item.subtitle" :highlights="item.highlights"
        field="subtitle" :insert-at="goodsAt" :insert-text="t('search.contains')" /></span>
    </span>
    <span v-if="statusText || (enterHint && active)" class="w-sr-row__side">
      <WStatus v-if="statusText" :tone="searchStatusTone(item.status)" muted>{{ statusText }}</WStatus>
      <kbd v-if="enterHint && active" class="w-sr-row__kbd">Enter</kbd>
    </span>
  </a>
</template>

<style scoped>
.w-sr-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  color: var(--w-text-1);
  text-decoration: none;
  cursor: pointer;
}
.w-sr-row--sm {
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--w-radius-control);
}
.w-sr-row:hover { color: var(--w-text-1); }
.w-sr-row.is-active { background: var(--w-sel-soft); }
.w-sr-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--w-focus); }

.w-sr-row__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  color: var(--w-text-2);
}
.w-sr-row--sm .w-sr-row__icon { width: 28px; height: 28px; }

.w-sr-row__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.w-sr-row__line1,
.w-sr-row__line2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-sr-row__line1 {
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
}
.w-sr-row--sm .w-sr-row__line1 { line-height: 20px; }
.w-sr-row__title { font-weight: var(--w-fw-medium); }
.w-sr-row__code {
  margin-left: 8px;
  font-size: var(--w-fs-13);
  color: var(--w-text-3);
}
.w-sr-row__line2 {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}

.w-sr-row__side {
  align-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
  font-size: var(--w-fs-13);
  line-height: 20px;
  white-space: nowrap;
}
.w-sr-row--sm .w-sr-row__side { font-size: var(--w-fs-12); line-height: var(--w-lh-12); }
.w-sr-row__kbd {
  padding: 0 6px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-3);
  font-family: inherit;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  box-shadow: none;
}
</style>
