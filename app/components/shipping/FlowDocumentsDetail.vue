<script lang="ts" setup>
/**
 * 发货流程 ·「报关单证」一步的内容（跨境、要报关的出库单）：
 * - 当前 CI / PL（打印、查看、下载）、签发 / 重新签发（issue_documents）、历史版本
 * - 运送申告价额提示（DeclaredValueNotice）
 * - 报关数据的问题：快照里的点「补录」（需 dn_edit），缺原产国就地补录（写入商品主数据），重量 / 出口资料 / 承运商名给对应编辑页
 *   （打包完成前不列「还没打包完 / 还没录箱子」，那是流程状态）
 * - 报关数据明细（概要、出口方、逐行、合计）折叠在最下面
 * 报关视图（GET /dn/<id>/customs）由流程组件读，这里只显示；做了操作 emit changed，流程组件整体刷新。
 */
import {
  CUSTOMS_SNAPSHOT_PROBLEMS,
  CUSTOMS_WORKFLOW_PROBLEMS,
  DN_LOCKED_STATUSES,
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
import type { DeclaredValueMode } from '~/composables/customs/carrierShipment'
import { flowActionEnabled, flowActionOf, flowActionReasonText, type FlowStep } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  step: FlowStep
  view: CustomsView | null
  loading?: boolean
  loadError?: string | null
  dnStatus?: string | null
  warehouseId?: number | string | null
  /** 箱子有未保存的修改：单证会按已保存的旧箱子生成，先拦下 */
  packagesDirty?: boolean
  declaredMode?: DeclaredValueMode
}>(), {
  loading: false,
  loadError: null,
  dnStatus: null,
  warehouseId: null,
  packagesDirty: false,
  declaredMode: 'manual',
})

const emit = defineEmits<{
  (e: 'changed'): void
  (e: 'edit-customs'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
/** 签发时刻按流程提供的时区（DN 所属仓库）显示；流程卡片标题旁已标出时区 */
const { format: formatZoned } = useTimeZone()
const zonedTime = (value: unknown, pattern: string) => formatZoned(value, pattern, { withZone: false })
const staffStore = useStaffStore()
const { busyDocId, printDoc, viewDoc, downloadDoc, downloadRawDoc } = useCustomsPdfActions()

const locked = computed(() => !!props.view?.locked || DN_LOCKED_STATUSES.includes(String(props.dnStatus || '')))
const isPacked = computed(() => props.dnStatus === 'packed')
/** 打包完成（或已发货只读）后才办单证；打包中只补数据 */
const shippingStage = computed(() => locked.value || isPacked.value)
const ready = computed(() => !!props.view?.ready)

const problems = computed<CustomsProblem[]>(() => {
  const all = props.view?.problems || []
  // 「还没打包完 / 还没录箱子」是流程状态，由流程的打包一步表达
  return all.filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code))
})
const errorCount = computed(() => problems.value.filter((p: CustomsProblem) => p.level === 'error').length)
const canEditCustoms = computed(() => !locked.value && !!props.view?.customs && staffStore.hasPermission('dn_edit'))
const hasSnapshotProblems = computed(() => problems.value.some((p: CustomsProblem) => CUSTOMS_SNAPSHOT_PROBLEMS.includes(p.code)))
const originMissingLines = computed<CustomsLine[]>(() =>
  (props.view?.lines || []).filter((line: CustomsLine) => !line.origin_country && !!line.goods_id))

const ci = computed(() => pickCurrentDocument(props.view?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(props.view?.current_documents, 'packing_list'))
const outdated = computed(() => !locked.value && !!props.view?.documents_outdated && !!(ci.value || pl.value))

// ------------------ 签发 ----------------------
const issueAction = computed(() => flowActionOf(props.step, 'issue_documents'))
const canIssue = computed(() => flowActionEnabled(props.step, 'issue_documents', !locked.value && isPacked.value && ready.value))
const issueHint = computed(() => {
  if (locked.value) return ''
  if (issueAction.value && !issueAction.value.enabled) return flowActionReasonText(issueAction.value, t, te, { carrier: t('customs.carrier.carrier-fallback') })
  if (!isPacked.value) return t('customs.tips.issue-need-packed')
  if (!ready.value) return t('customs.tips.issue-not-ready')
  if (props.packagesDirty) return t('customs.tips.packages-unsaved-before-issue')
  return ''
})
const issuing = ref(false)

const issue = async () => {
  if (!canIssue.value || issuing.value) return
  if (props.packagesDirty) {
    showAlert(t('customs.operations.issue'), t('customs.tips.packages-unsaved-before-issue'), 'warning')
    return
  }
  const prevVersion = Math.max(0, ...(props.view?.current_documents || []).map((d: CustomsDocumentMeta) => Number(d.version) || 0))
  issuing.value = true
  await httpRequest<any>(`/api/warehouse/dn/${props.dnId}/customs-documents/issue`, {
    method: 'POST',
    body: {},
    onSuccess: (data) => {
      const version = data?.version ?? ''
      showToast(t(version !== '' && Number(version) === prevVersion ? 'customs.tips.issued-same' : 'customs.tips.issued-new', { version }), 'success')
    },
    onError: (error) => {
      // 16068：单证条件不全（重新读取后问题清单是最新的）
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      issuing.value = false
    },
  })
  if (historyOpen.value) await loadHistory()
  emit('changed')
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

// 单证变了（别处签发 / 改箱子作废）：打开着的历史跟着刷新
watch(() => (props.view?.current_documents || []).map((d: CustomsDocumentMeta) => d.id).join(','), () => {
  if (historyOpen.value) loadHistory()
})

const docTypeText = (type: string) => {
  const key = `customs.doc-types.${type}`
  return te(key) ? t(key) : type
}
const voidReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.void-reasons.${reason}`
  return te(key) ? t(key) : reason
}
const userText = (u: any) => formatUserRef(u, t)

// ------------------ 缺原产国：就地补录（写入商品主数据） ----------------------
const originDraft = reactive<Record<string, string | null>>({})
const originSaving = reactive<Record<string, boolean>>({})

const saveOrigin = async (line: CustomsLine) => {
  if (!line.goods_id) return
  const key = String(line.goods_id)
  const code = originDraft[key]
  if (!code) return
  originSaving[key] = true
  let saved = false
  // 只改原产国的接口（goods_edit / sorting_edit / packing_edit 任一即可），与 PDA 一致
  await httpRequest(`/api/warehouse/goods/${line.goods_id}/origin-country`, {
    method: 'PUT',
    body: { origin_country: code },
    onSuccess: () => {
      saved = true
      showToast(t('action-results.op-success', { operation: t('goods.operations.edit'), entity: line.goods_code }), 'success')
      delete originDraft[key]
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      originSaving[key] = false
    },
  })
  if (saved) emit('changed')
}

/** 报关数据明细：默认收起 */
const dataOpen = ref(false)
</script>

<template>
  <div class="flow-documents">
    <div class="py-1" v-if="loading && !view">
      <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
    </div>
    <div class="alert alert-danger-transparent fs-13 mb-0" v-else-if="loadError && !view">{{ loadError }}</div>

    <template v-else-if="view">
      <div class="alert alert-warning-transparent fs-13 mb-2" v-if="!view.customs">{{ t('customs.tips.no-snapshot') }}</div>
      <div class="alert alert-danger-transparent fs-13 py-2 mb-2" role="alert" v-if="outdated">
        <i class="ri-error-warning-line me-1"></i>{{ t('customs.tips.documents-outdated') }}
      </div>

      <!-- 当前单证 + 签发 -->
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="fs-13" v-if="ci || pl">
          <span v-if="ci" class="me-2">{{ docTypeText('commercial_invoice') }} v{{ ci.version }}</span>
          <span v-if="pl">{{ docTypeText('packing_list') }} v{{ pl.version }}</span>
        </span>
        <span class="fs-13 text-muted" v-else>{{ t('customs.tips.no-documents') }}</span>
        <template v-if="shippingStage">
          <button type="button" class="btn btn-sm" :class="outdated ? 'btn-warning' : (ci && pl ? 'btn-light' : 'btn-primary')"
            v-if="!locked" :disabled="!canIssue || issuing || packagesDirty" :title="issueHint" @click="issue">
            <span v-if="issuing" class="spinner-border spinner-border-sm me-1"></span>
            {{ outdated ? t('customs.operations.reissue') : (ci && pl ? t('customs.operations.issue-again') : t('customs.operations.issue')) }}
          </button>
          <button type="button" class="btn btn-sm btn-primary-light" :disabled="busyDocId !== null" v-if="ci"
            @click="printDoc(dnId, ci)">
            <span v-if="busyDocId === ci.id" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-ci') }}
          </button>
          <button type="button" class="btn btn-sm btn-primary-light" :disabled="busyDocId !== null" v-if="pl"
            @click="printDoc(dnId, pl)">
            <span v-if="busyDocId === pl.id" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-pl') }}
          </button>
          <button type="button" class="btn btn-sm btn-link px-0 ms-1" @click="toggleHistory">
            {{ t('customs.operations.history') }}<i class="ms-1" :class="historyOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"></i>
          </button>
        </template>
      </div>
      <p class="fs-12 text-muted mb-0 mt-1" v-if="!locked && issueHint">{{ issueHint }}</p>

      <!-- 历史版本 -->
      <div class="mt-2" v-if="historyOpen">
        <div class="py-2" v-if="historyLoading">
          <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
        </div>
        <div class="table-responsive" v-else-if="history.length > 0">
          <table class="table table-sm align-middle mb-0 fs-12">
            <thead>
              <tr>
                <th scope="col">{{ t('customs.fields.doc-type') }}</th>
                <th scope="col">{{ t('customs.fields.version') }}</th>
                <th scope="col">{{ t('customs.fields.document-number') }}</th>
                <th scope="col">{{ t('customs.fields.issued-at') }}</th>
                <th scope="col">{{ t('customs.fields.status') }}</th>
                <th scope="col">{{ t('customs.fields.size') }}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="doc in history" :key="doc.id" :class="{ 'text-muted': doc.status === 'void' }">
                <td>{{ docTypeText(doc.doc_type) }}</td>
                <td>v{{ doc.version }}</td>
                <td class="font-monospace" :title="doc.sha256 ? `SHA-256 ${doc.sha256}` : ''">{{ doc.document_number }}</td>
                <td>
                  {{ zonedTime(doc.issued_at, 'YYYY-MM-DD HH:mm') }}
                  <span class="text-muted ms-1" v-if="doc.issued_by">{{ userText(doc.issued_by_user ?? doc.issued_by) }}</span>
                </td>
                <td>
                  <template v-if="doc.status === 'void'">
                    {{ t('customs.doc-status.void') }}<template v-if="doc.void_reason"> · {{ voidReasonText(doc.void_reason) }}</template>
                  </template>
                  <template v-else>{{ t('customs.doc-status.issued') }}</template>
                </td>
                <td>{{ formatBytes(doc.size_bytes) }}</td>
                <td class="text-end">
                  <!-- PDF（CI / PL / PDF 面单）：查看、下载；ZPL / EPL 指令文件面单：只能按原格式下载 -->
                  <div class="hstack gap-1 justify-content-end" v-if="isPdfDocument(doc)">
                    <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.view')"
                      :disabled="busyDocId !== null" @click="viewDoc(dnId, doc)"><i class="ri-eye-line"></i></button>
                    <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')"
                      :disabled="busyDocId !== null" @click="downloadDoc(dnId, doc)"><i class="ri-download-line"></i></button>
                  </div>
                  <button type="button" class="btn btn-icon btn-sm btn-light" :title="t('customs.operations.download')" v-else
                    :disabled="busyDocId !== null" @click="downloadRawDoc(dnId, doc)"><i class="ri-download-line"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-muted fs-13 mb-0" v-else>{{ t('customs.tips.no-documents') }}</p>
      </div>

      <div class="mt-2" v-if="view.customs">
        <DeclaredValueNotice compact :customs="view.customs" :mode="declaredMode" />
      </div>

      <!-- 先处理 / 请留意：报关数据的问题 -->
      <div class="flow-documents-problems mt-2" :class="errorCount > 0 ? 'is-error' : 'is-warning'" v-if="problems.length > 0">
        <div class="fw-semibold fs-13 mb-2">
          <i class="me-1" :class="errorCount > 0 ? 'ri-error-warning-line' : 'ri-information-line'"></i>
          {{ errorCount > 0 ? t('shipping.documents.problems-title', { count: errorCount }) : t('shipping.documents.warnings-title', { count: problems.length }) }}
        </div>
        <CustomsProblemList :problems="problems" :lines="view.lines" :warehouse-id="warehouseId"
          :can-edit-customs="canEditCustoms" @edit-customs="emit('edit-customs')" />

        <!-- 缺原产国：就地补录到商品主数据 -->
        <div class="mt-2" v-if="!locked && originMissingLines.length > 0">
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

        <div class="d-flex flex-wrap align-items-center gap-2 mt-2" v-if="hasSnapshotProblems">
          <button type="button" class="btn btn-sm btn-primary-light" v-if="canEditCustoms" @click="emit('edit-customs')">
            <i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-customs') }}
          </button>
          <span class="fs-12 text-muted" v-else-if="!locked">{{ t('customs.tips.data-need-dn-edit') }}</span>
        </div>
      </div>
      <div class="fs-13 text-success mt-2" v-else-if="view.customs">
        <i class="ri-checkbox-circle-line me-1"></i>{{ t('customs.tips.no-problems') }}
      </div>

      <!-- 报关数据明细 -->
      <div class="mt-2" v-if="view.customs">
        <button type="button" class="btn btn-sm btn-link px-0" @click="dataOpen = !dataOpen">
          <i class="ri-file-list-3-line me-1"></i>{{ t('shipping.documents.customs-data') }}
          <i class="ms-1" :class="dataOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"></i>
        </button>
        <button type="button" class="btn btn-sm btn-link px-0 ms-3" v-if="canEditCustoms" @click="emit('edit-customs')">
          <i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-customs') }}
        </button>
        <div class="mt-2" v-if="dataOpen">
          <CustomsDataDetail :view="view" :warehouse-id="warehouseId" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.flow-documents-problems {
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
}

.flow-documents-problems.is-error {
  background: rgba(var(--danger-rgb), 0.05);
  border: 1px solid rgba(var(--danger-rgb), 0.25);
}

.flow-documents-problems.is-warning {
  background: rgba(var(--warning-rgb), 0.06);
  border: 1px solid rgba(var(--warning-rgb), 0.25);
}
</style>
