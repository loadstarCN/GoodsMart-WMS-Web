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
  <div class="row gy-3 customs-data-detail">
    <!-- ===== 报关概要 ===== -->
    <div class="col-xxl-5 col-xl-6">
      <h6 class="fw-semibold fs-13 mb-2">{{ t('customs.sections.summary') }}</h6>
      <dl class="row mb-0 fs-13 customs-dl">
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.invoice-number') }}</dt>
        <dd class="col-7">{{ invoiceNumber || '—' }}</dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.incoterm') }}</dt>
        <dd class="col-7">
          <span v-if="customs.incoterm">{{ customs.incoterm }}<template v-if="recipientCountry"> {{ recipientCountry.toUpperCase() }}</template></span>
          <span class="text-danger" v-else>—</span>
        </dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.currency') }}</dt>
        <dd class="col-7">{{ customs.currency || '—' }}</dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.export-reason') }}</dt>
        <dd class="col-7">
          <span v-if="customs.export_reason">{{ exportReasonText(customs.export_reason) }}</span>
          <span class="text-danger" v-else>—</span>
        </dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.recipient-country') }}</dt>
        <dd class="col-7">
          <span v-if="recipientCountry">{{ countryText(recipientCountry) }}</span>
          <span class="text-danger" v-else>—</span>
        </dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.recipient-tax-id') }}</dt>
        <dd class="col-7">
          <template v-if="customs.recipient_tax_id">
            <span class="badge bg-light text-default me-1" v-if="customs.recipient_tax_id_type">{{ customs.recipient_tax_id_type }}</span>
            <span class="font-monospace">{{ customs.recipient_tax_id }}</span>
          </template>
          <span class="text-muted" v-else>—</span>
        </dd>
        <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.consignee') }}</dt>
        <dd class="col-7">
          <template v-if="consignee && (consignee.name || consignee.company)">
            <div v-if="consignee.company">{{ consignee.company }}</div>
            <div v-if="consignee.name">{{ consignee.name }}</div>
            <div class="text-muted fs-12">
              <div v-if="consignee.address_line1">{{ consignee.address_line1 }}</div>
              <div v-if="consignee.address_line2">{{ consignee.address_line2 }}</div>
              <div>{{ [consignee.city, consignee.state, consignee.postal_code].filter(Boolean).join(', ') }}</div>
              <div v-if="consignee.country">{{ countryText(consignee.country) }}</div>
              <div v-if="consignee.phone">{{ consignee.phone }}</div>
            </div>
          </template>
          <span class="text-muted" v-else>—</span>
        </dd>
      </dl>
    </div>

    <!-- ===== 出口方 + 合计 ===== -->
    <div class="col-xxl-7 col-xl-6">
      <h6 class="fw-semibold fs-13 mb-2">{{ t('customs.sections.exporter') }}</h6>
      <div class="fs-13" v-if="exporter && (exporter.legal_name_en || exporter.address_en)">
        <div class="fw-semibold">{{ exporter.legal_name_en }}</div>
        <div class="text-muted fs-12">{{ exporter.address_en }}</div>
        <div class="text-muted fs-12" v-if="exporter.phone">{{ exporter.phone }}</div>
      </div>
      <div class="fs-12 text-muted" v-else>—</div>
      <div class="fs-12 text-muted mt-1">{{ t('customs.tips.exporter-source') }}</div>
      <NuxtLink to="/company" class="fs-12"><i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-exporter') }}</NuxtLink>
      <NuxtLink :to="`/warehouse/edit/${warehouseId}`" class="fs-12 ms-2" v-if="warehouseId">
        <i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-warehouse') }}
      </NuxtLink>

      <table class="table table-sm mb-0 mt-3 fs-13 customs-totals">
        <tbody>
          <tr>
            <td class="text-muted">{{ t('customs.fields.total-qty') }}</td>
            <td class="text-end">{{ totals?.quantity ?? '—' }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.goods-value') }}</td>
            <td class="text-end">{{ money(totals?.goods_value) }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.freight') }}</td>
            <td class="text-end">{{ money(totals?.freight ?? customs.freight_charge) }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.insurance') }}</td>
            <td class="text-end">
              <span v-if="customs.insurance_charge !== null && customs.insurance_charge !== undefined">{{ money(totals?.insurance ?? customs.insurance_charge) }}</span>
              <span class="text-muted" v-else>—</span>
            </td>
          </tr>
          <tr class="fw-semibold">
            <td>{{ t('customs.fields.invoice-total') }}</td>
            <td class="text-end">{{ money(totals?.invoice_total) }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.package-count') }}</td>
            <td class="text-end">{{ totals?.package_count ?? '—' }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.gross-weight') }}</td>
            <td class="text-end">{{ weight(totals?.gross_weight_kg) }}</td>
          </tr>
          <tr>
            <td class="text-muted">{{ t('customs.fields.net-weight') }}</td>
            <td class="text-end">{{ weight(totals?.net_weight_kg) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== 明细 ===== -->
    <div class="col-12">
      <h6 class="fw-semibold fs-13 mb-2">{{ t('customs.sections.lines') }}</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-0 fs-13">
          <thead>
            <tr>
              <th scope="col">{{ t('customs.fields.jan') }}</th>
              <th scope="col">{{ t('customs.fields.goods-name') }}</th>
              <th scope="col">{{ t('customs.fields.description-en') }}</th>
              <th scope="col">{{ t('customs.fields.hs-code') }}</th>
              <th scope="col" :title="t('customs.tips.jp-export-code')">{{ t('customs.fields.jp-export-code') }}</th>
              <th scope="col">{{ t('customs.fields.origin') }}</th>
              <th scope="col" class="text-end">{{ t('customs.fields.packed-qty') }}</th>
              <th scope="col" class="text-end">{{ t('customs.fields.unit-value') }}</th>
              <th scope="col" class="text-end">{{ t('customs.fields.amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.goods_code" :class="{ 'text-muted': !Number(line.packed_quantity) }">
              <td class="font-monospace">
                <NuxtLink v-if="line.goods_id" :to="`/goods/detail/${line.goods_id}`">{{ line.goods_code }}</NuxtLink>
                <span v-else>{{ line.goods_code }}</span>
              </td>
              <td class="text-wrap" style="min-width: 160px;">{{ line.goods_name }}</td>
              <td class="text-wrap" style="min-width: 160px;">
                <template v-if="line.description_en">
                  {{ line.description_en }}
                  <i class="ri-error-warning-line text-warning ms-1" v-if="hasNonAscii(line.description_en)"
                    :title="t('customs.problems.DESCRIPTION_NOT_ASCII')"></i>
                </template>
                <span class="text-danger" v-else>—</span>
              </td>
              <td class="font-monospace">
                <span v-if="line.hs_code">{{ line.hs_code_formatted || formatHsCode(line.hs_code) }}</span>
                <span class="text-danger" v-else>—</span>
              </td>
              <td class="font-monospace text-nowrap">
                <span v-if="line.jp_export_code">{{ line.jp_export_code }}</span>
                <span class="text-muted" v-else>—</span>
                <i class="ri-error-warning-line text-warning ms-1" v-if="jpExportWarned(line)"
                  :title="t('customs.problems.JP_EXPORT_CODE_MISMATCH')"></i>
              </td>
              <td>
                <template v-if="line.origin_country">
                  <span class="fw-semibold">{{ String(line.origin_country).toUpperCase() }}</span>
                  <span class="text-muted fs-12 ms-1">{{ countryName(line.origin_country, locale) }}</span>
                </template>
                <span class="badge bg-danger-transparent" v-else>{{ t('goods.tips.origin-missing') }}</span>
              </td>
              <td class="text-end text-nowrap">
                <span class="fw-semibold">{{ line.packed_quantity ?? 0 }}</span>
                <span class="text-muted"> / {{ line.planned_quantity ?? '—' }}</span>
                <div class="fs-11 text-muted" v-if="!Number(line.packed_quantity)">{{ t('customs.tips.not-on-invoice') }}</div>
              </td>
              <td class="text-end text-nowrap">
                <span v-if="line.unit_value !== null && line.unit_value !== undefined">{{ money(line.unit_value) }}</span>
                <span class="text-danger" v-else>—</span>
              </td>
              <td class="text-end text-nowrap">{{ Number(line.packed_quantity) ? money(line.amount) : '—' }}</td>
            </tr>
            <tr v-if="lines.length === 0">
              <td colspan="9" class="text-center text-muted py-3">{{ t('common.status.nothing-show') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.customs-dl dt,
.customs-dl dd {
  margin-bottom: 0.35rem;
}

.customs-totals {
  max-width: 24rem;
}
</style>
