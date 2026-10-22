<script lang="ts" setup>
/**
 * 打包 / 配送任务 · 海外发货：按「箱子 → 单证 → 运单 → 发货」排开，每步一行状态 + 该做的操作。
 * 单证（CI / PL）不印运单号和承运商，打包完成就能出：PL 放箱内、CI 随箱；运单和承运商是配送的事。
 * 打包页（stage = packing）只有箱子、单证两步；配送页四步都有。
 *
 * - 打包中（DN 未到 packed）：只能录箱子；单证、运单显示「打包完成后」。「还没打包完 / 还没录箱子」是流程状态，不当问题列
 * - 打包完成后（及发货后只读）：单证（生成 / 打印 CI、PL、历史版本）、运单（配送页：CarrierShipmentPanel，有在线对接就建运单，
 *   没有就填运单号）
 * - 报关数据的问题统一列在最下面「先处理」：快照里的点「补录」（需 dn_edit），缺原产国就地补录（写入商品主数据），
 *   重量 / 出口资料 / 承运商名给对应编辑页；运单这一步只列它自己的原因（hiddenBlockerCodes 去重）
 * - 默认插槽放在卡片正文最上面（配送页放发货拦截原因）；ship-actions 插槽放「完成发货」之类的页面操作
 * DN 状态变了（如打包完成）只重新读取、不重建组件，免得丢掉未保存的箱子。
 */
import {
  CUSTOMS_SNAPSHOT_PROBLEMS,
  CUSTOMS_WORKFLOW_PROBLEMS,
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
  carrierSummaryState,
  declaredValueModeOf,
  isActiveShipment,
  type CarrierShipmentStatus,
} from '~/composables/customs/carrierShipment'

const props = withDefaults(defineProps<{
  dnId: number | string
  dnStatus?: string | null
  /** DN 所属仓库：出口资料不全时提供跳转 */
  warehouseId?: number | string | null
  /** 配送任务页：当前任务（没有在线对接时在「运单」这一步直接填运单号） */
  taskId?: number | string | null
  /** 配送任务还能改运单号（pending / in_progress） */
  trackingEditable?: boolean
  /** packing：打包页，只有箱子、单证；delivery：配送页，再加运单、发货 */
  stage?: 'packing' | 'delivery'
}>(), {
  dnStatus: null,
  warehouseId: null,
  taskId: null,
  trackingEditable: false,
  stage: 'delivery',
})

const emit = defineEmits<{
  /** 单证或运单变了（生成单证、建单 / 取消运单、存运单号）：配送页据此同步运单号 */
  (e: 'changed'): void
  /** 读到的承运商运单状态（读不到为 null） */
  (e: 'carrier-status', status: CarrierShipmentStatus | null): void
}>()

const { t, te } = useI18n()
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

/** 打包完成（或已发货只读）后才办运单、单证；打包中只录箱子、补数据 */
const shippingStage = computed(() => locked.value || isPacked.value)
/** 打包中不把「还没打包完 / 还没录箱子」当问题列出 */
const problems = computed<CustomsProblem[]>(() => {
  const all = view.value?.problems || []
  return shippingStage.value ? all : all.filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code))
})
/** 流程状态类的问题（还没打包完 / 还没录箱子）由步骤自己表达，不列在「先处理」里 */
const listedProblems = computed(() => problems.value.filter((p: CustomsProblem) => !CUSTOMS_WORKFLOW_PROBLEMS.includes(p.code)))
const errorCount = computed(() => listedProblems.value.filter((p: CustomsProblem) => p.level === 'error').length)
/** 「先处理」里列过的问题码：运单这一步不再重复 */
const listedProblemCodes = computed(() => listedProblems.value.map((p: CustomsProblem) => p.code))
const staffStore = useStaffStore()
/** 能补录报关快照：DN 未发货、有出库单编辑权限（PUT customs 需 dn_edit） */
const canEditCustoms = computed(() => !locked.value && !!view.value?.customs && staffStore.hasPermission('dn_edit'))
const hasSnapshotProblems = computed(() => listedProblems.value.some((p: CustomsProblem) => CUSTOMS_SNAPSHOT_PROBLEMS.includes(p.code)))
const editorOpen = ref(false)
/** 缺原产国、能就地补录的商品（原产国是商品主数据，仓库可以补；其余报关数据来自下单方） */
const originMissingLines = computed<CustomsLine[]>(() =>
  (view.value?.lines || []).filter((line: CustomsLine) => !line.origin_country && !!line.goods_id))
const ci = computed(() => pickCurrentDocument(view.value?.current_documents, 'commercial_invoice'))
const pl = computed(() => pickCurrentDocument(view.value?.current_documents, 'packing_list'))
const packagesForEditor = computed(() => view.value?.packages || [])
const packageCount = computed(() => view.value?.totals?.package_count ?? packagesForEditor.value.length)
/** 申告价额：没有在线对接时要在承运商网站手工填，提示金额；有对接时运单这一步自己说明 */
const declaredValueMode = computed(() => declaredValueModeOf(carrierStatus.value))
const carrierDeclaredValue = computed(() => carrierDeclaredValueOverride(carrierStatus.value))
/** 当前单证与最新数据（如新存的运单号）不一致 → 需要重新生成 */
const outdated = computed(() => !locked.value && !!view.value?.documents_outdated && !!(ci.value || pl.value))

const docTypeText = (type: string) => {
  const key = `customs.doc-types.${type}`
  return te(key) ? t(key) : type
}
const voidReasonText = (reason: string | null | undefined) => {
  if (!reason) return ''
  const key = `customs.void-reasons.${reason}`
  return te(key) ? t(key) : reason
}
// 签发人：后端只给用户 id 时显示「用户 #id」
const userText = (u: any) => formatUserRef(u, t)

// ------------------ 每一步的状态与概要 ----------------------
type StepState = 'done' | 'current' | 'todo' | 'warning'

/** 箱子：录了、存了就算完成；打包中、还没录或有未保存的修改是「现在该做」 */
const packagesOpen = ref<boolean | null>(null)
const packagesExpanded = computed(() => packagesOpen.value ?? (!shippingStage.value || packageCount.value === 0))
const packagesStep = computed<{ state: StepState; summary: string }>(() => {
  if (packagesDirty.value) return { state: 'warning', summary: t('customs.steps.packages-unsaved') }
  if (packageCount.value === 0) {
    return { state: canEditPackages.value ? 'current' : 'todo', summary: t('customs.steps.packages-empty') }
  }
  const weight = view.value?.totals?.gross_weight_kg
  return {
    state: shippingStage.value ? 'done' : 'current',
    summary: t('customs.steps.packages-summary', { count: packageCount.value, weight: weight ?? '—' }),
  }
})

/** 运单：按承运商运单的状态 */
const shipmentStep = computed<{ state: StepState; summary: string }>(() => {
  if (!shippingStage.value) return { state: 'todo', summary: t('customs.steps.after-packed') }
  const status = carrierStatus.value
  if (!status) return { state: 'current', summary: '' }
  const summary = carrierSummaryState(status)
  if (summary === 'active') return { state: 'done', summary: status.shipment?.tracking_number || '' }
  if (summary === 'unresolved') return { state: 'warning', summary: t('customs.carrier.status.unresolved') }
  if (summary === 'cancel-unresolved') return { state: 'warning', summary: t('customs.carrier.status.cancel-unresolved') }
  if (summary === 'creating') return { state: 'current', summary: t('customs.carrier.status.creating') }
  if (summary === 'cancelling') return { state: 'current', summary: t('customs.carrier.status.cancelling') }
  if (status.tracking_number) return { state: 'done', summary: status.tracking_number }
  if (locked.value) return { state: 'todo', summary: '' }
  if (!status.carrier) return { state: 'warning', summary: t('customs.carrier.status.no-carrier') }
  if (!status.integration) return { state: 'current', summary: t('customs.carrier.status.manual-pending') }
  if (status.can_create) return { state: 'current', summary: t('customs.carrier.status.none') }
  return { state: 'warning', summary: t('customs.carrier.status.blocked') }
})
const carrierTag = computed(() => carrierStatus.value?.integration?.name || carrierStatus.value?.carrier?.name || '')
const hasShipment = computed(() =>
  isActiveShipment(carrierStatus.value?.shipment ?? null) || (!!carrierStatus.value?.tracking_number && !carrierStatus.value?.unresolved))

/** 配送页才有运单、发货两步 */
const forDelivery = computed(() => props.stage !== 'packing')

/** 单证：CI 和 PL 都有、不过期就算完成 */
const documentsVersion = computed(() => Math.max(0, ...[ci.value, pl.value].filter(Boolean).map((d) => Number(d?.version) || 0)))
const documentsStep = computed<{ state: StepState; summary: string }>(() => {
  if (!shippingStage.value) return { state: 'todo', summary: t('customs.steps.after-packed') }
  if (outdated.value) return { state: 'warning', summary: t('customs.steps.documents-outdated') }
  if (ci.value && pl.value) return { state: 'done', summary: t('customs.steps.documents-issued', { version: documentsVersion.value }) }
  if (locked.value) return { state: 'todo', summary: '' }
  if (!ready.value) return { state: 'warning', summary: t('customs.steps.documents-blocked', { count: errorCount.value }) }
  return { state: 'current', summary: t('customs.steps.documents-none') }
})

/** 发货：已发货 / 前面都好了就可以发 */
const shipStep = computed<{ state: StepState; summary: string }>(() => {
  if (locked.value) return { state: 'done', summary: t('customs.steps.shipped') }
  if (shippingStage.value && hasShipment.value && documentsStep.value.state === 'done') {
    return { state: 'current', summary: t('customs.steps.ready-to-ship') }
  }
  return { state: 'todo', summary: '' }
})

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

// ------------------ 报关数据补录后：问题、单证（可能被作废）、建单条件都要刷新 ----------------------
const onCustomsSaved = async () => {
  await reloadAll()
  if (historyOpen.value) await loadHistory()
  emit('changed')
}

// ------------------ 承运商运单：建单 / 取消 / 存运单号后运单号变了，单证随之更新 ----------------------
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
      <div class="card-title d-flex align-items-center gap-2">
        <span><i class="ri-earth-line me-1 align-middle"></i>{{ t('customs.shipping-title') }}</span>
        <span class="badge bg-secondary-transparent" v-if="view && locked">
          <i class="ri-lock-line me-1"></i>{{ t('customs.status.locked') }}
        </span>
      </div>
      <button type="button" class="btn btn-sm btn-icon btn-light" :disabled="loading" :title="t('customs.operations.refresh')"
        :aria-label="t('customs.operations.refresh')" @click="reloadAll">
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
        <div class="alert alert-warning-transparent" v-if="!view.customs">{{ t('customs.tips.no-snapshot') }}</div>

        <!-- ===== 1 箱子 ===== -->
        <ShippingStep :index="1" :title="t('customs.steps.packages')" :state="packagesStep.state" :summary="packagesStep.summary">
          <template #actions v-if="shippingStage && packageCount > 0">
            <button type="button" class="btn btn-sm btn-link px-0" @click="packagesOpen = !packagesExpanded">
              {{ packagesExpanded ? t('customs.operations.collapse') : (canEditPackages ? t('customs.operations.edit-packages') : t('customs.operations.show')) }}
            </button>
          </template>
          <div v-show="packagesExpanded">
            <DnPackagesEditor ref="packagesRef" :dn-id="dnId" :packages="packagesForEditor" :editable="canEditPackages"
              :readonly-reason="packagesReadonlyReason" @saved="onPackagesSaved" />
          </div>
        </ShippingStep>

        <!-- ===== 2 单证 ===== -->
        <ShippingStep :index="2" :title="t('customs.steps.documents')" :state="documentsStep.state" :summary="documentsStep.summary"
          :last="!forDelivery">
          <template #actions v-if="shippingStage">
            <button type="button" class="btn btn-sm" :class="outdated ? 'btn-warning' : (ci && pl ? 'btn-light' : 'btn-primary')"
              v-if="!locked" :disabled="!canIssue || issuing" :title="issueHint" @click="issue">
              <span v-if="issuing" class="spinner-border spinner-border-sm me-1"></span>
              {{ outdated ? t('customs.operations.reissue') : (ci && pl ? t('customs.operations.issue-again') : t('customs.operations.issue')) }}
            </button>
            <button type="button" class="btn btn-sm btn-primary-light" :disabled="!ci || busyDocId !== null" v-if="ci"
              @click="printDoc(dnId, ci)">
              <span v-if="busyDocId === ci.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-ci') }}
            </button>
            <button type="button" class="btn btn-sm btn-primary-light" :disabled="!pl || busyDocId !== null" v-if="pl"
              @click="printDoc(dnId, pl)">
              <span v-if="busyDocId === pl.id" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-printer-line me-1"></i>{{ t('customs.operations.print-pl') }}
            </button>
            <button type="button" class="btn btn-sm btn-link px-0 ms-1" @click="toggleHistory">
              {{ t('customs.operations.history') }}<i class="ms-1" :class="historyOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"></i>
            </button>
          </template>

          <div v-if="shippingStage && historyOpen">
            <div class="d-flex justify-content-center py-2" v-if="historyLoading">
              <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
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
                      {{ $dayjs(doc.issued_at, 'YYYY-MM-DD HH:mm') }}
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
        </ShippingStep>

        <!-- ===== 3 运单（配送页） ===== -->
        <ShippingStep :index="3" :title="t('customs.steps.shipment')" :state="shipmentStep.state" :summary="shipmentStep.summary"
          v-if="forDelivery">
          <template #tag v-if="shippingStage && carrierTag">
            <span class="badge bg-light text-default">{{ carrierTag }}</span>
          </template>
          <template v-if="shippingStage">
            <CarrierShipmentPanel ref="carrierRef" :dn-id="dnId" :locked="locked" :customs="view.customs"
              :packages-dirty="packagesDirty" :warehouse-id="warehouseId" :package-count="packageCount"
              :task-id="taskId" :tracking-editable="trackingEditable" :hidden-blocker-codes="listedProblemCodes"
              :can-edit-customs="canEditCustoms"
              @status="onCarrierStatus" @changed="onCarrierChanged" @edit-customs="editorOpen = true" />
            <DeclaredValueNotice class="mt-2" compact :customs="view.customs" :mode="declaredValueMode"
              :carrier-value="carrierDeclaredValue" v-if="view.customs && declaredValueMode === 'manual' && !locked" />
          </template>
        </ShippingStep>

        <!-- ===== 4 发货（配送页） ===== -->
        <ShippingStep :index="4" :title="t('customs.steps.ship')" :state="shipStep.state" :summary="shipStep.summary" last
          v-if="forDelivery">
          <template #actions v-if="$slots['ship-actions'] && !locked">
            <slot name="ship-actions" :ready="shipStep.state === 'current'" />
          </template>
        </ShippingStep>

        <!-- ===== 先处理 / 请留意：报关数据的问题 ===== -->
        <div class="shipping-problems mt-3" :class="errorCount > 0 ? 'is-error' : 'is-warning'" v-if="listedProblems.length > 0">
          <div class="fw-semibold mb-2">
            <i class="me-1" :class="errorCount > 0 ? 'ri-error-warning-line' : 'ri-information-line'"></i>
            {{ errorCount > 0 ? t('customs.steps.problems-title', { count: errorCount }) : t('customs.steps.warnings-title', { count: listedProblems.length }) }}
          </div>
          <CustomsProblemList :problems="listedProblems" :lines="view.lines" :warehouse-id="warehouseId"
            :can-edit-customs="canEditCustoms" @edit-customs="editorOpen = true" />

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
          </div>

          <div class="d-flex flex-wrap align-items-center gap-2 mt-2" v-if="hasSnapshotProblems">
            <button type="button" class="btn btn-sm btn-primary-light" v-if="canEditCustoms" @click="editorOpen = true">
              <i class="ri-edit-line me-1"></i>{{ t('customs.operations.edit-customs') }}
            </button>
            <span class="fs-12 text-muted" v-else>{{ t('customs.tips.data-need-dn-edit') }}</span>
          </div>
        </div>

        <CustomsSnapshotEditor v-model:open="editorOpen" :dn-id="dnId" :customs="view.customs" :lines="view.lines"
          :fallback-consignee="view.consignee" @saved="onCustomsSaved" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.shipping-problems {
  border-radius: 0.375rem;
  padding: 0.75rem 0.875rem;
}

.shipping-problems.is-error {
  background: rgba(var(--danger-rgb), 0.05);
  border: 1px solid rgba(var(--danger-rgb), 0.25);
}

.shipping-problems.is-warning {
  background: rgba(var(--warning-rgb), 0.06);
  border: 1px solid rgba(var(--warning-rgb), 0.25);
}
</style>
