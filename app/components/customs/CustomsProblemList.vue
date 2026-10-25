<script lang="ts" setup>
/**
 * 报关问题清单（出库单单证卡片、打包 / 配送任务的海外发货区共用）
 *
 * 每条问题都给出补的地方：
 * - 报关快照里的（贸易条款、税号、HS、英文品名、单价……）→「补录」，打开报关数据编辑（需 dn_edit、DN 未发货）
 * - 商品没录重量（算不出净重）→ 逐个商品的编辑页
 * - 出口资料 → 公司 / 仓库编辑页；印在 CI 上的承运商名 → 承运商列表
 * - 缺原产国在明细 / 海外发货区就地补录，箱子在箱子区，这里不另给入口
 */
import {
  CUSTOMS_SNAPSHOT_PROBLEMS,
  type CustomsLine,
  type CustomsProblem,
} from '~/composables/customs/customsDocuments'

const props = withDefaults(defineProps<{
  problems: CustomsProblem[]
  /** 视图里的明细：NET_WEIGHT_UNKNOWN 据此列出没录重量的商品 */
  lines?: CustomsLine[]
  /** DN 所属仓库：出口资料（电话、国家代码、发货地址）仓库优先 */
  warehouseId?: number | string | null
  /** 能补录报关快照（有 dn_edit 且 DN 未发货） */
  canEditCustoms?: boolean
}>(), {
  lines: () => [],
  warehouseId: null,
  canEditCustoms: false,
})

const emit = defineEmits<{
  (e: 'edit-customs'): void
}>()

const { t, te } = useI18n()

const groups = computed(() => [
  { level: 'error', items: props.problems.filter((p: CustomsProblem) => p.level === 'error'),
    title: t('customs.errors'), cls: 'text-danger', icon: 'ri-close-circle-line' },
  { level: 'warning', items: props.problems.filter((p: CustomsProblem) => p.level !== 'error'),
    title: t('customs.warnings'), cls: 'text-warning', icon: 'ri-error-warning-line' },
].filter((g) => g.items.length > 0))

/** 已打包、但商品主数据没有单件重量的商品 */
const weightMissingLines = computed(() =>
  props.lines.filter((l: CustomsLine) => !!l.goods_id && Number(l.packed_quantity) > 0
    && (l.unit_weight_kg === null || l.unit_weight_kg === undefined)))

const problemText = (p: CustomsProblem) => {
  const key = `customs.problems.${p.code}`
  return te(key) ? t(key) : (p.message || p.code)
}

const EXPORTER_FIELD_KEYS: Record<string, string> = {
  legal_name_en: 'company.fields.legal-name-en',
  address_en: 'company.fields.address-en',
  phone: 'common.fields.phone',
  country_code: 'company.fields.country-code',
}
/** 问题文案本身说不清是哪一项时才补字段名（收货人的哪一栏、出口资料的哪一项） */
const fieldText = (p: CustomsProblem) => {
  if (!p.field) return ''
  const field = String(p.field)
  if (p.code === 'NON_LATIN_TEXT' && field.startsWith('consignee.')) {
    const key = `customs.consignee-fields.${field.slice('consignee.'.length).replace(/_/g, '-')}`
    return `${t('customs.fields.consignee')} · ${te(key) ? t(key) : field}`
  }
  if (p.code === 'EXPORTER_PROFILE_INCOMPLETE' || p.code === 'EXPORTER_NON_LATIN_TEXT') {
    const name = field.split('.').pop() || ''
    return EXPORTER_FIELD_KEYS[name] ? t(EXPORTER_FIELD_KEYS[name]) : field
  }
  return ''
}

const isSnapshotProblem = (p: CustomsProblem) => CUSTOMS_SNAPSHOT_PROBLEMS.includes(p.code)
/** 出口资料：电话、国家代码仓库优先，两处都给；明确是仓库字段的只给仓库 */
const exporterLinks = (p: CustomsProblem) => {
  if (p.code === 'EXPORTER_PROFILE_INCOMPLETE') return { company: true, warehouse: true }
  if (p.code === 'EXPORTER_NON_LATIN_TEXT') {
    const onWarehouse = String(p.field || '').startsWith('warehouse.')
    return { company: !onWarehouse, warehouse: onWarehouse }
  }
  return null
}
</script>

<template>
  <ul class="w-cproblems">
    <template v-for="group in groups" :key="group.level">
      <li v-for="(p, i) in group.items" :key="`${group.level}-${i}`" class="w-cproblems__item" :title="p.message || ''">
        <span class="w-cproblems__dot" :class="`is-${group.level}`" aria-hidden="true" />
        <span class="w-sr-only">{{ group.title }}</span>
        <span class="w-cproblems__text">
          {{ problemText(p) }}
          <WTag v-if="p.goods_code">{{ p.goods_code }}</WTag>
          <span v-if="fieldText(p)" class="w-faint">（{{ fieldText(p) }}）</span>
        </span>
        <span class="w-cproblems__links">
          <button v-if="isSnapshotProblem(p) && canEditCustoms" type="button" class="w-cproblems__link" @click="emit('edit-customs')">
            {{ t('customs.operations.fix') }}
          </button>
          <template v-else-if="exporterLinks(p)">
            <NuxtLink v-if="exporterLinks(p)?.company" to="/company" class="w-cproblems__link">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
            <NuxtLink v-if="exporterLinks(p)?.warehouse && warehouseId" :to="`/warehouse/edit/${warehouseId}`" class="w-cproblems__link">
              {{ t('customs.operations.edit-warehouse') }}
            </NuxtLink>
          </template>
          <NuxtLink v-else-if="p.code === 'CARRIER_NON_LATIN_TEXT'" to="/carrier/" class="w-cproblems__link">{{ t('customs.operations.edit-carrier') }}</NuxtLink>
          <template v-else-if="p.code === 'NET_WEIGHT_UNKNOWN' && weightMissingLines.length > 0">
            <span class="w-faint">{{ t('customs.operations.edit-weight') }}</span>
            <NuxtLink v-for="line in weightMissingLines" :key="line.goods_code" :to="`/goods/edit/${line.goods_id}`" class="w-cproblems__link">
              {{ line.goods_code }}
            </NuxtLink>
          </template>
        </span>
      </li>
    </template>
  </ul>
</template>

<style scoped>
.w-cproblems {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-cproblems__item { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.w-cproblems__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--w-radius-pill);
  background: var(--w-warn-dot);
  transform: translateY(-2px);
}
.w-cproblems__dot.is-error { background: var(--w-bad-dot); }
.w-cproblems__text { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; }
.w-cproblems__links { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.w-cproblems__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-medium);
  text-decoration: none;
  cursor: pointer;
}
.w-cproblems__link:hover { color: var(--w-link-hover); }
</style>
