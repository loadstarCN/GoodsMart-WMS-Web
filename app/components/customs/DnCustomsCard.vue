<script lang="ts" setup>
/**
 * 出库单详情 · 海外出荷単証卡片
 *
 * - 报关概要、逐行明细（缺原产国的行可就地选择并保存到商品主数据）、运费与发票总额
 * - 箱子编辑（cm / kg 录入，保存换算 mm）
 * - 问题清单（错误 / 警告）
 * - 生成单证、打印 CI / PL、历史版本
 * - DN 发货后只读（仍可查看、打印）
 */
import { countryName } from '~/data/countries'
import {
  DN_LOCKED_STATUSES,
  DN_PACKAGE_EDITABLE_STATUSES,
  formatBytes,
  formatHsCode,
  formatMoney,
  hasNonAscii,
  normalizeDocumentList,
  pickCurrentDocument,
  useCustomsPdfActions,
  type CustomsDocumentMeta,
  type CustomsLine,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'

const props = defineProps<{
  dnId: number | string
  dnStatus?: string | null
}>()

const { t, te, locale } = useI18n()
const route = useRoute()
const { bizErrorMessage } = useBizError()
const { busyDocId, printDoc, viewDoc, downloadDoc } = useCustomsPdfActions()

const loading = ref(false)
const loadError = ref<string | null>(null)
const view = ref<CustomsView | null>(null)
const issuing = ref(false)
let scrolled = false

// ------------------ 读取 ----------------------
const load = async () => {
  loading.value = true
  loadError.value = null
  await httpRequest<CustomsView>(`/api/warehouse/dn/${props.dnId}/customs`, {
    method: 'GET',
    onSuccess: (data) => {
      view.value = data
    },
    onError: (error) => {
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
  // 从其他页面带 #customs-documents 跳来时，数据到了再滚动到卡片
  if (!scrolled && route.hash === '#customs-documents') {
    scrolled = true
    await nextTick()
    document.getElementById('customs-documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

onMounted(load)

// ------------------ 状态 ----------------------
const locked = computed(() => !!view.value?.locked || DN_LOCKED_STATUSES.includes(String(props.dnStatus || '')))
const canEditPackages = computed(() => !locked.value && DN_PACKAGE_EDITABLE_STATUSES.includes(String(props.dnStatus || '')))
const isPacked = computed(() => props.dnStatus === 'packed')
const ready = computed(() => !!view.value?.ready)
const canIssue = computed(() => !locked.value && isPacked.value && ready.value)
const issueHint = computed(() => {
  if (locked.value) return ''
  if (!isPacked.value) return t('customs.tips.issue-need-packed')
  if (!ready.value) return t('customs.tips.issue-not-ready')
  return ''
})
const packagesReadonlyReason = computed(() =>
  locked.value ? t('customs.status.locked') : t('customs.packages.readonly-status')
)

const customs = computed<Record<string, any>>(() => view.value?.customs || {})
const consignee = computed<Record<string, any>>(() => customs.value?.consignee || {})
const currency = computed(() => String(customs.value?.currency || 'JPY'))
const lines = computed<CustomsLine[]>(() => view.value?.lines || [])
const totals = computed(() => view.value?.totals || null)
const exporter = computed<Record<string, any> | null>(() => view.value?.exporter || null)
const problems = computed<CustomsProblem[]>(() => view.value?.problems || [])
const errorProblems = computed(() => problems.value.filter((p: CustomsProblem) => p.level === 'error'))
const warningProblems = computed(() => problems.value.filter((p: CustomsProblem) => p.level !== 'error'))
const ci = computed(() => pickCurrentDocument(view.value?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(view.value?.current_documents, 'packing_list'))
const currentDocuments = computed(() => [ci.value, pl.value].filter((d): d is CustomsDocumentMeta => !!d))
const packagesForEditor = computed(() => view.value?.packages || [])
const recipientCountry = computed(() => String(customs.value?.recipient_country || consignee.value?.country || ''))

const countryText = (code: string | null | undefined) => (code ? `${String(code).toUpperCase()} ${countryName(code, locale.value)}` : '')
const money = (v: number | null | undefined) => formatMoney(v, currency.value)
const weight = (v: number | null | undefined) =>
  v === null || v === undefined || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(3)} kg`

const problemText = (p: CustomsProblem) => {
  const key = `customs.problems.${p.code}`
  return te(key) ? t(key) : (p.message || p.code)
}
const docTypeText = (type: string) => {
  const key = `customs.doc-types.${type}`
  return te(key) ? t(key) : type
}
const voidReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.void-reasons.${reason}`
  return te(key) ? t(key) : reason
}
const exportReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.export-reasons.${String(reason).toUpperCase()}`
  return te(key) ? `${reason}（${t(key)}）` : String(reason)
}
const userText = (u: any) => (u && typeof u === 'object' ? (u.user_name || u.email || u.id) : (u ?? ''))

// ------------------ 生成单证 ----------------------
const issue = async () => {
  if (!canIssue.value || issuing.value) return
  const prevVersion = Math.max(0, ...(view.value?.current_documents || []).map((d: CustomsDocumentMeta) => Number(d.version) || 0))
  issuing.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs-documents/issue`, {
    method: 'POST',
    body: {},
    onSuccess: async (data) => {
      const version = data?.version ?? ''
      if (version !== '' && Number(version) === prevVersion) {
        showToast(t('customs.tips.issued-same', { version }), 'success')
      } else {
        showToast(t('customs.tips.issued-new', { version }), 'success')
      }
      await load()
      if (historyOpen.value) await loadHistory()
    },
    onError: (error) => {
      // 16068：单证条件不全，details.problems 是最新的问题清单
      const latest = error.details?.problems
      if (error.code === 16068 && Array.isArray(latest) && view.value) {
        view.value = { ...view.value, problems: latest, ready: false }
      }
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      issuing.value = false
    },
  })
}

// ------------------ 历史版本 ----------------------
const historyOpen = ref(false)
const historyLoading = ref(false)
const history = ref<CustomsDocumentMeta[]>([])

const loadHistory = async () => {
  historyLoading.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs-documents/`, {
    method: 'GET',
    onSuccess: (data) => {
      history.value = normalizeDocumentList(data)
        .slice()
        .sort((a, b) => (Number(b.version) - Number(a.version)) || String(a.doc_type).localeCompare(String(b.doc_type)))
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      historyLoading.value = false
    },
  })
}

const toggleHistory = async () => {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) await loadHistory()
}

// ------------------ 缺原产国：就地补录（写入商品主数据） ----------------------
const originDraft = reactive<Record<string, string | null>>({})
const originSaving = reactive<Record<string, boolean>>({})

const saveOrigin = async (line: CustomsLine) => {
  if (!line.goods_id) return
  const key = String(line.goods_id)
  const code = originDraft[key]
  if (!code) return
  originSaving[key] = true
  await httpRequest(`/api/warehouse/goods/${line.goods_id}`, {
    method: 'PUT',
    body: { origin_country: code },
    onSuccess: async () => {
      showToast(t('action-results.op-success', { operation: t('goods.operations.edit'), entity: line.goods_code }), 'success')
      delete originDraft[key]
      await load()
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      originSaving[key] = false
    },
  })
}

// ------------------ 箱子保存后 ----------------------
const onPackagesSaved = async () => {
  await load()
  if (historyOpen.value) await loadHistory()
}

defineExpose({ reload: load })
</script>

<template>
  <div class="card custom-card" id="customs-documents">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="card-title d-flex align-items-center flex-wrap gap-2">
        <span><i class="ri-earth-line me-1 align-middle"></i>{{ t('customs.title') }}</span>
        <template v-if="view">
          <span class="badge bg-secondary-transparent" v-if="locked">
            <i class="ri-lock-line me-1"></i>{{ t('customs.status.locked') }}
          </span>
          <span class="badge bg-success-transparent" v-if="ci && pl">
            <i class="ri-checkbox-circle-line me-1"></i>{{ t('customs.status.issued') }}
          </span>
          <span class="badge bg-warning-transparent" v-else>{{ t('customs.status.not-issued') }}</span>
          <span class="badge" :class="ready ? 'bg-success-transparent' : 'bg-danger-transparent'" v-if="!locked">
            {{ ready ? t('customs.status.ready') : t('customs.status.not-ready') }}
          </span>
        </template>
      </div>
      <div class="btn-list">
        <button type="button" class="btn btn-sm btn-primary" v-if="!locked" :disabled="!canIssue || issuing"
          :title="issueHint" @click="issue">
          <span v-if="issuing" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-file-add-line me-1"></i>{{ t('customs.operations.issue') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary-light" :disabled="!ci || busyDocId !== null"
          @click="printDoc(dnId, ci)">
          <span v-if="ci && busyDocId === ci.id" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-ci') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary-light" :disabled="!pl || busyDocId !== null"
          @click="printDoc(dnId, pl)">
          <span v-if="pl && busyDocId === pl.id" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-pl') }}
        </button>
        <button type="button" class="btn btn-sm btn-light" @click="toggleHistory">
          <i class="ri-history-line me-1"></i>{{ t('customs.operations.history') }}
        </button>
        <button type="button" class="btn btn-sm btn-light" :disabled="loading" :title="t('customs.operations.refresh')"
          @click="load">
          <i class="ri-refresh-line"></i>
        </button>
      </div>
    </div>

    <div class="card-body">
      <div class="d-flex justify-content-center py-4" v-if="loading && !view">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
      </div>
      <div class="alert alert-danger-transparent mb-0" v-else-if="loadError && !view">{{ loadError }}</div>

      <template v-else-if="view">
        <p class="fs-12 text-muted mb-3" v-if="issueHint">
          <i class="ri-information-line me-1"></i>{{ issueHint }}
        </p>

        <div class="alert alert-warning-transparent" v-if="!view.customs">{{ t('customs.tips.no-snapshot') }}</div>

        <div class="row gy-3">
          <!-- ===== 报关概要 ===== -->
          <div class="col-xxl-4 col-xl-5">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.summary') }}</h6>
            <dl class="row mb-0 fs-13 customs-dl">
              <dt class="col-5 text-muted fw-normal">{{ t('customs.fields.invoice-number') }}</dt>
              <dd class="col-7">{{ customs.invoice_number || '—' }}</dd>
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

            <h6 class="fw-semibold mt-3 mb-2">{{ t('customs.sections.exporter') }}</h6>
            <div class="fs-13" v-if="exporter && (exporter.legal_name_en || exporter.address_en)">
              <div class="fw-semibold">{{ exporter.legal_name_en }}</div>
              <div class="text-muted fs-12">{{ exporter.address_en }}</div>
              <div class="text-muted fs-12" v-if="exporter.phone">{{ exporter.phone }}</div>
            </div>
            <div class="fs-12 text-muted" v-else>—</div>
            <NuxtLink to="/company" class="fs-12"><i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-exporter') }}</NuxtLink>
          </div>

          <!-- ===== 问题清单 ===== -->
          <div class="col-xxl-8 col-xl-7">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.problems') }}</h6>
            <div class="text-success fs-13" v-if="problems.length === 0">
              <i class="ri-checkbox-circle-line me-1"></i>{{ t('customs.tips.no-problems') }}
            </div>
            <div class="mb-2" v-if="errorProblems.length > 0">
              <div class="fw-semibold text-danger fs-13 mb-1">
                <i class="ri-close-circle-line me-1"></i>{{ t('customs.errors') }}（{{ errorProblems.length }}）
              </div>
              <ul class="mb-0 fs-13 ps-3">
                <li v-for="(p, i) in errorProblems" :key="`e-${i}`" :title="p.message || ''">
                  {{ problemText(p) }}
                  <span class="badge bg-light text-default ms-1" v-if="p.goods_code">{{ p.goods_code }}</span>
                  <span class="text-muted fs-11 ms-1" v-if="p.field">({{ p.field }})</span>
                  <NuxtLink to="/company" class="fs-12 ms-1" v-if="p.code === 'EXPORTER_PROFILE_INCOMPLETE'">
                    {{ t('customs.operations.edit-exporter') }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
            <div v-if="warningProblems.length > 0">
              <div class="fw-semibold text-warning fs-13 mb-1">
                <i class="ri-error-warning-line me-1"></i>{{ t('customs.warnings') }}（{{ warningProblems.length }}）
              </div>
              <ul class="mb-0 fs-13 ps-3">
                <li v-for="(p, i) in warningProblems" :key="`w-${i}`" :title="p.message || ''">
                  {{ problemText(p) }}
                  <span class="badge bg-light text-default ms-1" v-if="p.goods_code">{{ p.goods_code }}</span>
                  <span class="text-muted fs-11 ms-1" v-if="p.field">({{ p.field }})</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- ===== 明细 ===== -->
          <div class="col-12">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.lines') }}</h6>
            <div class="table-responsive">
              <table class="table table-sm table-bordered align-middle mb-0 fs-13">
                <thead>
                  <tr>
                    <th scope="col">{{ t('customs.fields.jan') }}</th>
                    <th scope="col">{{ t('customs.fields.goods-name') }}</th>
                    <th scope="col">{{ t('customs.fields.description-en') }}</th>
                    <th scope="col">{{ t('customs.fields.hs-code') }}</th>
                    <th scope="col">{{ t('customs.fields.origin') }}</th>
                    <th scope="col" class="text-end">{{ t('customs.fields.packed-qty') }}</th>
                    <th scope="col" class="text-end">{{ t('customs.fields.unit-value') }}</th>
                    <th scope="col" class="text-end">{{ t('customs.fields.amount') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in lines" :key="line.goods_code"
                    :class="{ 'text-muted': !Number(line.packed_quantity) }">
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
                    <td style="min-width: 150px;">
                      <template v-if="line.origin_country">
                        <span class="fw-semibold">{{ String(line.origin_country).toUpperCase() }}</span>
                        <span class="text-muted fs-12 ms-1">{{ countryName(line.origin_country, locale) }}</span>
                      </template>
                      <template v-else-if="!locked && line.goods_id">
                        <div class="d-flex align-items-center gap-1" style="min-width: 240px;">
                          <div class="flex-fill">
                            <CountrySelect v-model="originDraft[String(line.goods_id)]" size="sm" :clearable="false" />
                          </div>
                          <button type="button" class="btn btn-sm btn-primary"
                            :disabled="!originDraft[String(line.goods_id)] || originSaving[String(line.goods_id)]"
                            @click="saveOrigin(line)">
                            <span v-if="originSaving[String(line.goods_id)]" class="spinner-border spinner-border-sm"></span>
                            <span v-else>{{ t('button.save') }}</span>
                          </button>
                        </div>
                        <div class="fs-11 text-muted mt-1">{{ t('customs.tips.origin-master') }}</div>
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
                    <td colspan="8" class="text-center text-muted py-3">{{ t('common.status.nothing-show') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 合计 -->
            <div class="row justify-content-end mt-2">
              <div class="col-xxl-4 col-xl-5 col-md-7">
                <table class="table table-sm mb-0 fs-13">
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
            </div>
          </div>

          <!-- ===== 箱子 ===== -->
          <div class="col-12">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.packages') }}</h6>
            <DnPackagesEditor :dn-id="dnId" :packages="packagesForEditor" :editable="canEditPackages"
              :readonly-reason="packagesReadonlyReason" @saved="onPackagesSaved" />
          </div>

          <!-- ===== 单证 ===== -->
          <div class="col-12">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.documents') }}</h6>
            <div class="table-responsive" v-if="currentDocuments.length > 0">
              <table class="table table-sm table-bordered align-middle mb-0 fs-13">
                <thead>
                  <tr>
                    <th scope="col">{{ t('customs.fields.doc-type') }}</th>
                    <th scope="col">{{ t('customs.fields.version') }}</th>
                    <th scope="col">{{ t('customs.fields.document-number') }}</th>
                    <th scope="col">{{ t('customs.fields.invoice-date') }}</th>
                    <th scope="col">{{ t('customs.fields.issued-at') }}</th>
                    <th scope="col">{{ t('customs.fields.size') }}</th>
                    <th scope="col">{{ t('common.fields.action') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="doc in currentDocuments" :key="doc.id">
                    <td>{{ docTypeText(doc.doc_type) }}</td>
                    <td>v{{ doc.version }}</td>
                    <td class="font-monospace">{{ doc.document_number }}</td>
                    <td>{{ doc.invoice_date }}</td>
                    <td>{{ $dayjs(doc.issued_at, 'YYYY-MM-DD HH:mm') }}<span class="text-muted ms-1" v-if="doc.issued_by">{{ userText(doc.issued_by) }}</span></td>
                    <td>{{ formatBytes(doc.size_bytes) }}</td>
                    <td>
                      <div class="hstack gap-1">
                        <button type="button" class="btn btn-icon btn-sm btn-primary-light" :title="t('customs.operations.view')"
                          :disabled="busyDocId !== null" @click="viewDoc(dnId, doc)"><i class="ri-eye-line"></i></button>
                        <button type="button" class="btn btn-icon btn-sm btn-primary-light" :title="t('button.print')"
                          :disabled="busyDocId !== null" @click="printDoc(dnId, doc)"><i class="ri-printer-line"></i></button>
                        <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')"
                          :disabled="busyDocId !== null" @click="downloadDoc(dnId, doc)"><i class="ri-download-line"></i></button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-muted fs-13 mb-0" v-else>{{ t('customs.tips.no-documents') }}</p>

            <!-- 历史版本 -->
            <div class="mt-3" v-if="historyOpen">
              <div class="fw-semibold fs-13 mb-2">{{ t('customs.operations.history') }}</div>
              <div class="d-flex justify-content-center py-2" v-if="historyLoading">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
              </div>
              <div class="table-responsive" v-else-if="history.length > 0">
                <table class="table table-sm table-bordered align-middle mb-0 fs-12">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('customs.fields.doc-type') }}</th>
                      <th scope="col">{{ t('customs.fields.version') }}</th>
                      <th scope="col">{{ t('customs.fields.document-number') }}</th>
                      <th scope="col">{{ t('customs.fields.status') }}</th>
                      <th scope="col">{{ t('customs.fields.issued-at') }}</th>
                      <th scope="col">{{ t('customs.fields.void-reason') }}</th>
                      <th scope="col">SHA-256</th>
                      <th scope="col">{{ t('common.fields.action') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="doc in history" :key="doc.id">
                      <td>{{ docTypeText(doc.doc_type) }}</td>
                      <td>v{{ doc.version }}</td>
                      <td class="font-monospace">{{ doc.document_number }}</td>
                      <td>
                        <span class="badge" :class="doc.status === 'void' ? 'bg-danger-transparent' : 'bg-success-transparent'">
                          {{ t(`customs.doc-status.${doc.status === 'void' ? 'void' : 'issued'}`) }}
                        </span>
                      </td>
                      <td>{{ $dayjs(doc.issued_at, 'YYYY-MM-DD HH:mm') }}</td>
                      <td>
                        <template v-if="doc.status === 'void'">
                          {{ voidReasonText(doc.void_reason) }}
                          <span class="text-muted ms-1" v-if="doc.voided_at">{{ $dayjs(doc.voided_at, 'YYYY-MM-DD HH:mm') }}</span>
                        </template>
                      </td>
                      <td class="font-monospace" :title="doc.sha256 || ''">{{ (doc.sha256 || '').slice(0, 12) }}</td>
                      <td>
                        <div class="hstack gap-1">
                          <button type="button" class="btn btn-icon btn-sm btn-primary-light" :title="t('customs.operations.view')"
                            :disabled="busyDocId !== null" @click="viewDoc(dnId, doc)"><i class="ri-eye-line"></i></button>
                          <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')"
                            :disabled="busyDocId !== null" @click="downloadDoc(dnId, doc)"><i class="ri-download-line"></i></button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-muted fs-13 mb-0" v-else>{{ t('customs.tips.no-documents') }}</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.customs-dl dt,
.customs-dl dd {
  margin-bottom: 0.35rem;
}
</style>
