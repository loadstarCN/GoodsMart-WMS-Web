<script lang="ts" setup>
/**
 * 打包 / 配送任务 · 海外发货（箱子、承运商运单、CI / PL）
 *
 * 打包之后的出荷手续都在任务页上做完，不用再回出库单详情：
 * - 问题清单；缺原产国的商品可就地补录（写入商品主数据），其余报关数据随出库单从下单方传来，只提示到出库单核对
 * - 箱子编辑（cm / kg 录入，保存换算 mm；DN 已拣货 / 已打包时可编辑）
 * - 承运商运单（FedEx 自动建单、面单、取消）
 * - 生成 / 重新生成单证、打印 CI / PL、历史版本
 * - DN 发货后只读（仍可查看、打印）
 * 默认插槽放在卡片正文最上面（配送页放发货拦截原因、流程提示）。
 * DN 状态变了（如打包完成）只重新读取、不重建组件，免得丢掉未保存的箱子。
 */
import { countryName } from '~/data/countries'
import {
  DN_LOCKED_STATUSES,
  DN_PACKAGE_EDITABLE_STATUSES,
  formatBytes,
  formatUserRef,
  isPdfDocument,
  normalizeDocumentList,
  pickCurrentDocument,
  useCustomsPdfActions,
  type CustomsDocumentMeta,
  type CustomsLine,
  type CustomsProblem,
  type CustomsView,
} from '~/composables/customs/customsDocuments'
import {
  carrierDeclaredValueOverride,
  declaredValueModeOf,
  type CarrierShipmentStatus,
} from '~/composables/customs/carrierShipment'

const props = defineProps<{
  dnId: number | string
  dnStatus?: string | null
  /** DN 所属仓库：出口资料不全时提供跳转 */
  warehouseId?: number | string | null
}>()

const emit = defineEmits<{
  /** 单证或运单变了（生成单证、建单 / 取消运单）：配送页据此同步运单号 */
  (e: 'changed'): void
  /** 读到的承运商运单状态（读不到为 null） */
  (e: 'carrier-status', status: CarrierShipmentStatus | null): void
}>()

const { t, te, locale } = useI18n()
const { bizErrorMessage } = useBizError()
const { busyDocId, printDoc, viewDoc, downloadDoc, downloadRawDoc } = useCustomsPdfActions()

const loading = ref(false)
const loadError = ref<string | null>(null)
const view = ref<CustomsView | null>(null)
const issuing = ref(false)
const carrierRef = ref<{ reload: () => Promise<void> } | null>(null)
const carrierStatus = ref<CarrierShipmentStatus | null>(null)
/** 箱子编辑器（暴露 dirty：有未保存的修改） */
const packagesRef = ref<{ reload: () => Promise<void>; dirty: boolean } | null>(null)
/** 箱子有未保存的修改：此时建运单 / 生成单证会用已保存的旧箱子，先拦下提示保存 */
const packagesDirty = computed(() => !!packagesRef.value?.dirty)

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
}

onMounted(load)

/** 单证数据与承运商运单一起刷新（箱子、单证变了，建单的前置条件也会变） */
const reloadAll = async () => {
  await load()
  await carrierRef.value?.reload()
}

// 打包完成等 DN 状态变化：建运单、生成单证的前置条件随之改变
watch(() => props.dnStatus, (next: string | null | undefined, prev: string | null | undefined) => {
  if (next !== prev) reloadAll()
})

const onCarrierStatus = (status: CarrierShipmentStatus | null) => {
  carrierStatus.value = status
  emit('carrier-status', status)
}

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
  if (packagesDirty.value) return t('customs.tips.packages-unsaved-before-issue')
  return ''
})
const packagesReadonlyReason = computed(() =>
  locked.value ? t('customs.status.locked') : t('customs.packages.readonly-status')
)

const problems = computed<CustomsProblem[]>(() => view.value?.problems || [])
const errorProblems = computed(() => problems.value.filter((p: CustomsProblem) => p.level === 'error'))
const warningProblems = computed(() => problems.value.filter((p: CustomsProblem) => p.level !== 'error'))
/** 缺原产国、能就地补录的商品（原产国是商品主数据，仓库可以补；其余报关数据来自下单方） */
const originMissingLines = computed<CustomsLine[]>(() =>
  (view.value?.lines || []).filter((line: CustomsLine) => !line.origin_country && !!line.goods_id))
const ci = computed(() => pickCurrentDocument(view.value?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(view.value?.current_documents, 'packing_list'))
const currentDocuments = computed(() => [ci.value, pl.value].filter((d): d is CustomsDocumentMeta => !!d))
const packagesForEditor = computed(() => view.value?.packages || [])
const packageCount = computed(() => view.value?.totals?.package_count ?? packagesForEditor.value.length)
/** 申告价额提示：未启用自动建单 = 手工填写；已自动建单 = 已随运单提交 */
const declaredValueMode = computed(() => declaredValueModeOf(carrierStatus.value))
/** 自动建单实际（将）提交的申告价额与快照不同时（被压到已打包货值） */
const carrierDeclaredValue = computed(() => carrierDeclaredValueOverride(carrierStatus.value))
/** 当前单证与最新数据（如新存的运单号）不一致 → 需要重新生成 */
const outdated = computed(() => !locked.value && !!view.value?.documents_outdated && !!(ci.value || pl.value))

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
const EXPORTER_FIELD_KEYS: Record<string, string> = {
  legal_name_en: 'company.fields.legal-name-en',
  address_en: 'company.fields.address-en',
  phone: 'common.fields.phone',
  country_code: 'company.fields.country-code',
}
const problemFieldText = (p: CustomsProblem) => {
  if (!p.field) return ''
  const name = String(p.field).split('.').pop() || ''
  if (p.code === 'EXPORTER_PROFILE_INCOMPLETE' && EXPORTER_FIELD_KEYS[name]) return t(EXPORTER_FIELD_KEYS[name])
  return String(p.field)
}
// 签发人：后端只给用户 id 时显示「用户 #id」
const userText = (u: any) => formatUserRef(u, t)

// ------------------ 生成单证 ----------------------
const issue = async () => {
  if (!canIssue.value || issuing.value) return
  // 箱子有未保存的修改：单证会按已保存的旧箱子生成，先保存箱子
  if (packagesDirty.value) {
    showAlert(t('customs.operations.issue'), t('customs.tips.packages-unsaved-before-issue'), 'warning')
    return
  }
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
      await reloadAll()
      if (historyOpen.value) await loadHistory()
      emit('changed')
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
  // 只改原产国的接口（goods_edit / sorting_edit / packing_edit 任一即可），与 PDA 一致
  await httpRequest(`/api/warehouse/goods/${line.goods_id}/origin-country`, {
    method: 'PUT',
    body: { origin_country: code },
    onSuccess: async () => {
      showToast(t('action-results.op-success', { operation: t('goods.operations.edit'), entity: line.goods_code }), 'success')
      delete originDraft[key]
      await reloadAll()
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
  await reloadAll()
  if (historyOpen.value) await loadHistory()
}

// ------------------ 承运商运单：建单 / 取消后运单号变了，单证随之更新 ----------------------
const onCarrierChanged = async () => {
  await load()
  if (historyOpen.value) await loadHistory()
  emit('changed')
}

defineExpose({ reload: reloadAll })
</script>

<template>
  <div class="card custom-card" id="export-shipping">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="card-title d-flex align-items-center flex-wrap gap-2">
        <span><i class="ri-earth-line me-1 align-middle"></i>{{ t('customs.shipping-title') }}</span>
        <template v-if="view">
          <span class="badge bg-secondary-transparent" v-if="locked">
            <i class="ri-lock-line me-1"></i>{{ t('customs.status.locked') }}
          </span>
          <span class="badge bg-danger" v-if="outdated">
            <i class="ri-error-warning-line me-1"></i>{{ t('customs.status.outdated') }}
          </span>
          <span class="badge bg-success-transparent" v-else-if="ci && pl">
            <i class="ri-checkbox-circle-line me-1"></i>{{ t('customs.status.issued') }}
          </span>
          <span class="badge bg-warning-transparent" v-else>{{ t('customs.status.not-issued') }}</span>
          <span class="badge" :class="ready ? 'bg-success-transparent' : 'bg-danger-transparent'" v-if="!locked">
            {{ ready ? t('customs.status.ready') : t('customs.status.not-ready') }}
          </span>
        </template>
      </div>
      <button type="button" class="btn btn-sm btn-light" :disabled="loading" :title="t('customs.operations.refresh')"
        @click="reloadAll">
        <i class="ri-refresh-line"></i>
      </button>
    </div>

    <div class="card-body">
      <slot />

      <div class="d-flex justify-content-center py-4" v-if="loading && !view">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
      </div>
      <div class="alert alert-danger-transparent mb-0" v-else-if="loadError && !view">{{ loadError }}</div>

      <template v-else-if="view">
        <div class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert" v-if="outdated">
          <div>
            <i class="ri-error-warning-line me-1 fs-16 align-middle"></i>
            <span class="fw-semibold">{{ t('customs.tips.documents-outdated') }}</span>
          </div>
          <button type="button" class="btn btn-sm btn-light" :disabled="!canIssue || issuing" @click="issue">
            <span v-if="issuing" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-file-add-line me-1"></i>{{ t('customs.operations.reissue') }}
          </button>
        </div>

        <div class="alert alert-warning-transparent" v-if="!view.customs">{{ t('customs.tips.no-snapshot') }}</div>
        <DeclaredValueNotice :customs="view.customs" :mode="declaredValueMode" :carrier-value="carrierDeclaredValue" v-else />

        <div class="row gy-3">
          <!-- ===== 问题清单 ===== -->
          <div class="col-12" v-if="problems.length > 0">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.problems') }}</h6>
            <div class="mb-2" v-if="errorProblems.length > 0">
              <div class="fw-semibold text-danger fs-13 mb-1">
                <i class="ri-close-circle-line me-1"></i>{{ t('customs.errors') }}（{{ errorProblems.length }}）
              </div>
              <ul class="mb-0 fs-13 ps-3">
                <li v-for="(p, i) in errorProblems" :key="`e-${i}`" :title="p.message || ''">
                  {{ problemText(p) }}
                  <span class="badge bg-light text-default ms-1" v-if="p.goods_code">{{ p.goods_code }}</span>
                  <span class="text-muted fs-11 ms-1" v-if="p.field">({{ problemFieldText(p) }})</span>
                  <template v-if="p.code === 'EXPORTER_PROFILE_INCOMPLETE'">
                    <NuxtLink to="/company" class="fs-12 ms-1">{{ t('customs.operations.edit-exporter') }}</NuxtLink>
                    <NuxtLink :to="`/warehouse/edit/${warehouseId}`" class="fs-12 ms-2" v-if="warehouseId">
                      {{ t('customs.operations.edit-warehouse') }}
                    </NuxtLink>
                  </template>
                </li>
              </ul>
            </div>
            <div class="mb-2" v-if="warningProblems.length > 0">
              <div class="fw-semibold text-warning fs-13 mb-1">
                <i class="ri-error-warning-line me-1"></i>{{ t('customs.warnings') }}（{{ warningProblems.length }}）
              </div>
              <ul class="mb-0 fs-13 ps-3">
                <li v-for="(p, i) in warningProblems" :key="`w-${i}`" :title="p.message || ''">
                  {{ problemText(p) }}
                  <span class="badge bg-light text-default ms-1" v-if="p.goods_code">{{ p.goods_code }}</span>
                  <span class="text-muted fs-11 ms-1" v-if="p.field">({{ problemFieldText(p) }})</span>
                </li>
              </ul>
            </div>

            <!-- 缺原产国：就地补录到商品主数据 -->
            <div class="border rounded p-2 mb-2" v-if="!locked && originMissingLines.length > 0">
              <div class="fw-semibold fs-13 mb-2">{{ t('customs.tips.origin-fix-title') }}</div>
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2" v-for="line in originMissingLines" :key="line.goods_code">
                <div class="fs-13" style="min-width: 220px;">
                  <span class="font-monospace me-1">{{ line.goods_code }}</span>
                  <span class="text-muted">{{ line.goods_name }}</span>
                </div>
                <div style="min-width: 240px;">
                  <CountrySelect v-model="originDraft[String(line.goods_id)]" size="sm" :clearable="false" />
                </div>
                <button type="button" class="btn btn-sm btn-primary"
                  :disabled="!originDraft[String(line.goods_id)] || originSaving[String(line.goods_id)]"
                  @click="saveOrigin(line)">
                  <span v-if="originSaving[String(line.goods_id)]" class="spinner-border spinner-border-sm"></span>
                  <span v-else>{{ t('button.save') }}</span>
                </button>
              </div>
              <div class="fs-11 text-muted">{{ t('customs.tips.origin-master') }}</div>
            </div>

            <p class="fs-12 text-muted mb-0">
              <i class="ri-information-line me-1"></i>{{ t('customs.tips.data-from-order') }}
              <NuxtLink :to="`/dn/detail/${dnId}#customs-documents`" class="ms-1">{{ t('customs.operations.view-dn-data') }}</NuxtLink>
            </p>
          </div>

          <!-- ===== 箱子 ===== -->
          <div class="col-12">
            <h6 class="fw-semibold mb-2">{{ t('customs.sections.packages') }}</h6>
            <DnPackagesEditor ref="packagesRef" :dn-id="dnId" :packages="packagesForEditor" :editable="canEditPackages"
              :readonly-reason="packagesReadonlyReason" @saved="onPackagesSaved" />
          </div>

          <!-- ===== 承运商运单 ===== -->
          <div class="col-12">
            <CarrierShipmentPanel ref="carrierRef" :dn-id="dnId" :locked="locked" :customs="view.customs"
              :packages-dirty="packagesDirty" :warehouse-id="warehouseId" :package-count="packageCount"
              @status="onCarrierStatus" @changed="onCarrierChanged" />
          </div>

          <!-- ===== 单证 ===== -->
          <div class="col-12">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h6 class="fw-semibold mb-0">{{ t('customs.sections.documents') }}</h6>
              <div class="btn-list">
                <button type="button" class="btn btn-sm" v-if="!locked" :class="outdated ? 'btn-danger btn-issue-outdated' : 'btn-primary'"
                  :disabled="!canIssue || issuing" :title="issueHint" @click="issue">
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
              </div>
            </div>
            <p class="fs-12 text-muted mb-2" v-if="issueHint">
              <i class="ri-information-line me-1"></i>{{ issueHint }}
            </p>

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
                    <td>{{ $dayjs(doc.issued_at, 'YYYY-MM-DD HH:mm') }}<span class="text-muted ms-1" v-if="doc.issued_by">{{ userText(doc.issued_by_user ?? doc.issued_by) }}</span></td>
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
                      <td>
                        <!-- PDF（CI / PL / PDF 面单）：查看、下载；ZPL / EPL 指令文件面单：只能按原格式下载 -->
                        <div class="hstack gap-1" v-if="isPdfDocument(doc)">
                          <button type="button" class="btn btn-icon btn-sm btn-primary-light" :title="t('customs.operations.view')"
                            :disabled="busyDocId !== null" @click="viewDoc(dnId, doc)"><i class="ri-eye-line"></i></button>
                          <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')"
                            :disabled="busyDocId !== null" @click="downloadDoc(dnId, doc)"><i class="ri-download-line"></i></button>
                        </div>
                        <div class="hstack gap-1" v-else>
                          <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')"
                            :disabled="busyDocId !== null" @click="downloadRawDoc(dnId, doc)"><i class="ri-download-line"></i></button>
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
.btn-issue-outdated {
  box-shadow: 0 0 0 0.2rem rgba(var(--danger-rgb, 220, 53, 69), 0.35);
}
</style>
