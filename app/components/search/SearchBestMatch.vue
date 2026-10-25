<script setup lang="ts">
/**
 * 结果页的最佳匹配卡片（设计稿 SearchResults：搜商品名、搜运单号两种状态）：完整单号 / 完整运单号 / 商品编码相同时置顶。
 * 标题、单号、副标题与高亮来自搜索结果；随类型变化的几项（承运商与运单号、计划发货、可售 / 在库、库位的商品与件数……）
 * 来自 columns——「全部」页签的请求不带 columns，页面另按这一类请求一次，把同一条（detail，带 columns 和列上的高亮）
 * 传进来，回来之前只显示基本信息。
 * 操作：打开本条；任务另可打开关联单据；商品另可去库存（按编码筛）。
 */
import type { GlobalSearchItem } from '~/utils/globalSearch'

const props = withDefaults(defineProps<{
  item: GlobalSearchItem
  /** 只搜这一类时的同一条（带 columns 与 columns.<列> 的高亮） */
  detail?: GlobalSearchItem | null
}>(), {
  detail: null,
})

const { t, locale } = useI18n()
const navigation = useSearchNavigation()
const display = useSearchDisplay()
const { locationTypeLabel } = useOptionLabel()
const uid = useId()
const titleId = `${uid}-title`

const meta = computed(() => GLOBAL_SEARCH_TYPE_META[props.item.type])
const typeName = computed(() => display.typeLabel(props.item.type))
const columns = computed(() => props.detail?.columns ?? props.item.columns ?? null)
const col = (key: string): any => columns.value?.[key] ?? null
const thumbnail = computed(() => (props.item.type === 'goods' ? col('thumbnail_url') : null))
const titleField = computed(() => (props.item.title ? 'title' : 'code'))
const exactLabel = computed(() => (props.item.exact ? display.exactFieldLabel(props.item.matched_field) : ''))
const goodsAt = computed(() => {
  const subtitle = props.item.subtitle
  if (!subtitle || !matchedInDetailGoods(props.item)) return null
  return lastHighlightedSegmentStart(subtitle, highlightRanges(props.item.highlights, 'subtitle', subtitle.length))
})

/** 状态：DN 有发货阶段时用阶段（同 DN 列表），其余用单据状态 */
const status = computed(() => {
  const stage = props.item.type === 'dn' ? col('shipping_stage') : null
  if (stage) return { text: display.stageLabel(stage), tone: shippingStageTone(stage) }
  if (props.item.status) return { text: display.statusLabel(props.item.status), tone: searchStatusTone(props.item.status) }
  return null
})

/** 文字型的几项：{label, text, field?（columns 里有高亮的列）} */
const facts = computed(() => {
  const list: { key: string; label: string; text: string; field?: string }[] = []
  const add = (key: string, label: string, text: unknown, field?: string) => {
    if (text !== null && text !== undefined && text !== '') list.push({ key, label, text: String(text), field })
  }
  const type = props.item.type
  if (type === 'dn') {
    add('carrier', t('search.columns.carrier-name'), col('carrier_name'))
    add('tracking', t('search.columns.tracking'), col('tracking_number'), 'columns.tracking_number')
    add('date', t('search.columns.shipping-date'), display.dateLabel(col('expected_shipping_date'), props.item.warehouse_id)?.text)
  } else if (type === 'asn') {
    add('tracking', t('search.columns.tracking'), col('tracking_number'), 'columns.tracking_number')
    add('date', t('search.columns.arrival-date'), display.dateLabel(col('expected_arrival_date'), props.item.warehouse_id)?.text)
  } else if (type === 'location') {
    add('type', t('search.columns.location-type'), locationTypeLabel(col('location_type')))
  }
  return list
})

/** 数字型的几项（关键数字 S） */
const kpis = computed(() => {
  const type = props.item.type
  if (type === 'goods' && columns.value) {
    return [
      { key: 'available', label: t('search.columns.available'), value: Number(col('available_stock_for_sale') ?? 0), unit: t('search.unit-pcs') },
      { key: 'onhand', label: t('search.columns.onhand'), value: Number(col('onhand_stock') ?? 0), unit: t('search.unit-pcs') },
    ]
  }
  if (type === 'location' && columns.value) {
    return [
      { key: 'goods', label: t('search.columns.goods-count'), value: Number(col('goods_count') ?? 0), unit: t('search.unit-kinds') },
      { key: 'quantity', label: t('search.columns.quantity'), value: Number(col('quantity') ?? 0), unit: t('search.unit-pcs') },
    ]
  }
  return []
})

/** 任务的关联单据（分拣 → ASN，拣货 / 打包 / 配送 → DN，调整 → 来源盘点单） */
const related = computed(() => {
  const hint = col('related_url_hint')
  const code = col('related_code')
  return hint && typeof hint === 'object' && code ? { code: String(code), target: { url_hint: hint, warehouse_id: props.item.warehouse_id } } : null
})
const inventoryLink = computed(() =>
  (props.item.type === 'goods' && props.item.code ? { path: '/inventory', query: { keyword: props.item.code } } : null))
</script>

<template>
  <section class="w-best" :aria-labelledby="titleId">
    <img v-if="thumbnail" :src="thumbnail" alt="" class="w-best__thumb">
    <span v-else class="w-best__icon" aria-hidden="true"><WIcon :name="meta.icon" :size="20" /></span>

    <div class="w-best__main">
      <div class="w-best__head">
        <span class="w-best__eyebrow">
          {{ t('search.best', { type: typeName }) }}
          <WTag v-if="exactLabel" tone="info">{{ t('search.exact', { field: exactLabel }) }}</WTag>
        </span>
        <h2 :id="titleId" class="w-best__title">
          <a :href="navigation.hrefOf(item)" class="w-best__link" @click="navigation.onLinkClick($event, item)">
            <SearchHighlight :text="item.title || item.code" :highlights="item.highlights" :field="titleField" />
          </a>
          <span v-if="item.title && item.code" class="w-best__code">
            <SearchHighlight :text="item.code" :highlights="item.highlights" field="code" />
          </span>
        </h2>
        <span v-if="item.subtitle" class="w-best__sub">
          <SearchHighlight :text="item.subtitle" :highlights="item.highlights" field="subtitle" :insert-at="goodsAt"
            :insert-text="t('search.contains')" />
        </span>
      </div>

      <dl v-if="facts.length" class="w-best__facts">
        <div v-for="fact in facts" :key="fact.key" class="w-best__fact">
          <dt>{{ fact.label }}</dt>
          <dd>
            <SearchHighlight v-if="fact.field" :text="fact.text" :highlights="detail?.highlights" :field="fact.field" />
            <template v-else>{{ fact.text }}</template>
          </dd>
        </div>
      </dl>
      <dl v-if="kpis.length" class="w-best__kpis">
        <div v-for="kpi in kpis" :key="kpi.key" class="w-best__kpi">
          <dt>{{ kpi.label }}</dt>
          <dd>{{ kpi.value.toLocaleString(locale) }} <span class="w-best__unit">{{ kpi.unit }}</span></dd>
        </div>
      </dl>

      <div class="w-best__actions">
        <WButton size="sm" @click="navigation.open(item)">{{ t('search.open', { type: typeName }) }}</WButton>
        <WButton v-if="related" size="sm" @click="navigation.open(related.target)">
          {{ t('search.open-related', { code: related.code }) }}
        </WButton>
        <WButton v-if="inventoryLink" size="sm" :to="inventoryLink">{{ t('search.stock') }}</WButton>
      </div>
    </div>

    <WStatus v-if="status" class="w-best__status" :tone="status.tone" muted>{{ status.text }}</WStatus>
  </section>
</template>

<style scoped>
.w-best {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px 20px;
  padding: 20px var(--w-card-pad);
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  color: var(--w-text-1);
}
.w-best__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  color: var(--w-text-2);
}
.w-best__thumb {
  width: 88px;
  height: 88px;
  border-radius: var(--w-radius-control);
  background: var(--w-surface-2);
  object-fit: cover;
}
.w-best__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.w-best__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.w-best__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-text-3);
}
.w-best__title {
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
  overflow-wrap: anywhere;
}
.w-best__link {
  color: var(--w-text-1);
  text-decoration: none;
}
.w-best__link:hover { color: var(--w-link-hover); }
.w-best__link:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
.w-best__code {
  margin-left: 8px;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-regular);
  color: var(--w-text-3);
}
.w-best__sub {
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}
.w-best__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0;
}
.w-best__fact { display: flex; flex-direction: column; min-width: 0; }
.w-best__fact dt {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-regular);
  color: var(--w-text-3);
}
.w-best__fact dd {
  margin: 0;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-medium);
}
/* 关键数字 S：数字 20 / 600，单位 12 弱化 */
.w-best__kpis {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0;
}
.w-best__kpi { display: flex; flex-direction: column; }
.w-best__kpi dt {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-regular);
  color: var(--w-text-3);
}
.w-best__kpi dd {
  margin: 0;
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
  font-variant-numeric: tabular-nums;
}
.w-best__unit {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-regular);
  color: var(--w-text-3);
}
.w-best__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.w-best__status {
  align-self: start;
  margin-top: 21px;
  font-size: var(--w-fs-13);
  line-height: 20px;
}
</style>
