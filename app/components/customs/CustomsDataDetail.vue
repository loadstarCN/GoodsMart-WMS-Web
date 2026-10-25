<script lang="ts" setup>
/**
 * 报关数据明细（发货流程「报关单证」一步里展开看）：报关概要、出口方、逐行明细、运费 / 保险费与发票总额、箱数与重量。
 * 只显示；缺的数据在同一步的问题清单里补（补录报关数据、就地补原产国）。
 */
import { countryName } from '~/data/countries'
import {
  formatHsCode,
  formatMoney,
  hasNonAscii,
  type CustomsLine,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'

const props = withDefaults(defineProps<{
  view: CustomsView
  /** DN 所属仓库：出口资料不全时给仓库编辑页的入口 */
  warehouseId?: number | string | null
}>(), {
  warehouseId: null,
})

const { t, te, locale } = useI18n()

const customs = computed<Record<string, any>>(() => props.view.customs || {})
const consignee = computed<Record<string, any>>(() => props.view.consignee || customs.value?.consignee || {})
const invoiceNumber = computed(() => props.view.invoice_number || customs.value?.invoice_number || '')
const currency = computed(() => String(customs.value?.currency || 'JPY'))
const lines = computed<CustomsLine[]>(() => props.view.lines || [])
const totals = computed(() => props.view.totals || null)
const exporter = computed<Record<string, any> | null>(() => props.view.exporter || null)
const recipientCountry = computed(() =>
  String(props.view.recipient_country || customs.value?.recipient_country || consignee.value?.country || ''))

const countryText = (code: string | null | undefined) => (code ? `${String(code).toUpperCase()} ${countryName(code, locale.value)}` : '')
const money = (v: number | null | undefined) => formatMoney(v, currency.value)
const weight = (v: number | null | undefined) =>
  v === null || v === undefined || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(3)} kg`

/** 该行是否有「輸出統計番号与 HS 不一致」警告 */
const jpExportWarned = (line: CustomsLine) =>
  (props.view.problems || []).some((p: CustomsProblem) => p.code === 'JP_EXPORT_CODE_MISMATCH' && p.goods_code === line.goods_code)

const exportReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.export-reasons.${String(reason).toUpperCase()}`
  return te(key) ? `${reason}（${t(key)}）` : String(reason)
}
</script>

<template>
  <div class="w-cdata">
    <div class="w-cdata__top">
      <!-- ===== 报关概要 ===== -->
      <section class="w-cdata__section">
        <h4 class="w-cdata__title">{{ t('customs.sections.summary') }}</h4>
        <dl class="w-cdata__dl">
          <dt>{{ t('customs.fields.invoice-number') }}</dt>
          <dd :class="{ 'is-empty': !invoiceNumber }">{{ invoiceNumber || '—' }}</dd>
          <dt>{{ t('customs.fields.incoterm') }}</dt>
          <dd :class="{ 'is-empty': !customs.incoterm }">
            <template v-if="customs.incoterm">{{ customs.incoterm }}<template v-if="recipientCountry"> {{ recipientCountry.toUpperCase() }}</template></template>
            <template v-else>—</template>
          </dd>
          <dt>{{ t('customs.fields.currency') }}</dt>
          <dd :class="{ 'is-empty': !customs.currency }">{{ customs.currency || '—' }}</dd>
          <dt>{{ t('customs.fields.export-reason') }}</dt>
          <dd :class="{ 'is-empty': !customs.export_reason }">{{ customs.export_reason ? exportReasonText(customs.export_reason) : '—' }}</dd>
          <dt>{{ t('customs.fields.recipient-country') }}</dt>
          <dd :class="{ 'is-empty': !recipientCountry }">{{ recipientCountry ? countryText(recipientCountry) : '—' }}</dd>
          <dt>{{ t('customs.fields.recipient-tax-id') }}</dt>
          <dd :class="{ 'is-empty': !customs.recipient_tax_id }">
            <template v-if="customs.recipient_tax_id">
              <WTag v-if="customs.recipient_tax_id_type">{{ customs.recipient_tax_id_type }}</WTag> {{ customs.recipient_tax_id }}
            </template>
            <template v-else>—</template>
          </dd>
          <dt>{{ t('customs.fields.consignee') }}</dt>
          <dd :class="{ 'is-empty': !(consignee && (consignee.name || consignee.company)) }">
            <template v-if="consignee && (consignee.name || consignee.company)">
              <span v-if="consignee.company" class="w-cdata__line">{{ consignee.company }}</span>
              <span v-if="consignee.name" class="w-cdata__line">{{ consignee.name }}</span>
              <span class="w-cdata__line w-cdata__sub">
                {{ [consignee.address_line1, consignee.address_line2, [consignee.city, consignee.state, consignee.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(' · ') }}
              </span>
              <span v-if="consignee.country || consignee.phone" class="w-cdata__line w-cdata__sub">
                {{ [consignee.country ? countryText(consignee.country) : '', consignee.phone].filter(Boolean).join(' · ') }}
              </span>
            </template>
            <template v-else>—</template>
          </dd>
        </dl>
      </section>

      <!-- ===== 出口方 + 合计 ===== -->
      <section class="w-cdata__section">
        <h4 class="w-cdata__title">{{ t('customs.sections.exporter') }} <WHelp :text="t('customs.tips.exporter-source')" /></h4>
        <div v-if="exporter && (exporter.legal_name_en || exporter.address_en)" class="w-cdata__exporter">
          <span class="w-cdata__line">{{ exporter.legal_name_en }}</span>
          <span class="w-cdata__line w-cdata__sub">{{ exporter.address_en }}</span>
          <span v-if="exporter.phone" class="w-cdata__line w-cdata__sub">{{ exporter.phone }}</span>
        </div>
        <span v-else class="w-faint">—</span>
        <div class="w-cdata__links">
          <NuxtLink to="/company" class="w-cdata__link">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
          <NuxtLink v-if="warehouseId" :to="`/warehouse/edit/${warehouseId}`" class="w-cdata__link">{{ t('customs.operations.edit-warehouse') }}</NuxtLink>
        </div>
        <dl class="w-cdata__dl is-totals">
          <dt>{{ t('customs.fields.total-qty') }}</dt><dd>{{ totals?.quantity ?? '—' }}</dd>
          <dt>{{ t('customs.fields.goods-value') }}</dt><dd>{{ money(totals?.goods_value) }}</dd>
          <dt>{{ t('customs.fields.freight') }}</dt><dd>{{ money(totals?.freight ?? customs.freight_charge) }}</dd>
          <dt>{{ t('customs.fields.insurance') }}</dt>
          <dd :class="{ 'is-empty': customs.insurance_charge === null || customs.insurance_charge === undefined }">
            {{ customs.insurance_charge !== null && customs.insurance_charge !== undefined ? money(totals?.insurance ?? customs.insurance_charge) : '—' }}
          </dd>
          <dt class="is-strong">{{ t('customs.fields.invoice-total') }}</dt><dd class="is-strong">{{ money(totals?.invoice_total) }}</dd>
          <dt>{{ t('customs.fields.package-count') }}</dt><dd>{{ totals?.package_count ?? '—' }}</dd>
          <dt>{{ t('customs.fields.gross-weight') }}</dt><dd>{{ weight(totals?.gross_weight_kg) }}</dd>
          <dt>{{ t('customs.fields.net-weight') }}</dt><dd>{{ weight(totals?.net_weight_kg) }}</dd>
        </dl>
      </section>
    </div>

    <!-- ===== 明细 ===== -->
    <section class="w-cdata__section">
      <h4 class="w-cdata__title">{{ t('customs.sections.lines') }}</h4>
      <div class="w-cdata__table">
        <table class="w-cdata__grid">
          <thead>
            <tr>
              <th scope="col">{{ t('customs.fields.jan') }}</th>
              <th scope="col">{{ t('customs.fields.description-en') }}</th>
              <th scope="col">{{ t('customs.fields.hs-code') }}</th>
              <th scope="col">{{ t('customs.fields.jp-export-code') }} <WHelp :text="t('customs.tips.jp-export-code')" /></th>
              <th scope="col">{{ t('customs.fields.origin') }}</th>
              <th scope="col" class="is-num">{{ t('customs.fields.packed-qty') }}</th>
              <th scope="col" class="is-num">{{ t('customs.fields.unit-value') }}</th>
              <th scope="col" class="is-num">{{ t('customs.fields.amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.goods_code" :class="{ 'is-off': !Number(line.packed_quantity) }">
              <td>
                <NuxtLink v-if="line.goods_id" :to="`/goods/detail/${line.goods_id}`" class="w-cdata__link">{{ line.goods_code }}</NuxtLink>
                <span v-else>{{ line.goods_code }}</span>
                <span class="w-cdata__line w-cdata__sub">{{ line.goods_name }}</span>
              </td>
              <td>
                <template v-if="line.description_en">
                  {{ line.description_en }}
                  <WTag v-if="hasNonAscii(line.description_en)" tone="warn" :title="t('customs.problems.DESCRIPTION_NOT_ASCII')">!</WTag>
                </template>
              </td>
              <td class="is-mono">{{ line.hs_code ? (line.hs_code_formatted || formatHsCode(line.hs_code)) : '' }}</td>
              <td class="is-mono">
                {{ line.jp_export_code || '' }}
                <WTag v-if="jpExportWarned(line)" tone="warn" :title="t('customs.problems.JP_EXPORT_CODE_MISMATCH')">!</WTag>
              </td>
              <td>
                <template v-if="line.origin_country">{{ String(line.origin_country).toUpperCase() }} <span class="w-faint">{{ countryName(line.origin_country, locale) }}</span></template>
                <WTag v-else tone="warn">{{ t('goods.tips.origin-missing') }}</WTag>
              </td>
              <td class="is-num">
                <b>{{ line.packed_quantity ?? 0 }}</b><span class="w-faint"> / {{ line.planned_quantity ?? '—' }}</span>
                <span v-if="!Number(line.packed_quantity)" class="w-cdata__line w-cdata__sub">{{ t('customs.tips.not-on-invoice') }}</span>
              </td>
              <td class="is-num">{{ line.unit_value !== null && line.unit_value !== undefined ? money(line.unit_value) : '' }}</td>
              <td class="is-num">{{ Number(line.packed_quantity) ? money(line.amount) : '' }}</td>
            </tr>
            <tr v-if="lines.length === 0"><td colspan="8" class="w-cdata__empty">{{ t('w.table.empty') }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.w-cdata {
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-cdata__top { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px 32px; }
.w-cdata__section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.w-cdata__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  font-weight: var(--w-fw-semibold);
}
.w-cdata__dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 0; }
.w-cdata__dl dt { color: var(--w-text-2); font-weight: var(--w-fw-regular); }
.w-cdata__dl dd { margin: 0; overflow-wrap: anywhere; }
.w-cdata__dl dd.is-empty { color: var(--w-text-3); }
.w-cdata__dl.is-totals { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--w-line); }
.w-cdata__dl.is-totals dd { text-align: right; font-variant-numeric: tabular-nums; }
.w-cdata__dl .is-strong { color: var(--w-text-1); font-weight: var(--w-fw-semibold); }
.w-cdata__line { display: block; }
.w-cdata__sub { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-cdata__exporter { display: flex; flex-direction: column; }
.w-cdata__links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.w-cdata__link { color: var(--w-link); font-weight: var(--w-fw-medium); text-decoration: none; }
.w-cdata__link:hover { color: var(--w-link-hover); }
.w-cdata__table { overflow-x: auto; border: 1px solid var(--w-border); border-radius: var(--w-radius-card); }
.w-cdata__grid { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.w-cdata__grid th {
  padding: 8px 10px;
  border-bottom: 1px solid var(--w-border);
  color: var(--w-text-3);
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  text-align: left;
  white-space: nowrap;
}
.w-cdata__grid td { padding: 8px 10px; border-top: 1px solid var(--w-line); vertical-align: top; }
.w-cdata__grid tbody tr:first-child td { border-top: 0; }
.w-cdata__grid tr.is-off td { color: var(--w-text-3); }
.w-cdata__grid .is-num { text-align: right; white-space: nowrap; }
.w-cdata__grid .is-mono { font-family: var(--w-font-mono); font-size: var(--w-fs-12); white-space: nowrap; }
.w-cdata__empty { padding: 20px; text-align: center; color: var(--w-text-3); }
</style>
