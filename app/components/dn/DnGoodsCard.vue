<script lang="ts" setup>
/**
 * 发货单详情的商品明细（设计稿 Main「商品 12 种 · 14 件」）：商品（缩略图、名称链商品详情、编码 · 品牌）、数量（关键列）、
 * 已拣、已打包、已发货、备注；0 留空；合计行。超过 5 种时先显示 5 种、「还有 N 种商品 · 展开」。
 * 右上角：拣货之后有没有数量差异（拣 / 打包 / 发货的数量与计划不一致的行数）。
 */
import type { WTableColumn } from '~/components/w/WTable.vue'
import { goodsDifferences } from '~/utils/dnFlowDisplay'

const props = defineProps<{
  dn: Record<string, any> | null
}>()

const FOLD_AT = 5
const { t, locale } = useI18n()
const expanded = ref(false)

const details = computed<any[]>(() => props.dn?.details || [])
const rows = computed(() => (expanded.value ? details.value : details.value.slice(0, FOLD_AT)))
const hidden = computed(() => Math.max(0, details.value.length - FOLD_AT))
const diffs = computed(() => goodsDifferences(details.value, props.dn?.status))
const n = (v: unknown) => (Number(v) || 0).toLocaleString(locale.value)

const columns = computed<WTableColumn<any>[]>(() => [
  { key: 'goods', label: t('dn.detail.goods.goods'), wrap: true },
  { key: 'quantity', label: t('dn.detail.goods.quantity'), type: 'qty', strong: true, width: '72px' },
  { key: 'picked_quantity', label: t('common.quantities.picked'), type: 'qty', muted: true, width: '72px' },
  { key: 'packed_quantity', label: t('common.quantities.packed'), type: 'qty', muted: true, width: '72px' },
  { key: 'delivered_quantity', label: t('dn.detail.goods.shipped'), type: 'qty', muted: true, width: '72px' },
  { key: 'remark', label: t('common.fields.remark'), muted: true, wrap: true },
])
</script>

<template>
  <WCard flush class="w-dngoods">
    <template #header>
      <div class="w-dngoods__heading">
        <h2 class="w-dngoods__title">{{ t('dn.detail.goods.title') }}</h2>
        <span class="w-dngoods__count">{{ t('dn.list.goods', { kinds: n(dn?.detail_count ?? details.length), qty: n(dn?.total_quantity) }) }}</span>
      </div>
    </template>
    <template #actions>
      <WStatus v-if="diffs" tone="warn" muted>{{ t('dn.detail.goods.diffs', { count: diffs }) }}</WStatus>
      <span v-else-if="diffs === 0" class="w-faint w-dngoods__nodiff">{{ t('dn.detail.goods.no-diff') }}</span>
    </template>
    <WTable :columns="columns" :rows="rows" inset row-key="id" :caption="t('dn.detail.goods.title')">
      <template #cell-goods="{ row }">
        <div class="w-dngoods__goods">
          <span class="w-dngoods__thumb" aria-hidden="true">
            <img v-if="row.goods?.thumbnail_url" :src="row.goods.thumbnail_url" alt="" loading="lazy">
            <WIcon v-else name="box" :size="16" />
          </span>
          <span class="w-dngoods__names">
            <NuxtLink v-if="row.goods?.id" :to="`/goods/detail/${row.goods.id}`" class="w-dngoods__name">{{ row.goods?.name }}</NuxtLink>
            <span v-else class="w-dngoods__name">{{ row.goods?.name }}</span>
            <span class="w-dngoods__code">{{ [row.goods?.code, row.goods?.brand].filter(Boolean).join(' · ') }}</span>
          </span>
        </div>
      </template>
      <template v-if="details.length" #foot>
        <tr v-if="hidden && !expanded" class="w-dngoods__more-row">
          <td :colspan="6">
            <button type="button" class="w-dngoods__more" @click="expanded = true">{{ t('dn.detail.goods.more', { count: hidden }) }}</button>
          </td>
        </tr>
        <tr>
          <td>{{ t('shipping.dn.totals') }}</td>
          <td class="w-dngoods__num">{{ n(dn?.total_quantity) }}</td>
          <td class="w-dngoods__num">{{ n(dn?.total_picked_quantity) }}</td>
          <td class="w-dngoods__num">{{ n(dn?.total_packed_quantity) }}</td>
          <td class="w-dngoods__num">{{ n(dn?.total_delivered_quantity) }}</td>
          <td />
        </tr>
      </template>
    </WTable>
  </WCard>
</template>

<style scoped>
.w-dngoods__heading { display: flex; align-items: baseline; gap: 10px; }
.w-dngoods__title { margin: 0; font-size: var(--w-fs-16); line-height: var(--w-lh-16); font-weight: var(--w-fw-semibold); }
.w-dngoods__count { font-size: var(--w-fs-13); color: var(--w-text-2); }
.w-dngoods__nodiff { font-size: var(--w-fs-12); }
.w-dngoods__goods { display: flex; align-items: flex-start; gap: 10px; min-width: 220px; }
.w-dngoods__thumb {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  color: var(--w-text-3);
}
.w-dngoods__thumb img { width: 100%; height: 100%; object-fit: cover; }
.w-dngoods__names { display: flex; flex-direction: column; min-width: 0; }
.w-dngoods__name { color: var(--w-text-1); font-weight: var(--w-fw-medium); text-decoration: none; }
.w-dngoods__name:hover { color: var(--w-link); }
.w-dngoods__code { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dngoods__num { text-align: right; }
/* 合计行贴卡片边：首尾列留出卡片内边距（与表体一致） */
.w-dngoods :deep(tfoot td:first-child) { padding-left: var(--w-card-pad); }
.w-dngoods :deep(tfoot td:last-child) { padding-right: var(--w-card-pad); }
.w-dngoods__more-row td { font-weight: var(--w-fw-regular) !important; border-top: 1px solid var(--w-line) !important; }
.w-dngoods__more {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-medium);
  cursor: pointer;
}
</style>
