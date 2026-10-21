<script lang="ts" setup>
/**
 * 补录 / 修改报关数据（报关快照，PUT /dn/<id>/customs，需 dn_edit）
 *
 * 报关数据随出库单从下单系统传来，缺的、错的在这里补。后端是整体替换快照：
 * 表单里没有的字段（明细的数量、申报原产国、单位等）按原快照带回；没有报关明细的商品，填了内容才新建一行。
 * 收货人没填时单证用出库单的收货人（显示成占位提示），全部留空就不写进快照。
 * 已发货 409 16065；有自动运单（进行中 / 有效 / 结果不明 / 取消中）409 16076；
 * 印在单证上的内容变了，后端作废现有单证（voided_documents）。
 */
import { countryName } from '~/data/countries'
import type { CustomsLine } from '~/composables/customs/customsDocuments'

const props = defineProps<{
  open: boolean
  dnId: number | string
  /** 当前报关快照（GET customs 的 customs） */
  customs: Record<string, any> | null
  /** 视图里的明细（按商品；含没有报关明细的商品） */
  lines: CustomsLine[]
  /** 单证实际用的收货人（快照没有时退回出库单收货人），用作占位提示 */
  fallbackConsignee?: Record<string, any> | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 保存成功：后端返回的最新视图（含 voided_documents） */
  (e: 'saved', view: any): void
}>()

const { t, te, locale } = useI18n()
const { bizErrorMessage } = useBizError()

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']
const EXPORT_REASONS = ['SALE', 'GIFT', 'SAMPLE', 'RETURN', 'REPAIR', 'PERSONAL_EFFECTS']
const TAX_ID_TYPES = ['EORI', 'VAT', 'PCCC', 'KR_BRN', 'CPF', 'CNPJ', 'EIN', 'USCC', 'TW_UBN', 'OTHER']
const CONSIGNEE_KEYS = ['company', 'name', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'phone'] as const

interface LineDraft {
  goods_code: string
  goods_name: string | null
  planned_quantity: number | null
  packed_quantity: number | null
  origin_country: string | null
  description_en: string
  hs_code: string
  jp_export_code: string
  unit_value: string
  /** 原快照里的这一行（没有时为 null） */
  existing: Record<string, any> | null
}

const form = reactive({
  invoice_number: '',
  currency: '',
  incoterm: '',
  export_reason: '',
  recipient_country: null as string | null,
  recipient_tax_id: '',
  recipient_tax_id_type: '',
  freight_charge: '',
  insurance_charge: '',
  declared_value_carriage: '',
  consignee: {
    company: '', name: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '', phone: '',
    country: null as string | null,
  } as Record<string, any>,
})
const lineDrafts = ref<LineDraft[]>([])
/** 快照里有、但出库明细里已没有的行：原样带回（正常不会有） */
let extraLines: Record<string, any>[] = []
const saving = ref(false)
const errorText = ref<string | null>(null)

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const textOrNull = (v: unknown) => {
  const s = str(v).trim()
  return s || null
}
/** 金额：按接口定义提交数字；不是数字的原样提交，由后端报 16063（带字段名） */
const numberOrRaw = (v: unknown) => {
  const s = str(v).trim().replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : s
}

const init = () => {
  const c = props.customs || {}
  form.invoice_number = str(c.invoice_number)
  form.currency = str(c.currency)
  form.incoterm = str(c.incoterm)
  form.export_reason = str(c.export_reason)
  form.recipient_country = c.recipient_country || null
  form.recipient_tax_id = str(c.recipient_tax_id)
  form.recipient_tax_id_type = str(c.recipient_tax_id_type)
  form.freight_charge = str(c.freight_charge)
  form.insurance_charge = str(c.insurance_charge)
  form.declared_value_carriage = str(c.declared_value_carriage)
  const consignee = c.consignee || {}
  for (const key of CONSIGNEE_KEYS) form.consignee[key] = str(consignee[key])
  form.consignee.country = consignee.country || null

  const snapshotLines: Record<string, any>[] = Array.isArray(c.lines) ? c.lines : []
  const byCode = new Map(snapshotLines.map((l: Record<string, any>) => [l.goods_code, l]))
  lineDrafts.value = props.lines.filter((l: CustomsLine) => !!l.goods_code).map((l: CustomsLine) => {
    const existing = byCode.get(l.goods_code) || null
    return {
      goods_code: l.goods_code,
      goods_name: l.goods_name,
      planned_quantity: l.planned_quantity,
      packed_quantity: l.packed_quantity,
      origin_country: l.origin_country,
      description_en: str(existing?.description_en),
      hs_code: str(existing?.hs_code),
      jp_export_code: str(existing?.jp_export_code),
      unit_value: str(existing?.unit_value),
      existing,
    }
  })
  const viewCodes = new Set(lineDrafts.value.map((l: LineDraft) => l.goods_code))
  extraLines = snapshotLines.filter((l: Record<string, any>) => !viewCodes.has(l.goods_code))
  errorText.value = null
}

watch(() => props.open, (open: boolean) => {
  if (open) init()
})

const close = () => {
  if (!saving.value) emit('update:open', false)
}

/** 下拉里没有的现值（下单系统传来的其它写法）也要能保留 */
const withCurrent = (options: string[], current: string) =>
  (current && !options.includes(current.toUpperCase()) ? [current, ...options] : options)
const exportReasonText = (code: string) => {
  const key = `customs.export-reasons.${code}`
  return te(key) ? `${code}（${t(key)}）` : code
}
const taxIdTypeText = (code: string) => (code === 'OTHER' ? t('customs.editor.tax-id-other') : code)
const fallback = (key: string) => {
  const value = props.fallbackConsignee?.[key]
  if (!value) return ''
  return key === 'country' ? `${String(value).toUpperCase()} ${countryName(value, locale.value)}` : String(value)
}
/** 快照里没有收货人：单证用出库单收货人，表单留空、只当占位提示 */
const usingFallbackConsignee = computed(() =>
  !CONSIGNEE_KEYS.some((k) => str(form.consignee[k]).trim()) && !form.consignee.country
  && !!props.fallbackConsignee && Object.values(props.fallbackConsignee).some(Boolean))

const buildPayload = () => {
  const consignee: Record<string, any> = {}
  for (const key of CONSIGNEE_KEYS) consignee[key] = textOrNull(form.consignee[key])
  consignee.country = form.consignee.country || null
  const hasConsignee = Object.values(consignee).some((v) => v !== null)

  const lines = lineDrafts.value.flatMap((d: LineDraft) => {
    const edited = {
      description_en: textOrNull(d.description_en),
      hs_code: textOrNull(d.hs_code),
      jp_export_code: textOrNull(d.jp_export_code),
      unit_value: numberOrRaw(d.unit_value),
    }
    if (!d.existing && Object.values(edited).every((v) => v === null)) return []
    const base = d.existing || { goods_code: d.goods_code, quantity: d.planned_quantity }
    return [{ ...base, ...edited, goods_code: d.goods_code }]
  })

  return {
    invoice_number: textOrNull(form.invoice_number),
    currency: textOrNull(form.currency),
    incoterm: textOrNull(form.incoterm),
    export_reason: textOrNull(form.export_reason),
    recipient_country: form.recipient_country || null,
    recipient_tax_id: textOrNull(form.recipient_tax_id),
    recipient_tax_id_type: textOrNull(form.recipient_tax_id_type),
    freight_charge: numberOrRaw(form.freight_charge),
    insurance_charge: numberOrRaw(form.insurance_charge),
    declared_value_carriage: numberOrRaw(form.declared_value_carriage),
    consignee: hasConsignee ? consignee : null,
    lines: [...lines, ...extraLines],
  }
}

const save = async () => {
  if (saving.value) return
  saving.value = true
  errorText.value = null
  let result: any = null
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs`, {
    method: 'PUT',
    body: buildPayload(),
    onSuccess: (data) => {
      result = data
    },
    onError: (error) => {
      const field = error.details?.field
      errorText.value = field ? `${bizErrorMessage(error)}（${field}）` : bizErrorMessage(error)
    },
    onFinally: () => {
      saving.value = false
    },
  })
  if (!result) return
  const voided = Array.isArray(result.voided_documents) ? result.voided_documents.length : 0
  if (voided > 0) {
    showToast(t('customs.editor.saved-voided', { count: voided }), 'warning')
  } else {
    showToast(t('customs.editor.saved'), 'success')
  }
  emit('saved', result)
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal fade" :class="{ show: open }" :style="{ display: open ? 'block' : 'none' }" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('customs.editor.title') }}</h6>
            <button type="button" class="btn-close" :disabled="saving" @click="close"></button>
          </div>
          <div class="modal-body" v-if="open">
            <p class="fs-12 text-muted">
              <i class="ri-information-line me-1"></i>{{ t('customs.editor.tips.source') }}
            </p>

            <!-- ===== 单据信息 ===== -->
            <h6 class="fw-semibold mb-2">{{ t('customs.editor.sections.basic') }}</h6>
            <div class="row g-3 mb-4">
              <div class="col-md-4">
                <label class="form-label">{{ t('customs.fields.invoice-number') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="form.invoice_number" maxlength="50"
                  :placeholder="t('customs.editor.tips.invoice-fallback')">
              </div>
              <div class="col-md-2">
                <label class="form-label">{{ t('customs.fields.currency') }}</label>
                <input type="text" class="form-control form-control-sm text-uppercase" v-model="form.currency" maxlength="3"
                  placeholder="JPY">
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('customs.fields.incoterm') }}</label>
                <select class="form-select form-select-sm" v-model="form.incoterm">
                  <option value="">—</option>
                  <option v-for="code in withCurrent(INCOTERMS, form.incoterm)" :key="code" :value="code">{{ code }}</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('customs.fields.export-reason') }}</label>
                <select class="form-select form-select-sm" v-model="form.export_reason">
                  <option value="">—</option>
                  <option v-for="code in withCurrent(EXPORT_REASONS, form.export_reason)" :key="code" :value="code">
                    {{ exportReasonText(code) }}
                  </option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('customs.fields.recipient-country') }}</label>
                <CountrySelect v-model="form.recipient_country" size="sm" />
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('customs.fields.tax-id-type') }}</label>
                <select class="form-select form-select-sm" v-model="form.recipient_tax_id_type">
                  <option value="">—</option>
                  <option v-for="code in withCurrent(TAX_ID_TYPES, form.recipient_tax_id_type)" :key="code" :value="code">
                    {{ taxIdTypeText(code) }}
                  </option>
                </select>
              </div>
              <div class="col-md-5">
                <label class="form-label">{{ t('customs.fields.recipient-tax-id') }}</label>
                <input type="text" class="form-control form-control-sm font-monospace" v-model="form.recipient_tax_id" maxlength="100">
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('customs.fields.freight') }}</label>
                <input type="number" min="0" step="1" class="form-control form-control-sm" v-model="form.freight_charge">
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('customs.fields.insurance') }}</label>
                <input type="number" min="0" step="1" class="form-control form-control-sm" v-model="form.insurance_charge">
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('customs.fields.declared-value-carriage') }}</label>
                <input type="number" min="0" step="1" class="form-control form-control-sm" v-model="form.declared_value_carriage">
              </div>
            </div>

            <!-- ===== 收货人 ===== -->
            <h6 class="fw-semibold mb-1">{{ t('customs.editor.sections.consignee') }}</h6>
            <p class="fs-12 text-muted mb-2" v-if="usingFallbackConsignee">{{ t('customs.editor.tips.consignee-fallback') }}</p>
            <div class="row g-3 mb-4">
              <div class="col-md-6" v-for="key in ['company', 'name']" :key="key">
                <label class="form-label">{{ t(`customs.consignee-fields.${key}`) }}</label>
                <input type="text" class="form-control form-control-sm" v-model="form.consignee[key]" maxlength="255"
                  :placeholder="fallback(key)">
              </div>
              <div class="col-md-6" v-for="key in ['address_line1', 'address_line2']" :key="key">
                <label class="form-label">{{ t(`customs.consignee-fields.${key.replace(/_/g, '-')}`) }}</label>
                <input type="text" class="form-control form-control-sm" v-model="form.consignee[key]" maxlength="255"
                  :placeholder="fallback(key)">
              </div>
              <div class="col-md-3" v-for="key in ['city', 'state', 'postal_code']" :key="key">
                <label class="form-label">{{ t(`customs.consignee-fields.${key.replace(/_/g, '-')}`) }}</label>
                <input type="text" class="form-control form-control-sm" v-model="form.consignee[key]" maxlength="255"
                  :placeholder="fallback(key)">
              </div>
              <div class="col-md-3">
                <label class="form-label">{{ t('customs.consignee-fields.phone') }}</label>
                <input type="text" class="form-control form-control-sm" v-model="form.consignee.phone" maxlength="255"
                  :placeholder="fallback('phone')">
              </div>
              <div class="col-md-6">
                <label class="form-label">{{ t('customs.consignee-fields.country') }}</label>
                <CountrySelect v-model="form.consignee.country" size="sm" :placeholder="fallback('country') || undefined" />
              </div>
            </div>

            <!-- ===== 明细 ===== -->
            <h6 class="fw-semibold mb-2">{{ t('customs.editor.sections.lines') }}</h6>
            <div class="table-responsive">
              <table class="table table-sm table-bordered align-middle mb-0 fs-13">
                <thead>
                  <tr>
                    <th scope="col">{{ t('customs.fields.jan') }}</th>
                    <th scope="col" class="text-end">{{ t('customs.fields.packed-qty') }}</th>
                    <th scope="col" style="min-width: 220px;">{{ t('customs.fields.description-en') }}</th>
                    <th scope="col" style="min-width: 130px;">{{ t('customs.fields.hs-code') }}</th>
                    <th scope="col" style="min-width: 130px;" :title="t('customs.tips.jp-export-code')">{{ t('customs.fields.jp-export-code') }}</th>
                    <th scope="col" style="min-width: 120px;">{{ t('customs.fields.unit-value') }}</th>
                    <th scope="col">{{ t('customs.fields.origin') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in lineDrafts" :key="line.goods_code">
                    <td>
                      <div class="font-monospace">{{ line.goods_code }}</div>
                      <div class="fs-12 text-muted text-wrap" style="max-width: 220px;">{{ line.goods_name }}</div>
                    </td>
                    <td class="text-end text-nowrap">{{ line.packed_quantity ?? 0 }} / {{ line.planned_quantity ?? '—' }}</td>
                    <td><input type="text" class="form-control form-control-sm" v-model="line.description_en" maxlength="500"></td>
                    <td><input type="text" class="form-control form-control-sm font-monospace" v-model="line.hs_code" maxlength="20"
                        placeholder="9503.00"></td>
                    <td><input type="text" class="form-control form-control-sm font-monospace" v-model="line.jp_export_code" maxlength="20"></td>
                    <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end" v-model="line.unit_value"
                        maxlength="20"></td>
                    <td class="text-nowrap">
                      <span v-if="line.origin_country" class="fw-semibold">{{ String(line.origin_country).toUpperCase() }}</span>
                      <span class="badge bg-danger-transparent" v-else :title="t('customs.editor.tips.origin-on-goods')">
                        {{ t('goods.tips.origin-missing') }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="fs-12 text-muted mt-2 mb-0">{{ t('customs.editor.tips.origin-on-goods') }}</p>

            <div class="alert alert-danger-transparent mt-3 mb-0" role="alert" v-if="errorText">{{ errorText }}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" :disabled="saving" @click="close">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>{{ t('button.save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="open" @click="close"></div>
  </Teleport>
</template>
