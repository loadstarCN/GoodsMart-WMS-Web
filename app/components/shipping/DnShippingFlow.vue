<script lang="ts" setup>
/**
 * 发货单的发货流程（打包 / 配送任务页用 compact；发货单详情页已改用新的工作台布局，见 pages/dn/detail/[id].vue）。
 *
 * 读 GET /dn/<id>/shipping-flow：上面是横向进度条（下单 / 拣货 / 打包 / 发货准备 / 交承运商 / 运输中 / 签收），
 * 下面是逐步清单。每一步显示状态、实际发生时刻（按界面语言、DN 所属仓库的时区）、来源、一行概要和操作；
 * 点开看这一步的详细内容，用已有的组件做事（打包 DnPackagesEditor、报关单证 FlowDocumentsDetail、运单 CarrierShipmentPanel
 * + FlowWaybillFileDetail + ShippingOptionsEditor、揽收 FlowPickupDetail、交承运商 FlowHandoverDetail、运输中 FlowTransitDetail、
 * 签收 FlowDeliveredDetail）。数据、概要文案、各步的派生值在 composables/shipping/useShippingFlowView（与详情页共用）。
 *
 * mode：full = 要处理 / 现在该做的步骤展开；compact = 只展开当前这一步，不列不适用的步骤，给发货单详情的入口。
 * 每次操作后整体重读（流程、报关视图、运单、箱子），并 emit changed 让页面刷新自己的数据。
 * 详细内容第一次展开时才挂载，之后收起只隐藏（箱子没保存的修改不会丢）。
 */
import { useCustomsPdfActions } from '~/composables/customs/customsDocuments'
import { isActiveShipment, isPdfLabel, labelDocumentOf } from '~/composables/customs/carrierShipment'
import { useShippingFlowView } from '~/composables/shipping/useShippingFlowView'
import {
  HIDDEN_ACTIONS,
  activeStepKey,
  flowActionOf,
  type FlowAction,
  type FlowProblem,
  type FlowStep,
  type FlowStepKey,
  type ShippingFlow,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  mode?: 'full' | 'compact'
  /** DN 所属仓库（揽收按仓库约）；接口给了 warehouse_id 时以接口为准 */
  warehouseId?: number | string | null
  /** 配送任务页：完成发货时一起提交的页面字段（运费、承运商、运输方式、备注）；返回 null 表示页面校验没过 */
  completeExtras?: (() => Record<string, any> | null | Promise<Record<string, any> | null>) | null
}>(), {
  mode: 'full',
  warehouseId: null,
  completeExtras: null,
})

const emit = defineEmits<{
  /** 做了操作（流程已重读）：页面刷新自己的数据 */
  (e: 'changed'): void
  /** 读到流程 */
  (e: 'loaded', flow: ShippingFlow): void
}>()

const route = useRoute()
const { busyDocId, viewDoc, downloadRawDoc } = useCustomsPdfActions()

const view = useShippingFlowView({
  dnId: () => props.dnId,
  warehouseId: () => props.warehouseId,
  onLoaded: (next) => emit('loaded', next),
})
const {
  flow, loading, loadError, version, locked, dnStatus, warehouse, carrier, tasks, flowTimeZone, stepOf,
  customsView, customsLoading, customsError, documentsProblemCodes, canEditCustoms,
  waybillStep, waybillShipment, canEditPackages, packagesReadonlyReason, canEnterTracking, waybillManualOnly,
  waybillFileMode, waybillOptions, packageCount, declaredMode,
  stepTitle, actionText, problemText, generalProblems, summaryText,
} = view
const { t } = useI18n()
const editorOpen = ref(false)
const compactKey = ref<string|null>(null)
const selectCompact = (step:FlowStep) => {compactKey.value=step.key;if(expandable(step))expand(step.key)}

// ------------------ 读取 ----------------------
const load = async () => {
  await view.load()
  syncExpanded()
}

/** 做了操作：整体重读，通知页面 */
const refresh = async () => {
  await load()
  version.value++
  emit('changed')
}

onMounted(load)
watch(() => props.dnId, () => {
  view.reset()
  expanded.value = []
  mounted.value = []
  autoKey = null
  compactKey.value = null
  userOpened.clear()
  load()
})

// ------------------ 展开 / 收起 ----------------------
/** 展开着的步骤 */
const expanded = ref<string[]>([])
/** 挂载过详细内容的步骤（收起只隐藏） */
const mounted = ref<string[]>([])
/** 用户自己点开的步骤：当前步骤变了也不收起 */
const userOpened = new Set<string>()
/** 上次自动展开的步骤 */
let autoKey: string | null = null

const DETAIL_KEYS: FlowStepKey[] = ['packing', 'documents', 'waybill', 'pickup', 'handover', 'transit', 'delivered']
const expandable = (step: FlowStep): boolean => {
  if (!DETAIL_KEYS.includes(step.key) || step.state === 'skipped') return false
  // 已交承运商 / 已签收：没有要做的事
  if ((step.key === 'handover' || step.key === 'delivered') && step.state === 'done') return false
  return true
}
const isExpanded = (key: string) => expanded.value.includes(key)
const expand = (key: string) => {
  if (!expanded.value.includes(key)) expanded.value = [...expanded.value, key]
  if (!mounted.value.includes(key)) mounted.value = [...mounted.value, key]
}
const collapse = (key: string) => {
  expanded.value = expanded.value.filter((k: string) => k !== key)
}
const toggle = (step: FlowStep) => {
  if (isExpanded(step.key)) {
    collapse(step.key)
    userOpened.delete(step.key)
  } else {
    expand(step.key)
    userOpened.add(step.key)
  }
}

/**
 * 当前步骤变了（如打包完成后轮到单证 / 运单）：展开新的当前步骤，收起上次自动展开、用户没点过的。
 * full 第一次读到时，要人处理的步骤也一起展开
 */
const syncExpanded = () => {
  const steps = flow.value?.steps || []
  const active = activeStepKey(steps)
  const activeStep = active ? steps.find((s: FlowStep) => s.key === active) : null
  const firstTime = autoKey === null && expanded.value.length === 0
  if (active !== autoKey) {
    compactKey.value = active || steps.at(-1)?.key || null
    if (autoKey && !userOpened.has(autoKey)) collapse(autoKey)
    if (activeStep && expandable(activeStep)) expand(activeStep.key)
    autoKey = active
  }
  if (firstTime && props.mode === 'full') {
    steps.filter((s: FlowStep) => s.state === 'warning' && expandable(s)).forEach((s: FlowStep) => expand(s.key))
  }
  if (!compactKey.value) compactKey.value = active || steps.at(-1)?.key || null
  // 不能再展开的（如已完成的交承运商）收起
  expanded.value = expanded.value.filter((key: string) => {
    const step = steps.find((s: FlowStep) => s.key === key)
    return !!step && expandable(step)
  })
}

/** 显示的步骤：compact 不列不适用的 */
const visibleSteps = computed(() =>
  (flow.value?.steps || []).filter((s: FlowStep) => props.mode === 'full' || s.state !== 'skipped'))

/** 这一步标题行下面列出的问题：单证、运单展开时由详细内容自己列（带补的入口） */
const stepProblems = (step: FlowStep): FlowProblem[] => {
  if ((step.key === 'documents' || step.key === 'waybill') && isExpanded(step.key)) return []
  return view.problemsOf(step.key)
}

// ------------------ 详细内容的组件（运单、箱子自己持有数据；揽收 / 运输 / 交接 / 签收给标题行的操作按钮调用） ----------------------
const carrierRef = ref<{ reload: () => Promise<void> } | null>(null)
const packagesRef = ref<{ reload: () => Promise<void>; dirty: boolean } | null>(null)
const runners: Record<string, { run: (key: string) => void } | null> = {}
const setRunner = (key: string, el: any) => {
  runners[key] = el && typeof el.run === 'function' ? el : null
}
const setCarrierRef = (el: any) => {
  carrierRef.value = el && typeof el.reload === 'function' ? el : null
}
const setPackagesRef = (el: any) => {
  packagesRef.value = el && typeof el.reload === 'function' ? el : null
}
const packagesDirty = computed(() => !!packagesRef.value?.dirty)

watch(version, async () => {
  await carrierRef.value?.reload()
  // 有没保存的修改时不覆盖
  if (packagesRef.value && !packagesRef.value.dirty) await packagesRef.value.reload()
})

// ------------------ 标题行的操作按钮（收起时显示；展开后由详细内容提供） ----------------------
/** 只是展开到详细内容去做的操作 */
const EXPAND_ACTIONS = ['create_waybill', 'enter_tracking', 'cancel_waybill', 'dismiss_waybill', 'issue_documents',
  'edit_packages', 'complete_shipping', 'sign']
/** 展开后直接执行的操作（详细内容的 run） */
const RUN_ACTIONS = ['book_pickup', 'record_pickup', 'cancel_pickup', 'refresh_tracking', 'export_file', 'import_numbers']
const headerActions = (step: FlowStep): FlowAction[] => {
  if (isExpanded(step.key)) return []
  return step.actions.filter((a: FlowAction) => a.enabled && !HIDDEN_ACTIONS.includes(a.key)
    && (EXPAND_ACTIONS.includes(a.key) || RUN_ACTIONS.includes(a.key) || a.key === 'print_label' || a.key === 'open_tracking'))
    // 取消类的放到详细内容里（要看清楚再取消）
    .filter((a: FlowAction) => !['cancel_waybill', 'dismiss_waybill', 'cancel_pickup', 'discard_export'].includes(a.key))
}
const PRIMARY_ACTIONS = ['create_waybill', 'enter_tracking', 'book_pickup', 'record_pickup', 'complete_shipping', 'sign',
  'issue_documents', 'edit_packages', 'export_file', 'import_numbers']
const ACTION_ICONS: Record<string, string> = {
  create_waybill: 'ri-file-add-line',
  enter_tracking: 'ri-edit-line',
  print_label: 'ri-printer-line',
  book_pickup: 'ri-truck-line',
  record_pickup: 'ri-edit-box-line',
  complete_shipping: 'ri-check-double-line',
  refresh_tracking: 'ri-refresh-line',
  open_tracking: 'ri-external-link-line',
  sign: 'ri-checkbox-circle-line',
  issue_documents: 'ri-file-text-line',
  edit_packages: 'ri-inbox-archive-line',
  export_file: 'ri-file-download-line',
  import_numbers: 'ri-file-upload-line',
}

const trackingUrlOf = (step: FlowStep): string => String(step.summary?.tracking_url || carrier.value?.tracking_url || '').trim()

const printLabel = () => {
  const shipment = waybillShipment.value
  const raw = Number(waybillStep.value?.summary?.label_document_id)
  const id = Number.isFinite(raw) && raw > 0 ? raw : null
  const doc = labelDocumentOf(shipment) || (id ? { id, sha256: null, file_name: null } : null)
  if (!doc) return
  if (!shipment || isPdfLabel(shipment)) viewDoc(props.dnId, doc)
  else downloadRawDoc(props.dnId, doc)
}

const onHeaderAction = async (step: FlowStep, key: string) => {
  if (key === 'print_label') return printLabel()
  if (key === 'open_tracking') {
    const url = String(flowActionOf(step, 'open_tracking')?.url || '').trim() || trackingUrlOf(step)
    if (url) window.open(url, '_blank', 'noopener')
    return
  }
  expand(step.key)
  userOpened.add(step.key)
  await nextTick()
  if (RUN_ACTIONS.includes(key)) runners[step.key]?.run(key)
  else document.getElementById(`shipping-step-${step.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

// ------------------ 任务入口 ----------------------
const taskLinks = (step: FlowStep) => view.taskLinks(step.key)
const dnLink = computed(() => `/dn/detail/${props.dnId}`)
const onDnPage = computed(() => route.path.replace(/\/$/, '') === dnLink.value)

/** 页面自己做了操作（如完成打包、取消 DN）后重读流程：不再 emit changed（页面已经在刷新自己的数据） */
const reload = async () => {
  await load()
  version.value++
}

defineExpose({ reload })
</script>

<template>
  <div class="card custom-card shipping-flow" :class="`is-${mode}`" id="shipping-flow">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="card-title d-flex flex-wrap align-items-center gap-2">
        <span><i class="ri-route-line me-1 align-middle"></i>{{ t('shipping.title') }}</span>
        <ShippingStageBadge :stage="flow?.stage" />
        <span class="badge bg-light text-default fw-normal" v-if="flow?.carrier">
          <i class="ri-truck-line me-1"></i>{{ flow.carrier.name }}
        </span>
        <TimeZoneBadge v-if="flow" :zone="flowTimeZone" />
      </div>
      <div class="d-flex align-items-center gap-2">
        <NuxtLink :to="dnLink" class="fs-12" v-if="mode === 'compact' && !onDnPage">
          {{ t('shipping.view-on-dn') }}<i class="ri-arrow-right-s-line align-middle"></i>
        </NuxtLink>
        <button type="button" class="btn btn-sm btn-icon btn-light" :disabled="loading" :title="t('shipping.refresh')"
          :aria-label="t('shipping.refresh')" @click="refresh">
          <span class="spinner-border spinner-border-sm" v-if="loading && flow"></span>
          <i class="ri-refresh-line" v-else></i>
        </button>
      </div>
    </div>

    <div class="card-body">
      <div class="d-flex justify-content-center py-4" v-if="loading && !flow">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
      </div>
      <div class="alert alert-danger-transparent mb-0" v-else-if="loadError && !flow">{{ loadError }}</div>

      <template v-else-if="flow">
        <ShippingFlowStepper v-if="mode==='full'" :steps="flow.steps" class="mb-3" />
        <nav v-else class="w-flow-tabs" :aria-label="t('shipping.title')"><button v-for="step in visibleSteps" :key="step.key" type="button" :class="{selected:compactKey===step.key,done:step.state==='done'}" :aria-pressed="compactKey===step.key" @click="selectCompact(step)"><i/><span>{{stepTitle(step.key)}}</span></button></nav>

        <ul class="list-unstyled fs-13 mb-3" v-if="generalProblems.length">
          <li v-for="(p, i) in generalProblems" :key="`gp-${i}`" :class="p.level === 'error' ? 'text-danger' : 'text-warning'">
            <i class="me-1" :class="p.level === 'error' ? 'ri-close-circle-line' : 'ri-error-warning-line'"></i>{{ problemText(p) }}
          </li>
        </ul>

        <ShippingFlowStep v-for="(step, index) in visibleSteps" v-show="mode==='full'||compactKey===step.key" :key="step.key" :step="step" :index="index + 1"
          :title="stepTitle(step.key)" :summary="summaryText(step)" :expandable="expandable(step)"
          :expanded="isExpanded(step.key)" :problems="stepProblems(step)" :problem-text="problemText"
          :last="index === visibleSteps.length - 1" @toggle="toggle(step)">
          <template #meta v-if="taskLinks(step).length">
            <NuxtLink v-for="link in taskLinks(step)" :key="link.to" :to="link.to">{{ link.text }}</NuxtLink>
          </template>
          <template #actions v-if="headerActions(step).length">
            <button type="button" class="btn btn-sm" v-for="a in headerActions(step)" :key="a.key"
              :class="PRIMARY_ACTIONS.includes(a.key) ? 'btn-primary-light' : 'btn-light'"
              :disabled="a.key === 'print_label' && busyDocId !== null" @click="onHeaderAction(step, a.key)">
              <i class="me-1" :class="ACTION_ICONS[a.key] || 'ri-arrow-right-line'"></i>{{ actionText(a.key) }}
            </button>
          </template>

          <template #default v-if="mounted.includes(step.key)">
            <!-- 打包：录箱子 -->
            <template v-if="step.key === 'packing'">
              <DnPackagesEditor :ref="setPackagesRef" :dn-id="dnId" :editable="canEditPackages"
                :readonly-reason="packagesReadonlyReason" @saved="refresh" />
              <p class="fs-12 text-muted mb-0 mt-1" v-if="!flow.route.requires_customs && canEditPackages">
                {{ t('customs.packages.domestic-tip') }}
              </p>
            </template>

            <!-- 报关单证 -->
            <FlowDocumentsDetail v-else-if="step.key === 'documents'" :dn-id="dnId" :step="step" :view="customsView"
              :loading="customsLoading" :load-error="customsError" :dn-status="dnStatus" :warehouse-id="warehouse"
              :packages-dirty="packagesDirty" :declared-mode="declaredMode"
              @changed="refresh" @edit-customs="editorOpen = true" />

            <!-- 运单 -->
            <template v-else-if="step.key === 'waybill'">
              <!-- 文件方式：导出文件 / 导回运单号 / 作废导出 -->
              <FlowWaybillFileDetail v-if="waybillFileMode" class="mb-2" :ref="(el: any) => setRunner('waybill', el)"
                :dn-id="dnId" :step="step" :carrier="carrier" :warehouse-id="warehouse" :locked="locked" @changed="refresh" />
              <CarrierShipmentPanel :ref="setCarrierRef" :dn-id="dnId" :locked="locked" :customs="customsView?.customs ?? null"
                :packages-dirty="packagesDirty" :warehouse-id="warehouse" :package-count="packageCount"
                :task-id="tasks.delivery" :tracking-editable="canEnterTracking" :hidden-blocker-codes="documentsProblemCodes"
                :can-edit-customs="canEditCustoms" :show-pickup="false" :show-tracking="false" :tracking-refresh="false"
                :manual-only="waybillManualOnly" :file-mode="waybillFileMode" @changed="refresh" @edit-customs="editorOpen = true" />
              <!-- 运单服务选项（配送日、时间带……）：建运单 / 导出后锁定 -->
              <ShippingOptionsEditor v-if="waybillOptions && waybillOptions.schema.length" :dn-id="dnId" :options="waybillOptions"
                :locked="locked" @saved="refresh" />
              <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier?.name"
                :tracking-number="step.summary?.tracking_number" v-if="!locked" />
            </template>

            <!-- 揽收 -->
            <FlowPickupDetail v-else-if="step.key === 'pickup'" :ref="(el: any) => setRunner('pickup', el)" :dn-id="dnId"
              :step="step" :carrier="carrier" :shipment="isActiveShipment(waybillShipment) ? waybillShipment : null"
              :warehouse-id="warehouse" :locked="locked" @changed="refresh" />

            <!-- 交承运商 -->
            <FlowHandoverDetail v-else-if="step.key === 'handover'" :ref="(el: any) => setRunner('handover', el)"
              :step="step" :task-id="tasks.delivery" :carrier="carrier" :locked="locked" :complete-extras="completeExtras"
              @changed="refresh" />

            <!-- 运输中 -->
            <FlowTransitDetail v-else-if="step.key === 'transit'" :ref="(el: any) => setRunner('transit', el)" :dn-id="dnId"
              :step="step" :carrier-name="carrier?.name" :tracking-url="carrier?.tracking_url" @changed="refresh" />

            <!-- 签收 -->
            <FlowDeliveredDetail v-else-if="step.key === 'delivered'" :ref="(el: any) => setRunner('delivered', el)"
              :step="step" :task-id="tasks.delivery" :carrier="carrier" :dn-status="dnStatus"
              :handover-at="stepOf('handover')?.at ?? null" @changed="refresh" />
          </template>
        </ShippingFlowStep>

        <CustomsSnapshotEditor v-if="customsView" v-model:open="editorOpen" :dn-id="dnId" :customs="customsView.customs"
          :lines="customsView.lines" :recipient-tax-defaults="customsView.recipient_tax_defaults" :fallback-consignee="customsView.consignee" @saved="refresh" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.shipping-flow.is-compact{border:1px solid var(--w-border);border-radius:10px;box-shadow:none;margin:0;font-family:var(--w-font);overflow:hidden}.shipping-flow.is-compact>.card-header{padding:16px 24px;border-bottom:1px solid var(--w-line);background:white}.shipping-flow.is-compact .card-title{font-size:16px;line-height:24px;font-weight:600;margin:0}.shipping-flow.is-compact .card-body{padding:0 24px 24px}.w-flow-tabs{display:flex;overflow-x:auto;gap:20px;min-width:0;border-bottom:1px solid var(--w-border);margin:0 -24px 20px;padding:0 24px}.w-flow-tabs button{flex:none;display:flex;gap:6px;align-items:center;height:48px;padding:0;border:0;border-bottom:2px solid transparent;background:none;font:inherit;font-size:13px;color:var(--w-text-2)}.w-flow-tabs button.selected{color:var(--w-link);font-weight:600;border-bottom-color:var(--w-link)}.w-flow-tabs i{width:6px;height:6px;border-radius:50%;background:#A1A6B3}.w-flow-tabs .done i{background:#2E9E52}.w-flow-tabs .selected i{background:#7855FE}.is-compact :deep(.flow-step-rail){display:none}.is-compact :deep(.flow-step-main){padding-bottom:0}.is-compact :deep(.flow-step-title){font-size:14px;line-height:22px}.is-compact :deep(.flow-step-summary){font-size:13px;line-height:20px}.is-compact :deep(.flow-step-body){margin-top:16px;padding-top:16px;border-top:1px solid var(--w-line)}@media(max-width:600px){.shipping-flow.is-compact>.card-header{padding:16px}.shipping-flow.is-compact .card-body{padding:0 16px 16px}.w-flow-tabs{padding:0 16px;margin:0 -16px 16px}}
</style>
