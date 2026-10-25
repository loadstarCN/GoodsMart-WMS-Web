<script lang="ts" setup>
/**
 * 发货单详情的当前步骤卡（设计稿 Main「现在 · 第 8 步，共 9 步」；各步的内容参照 DeliveryCustoms / DeliveryPrint / Delivery /
 * CarrierSteps）：默认显示流程现在该做 / 要处理的那一步（activeStepKey），点进度条、处理记录、右栏的入口可以换成别的步。
 * - 头部：第几步、步骤名、一行概要、这一步的问题；右边是关键信息（运输中的预计送达、已完成的时刻与来源）
 * - 内容：用各步的组件做事——打包 DnPackagesEditor、报关单证 FlowDocumentsDetail、运单 FlowWaybillFileDetail +
 *   CarrierShipmentPanel + ShippingOptionsEditor、揽收 FlowPickupDetail、交承运商 FlowHandoverDetail、运输中 FlowTransitDetail、
 *   签收 FlowDeliveredDetail；拣货一步在待处理时给「开始作业」
 * - 底部：同时也能做的其它步（如待揽收时可以直接完成发货）、回到当前步骤
 * 看过的步的内容保留挂载、只隐藏（箱子没保存的修改不丢）。做了操作 emit changed（页面重读单据与流程）。
 * 数据来自页面提供的 useShippingFlowView（SHIPPING_FLOW_VIEW）。
 */
import { SHIPPING_FLOW_VIEW } from '~/composables/shipping/useShippingFlowView'
import { isActiveShipment } from '~/composables/customs/carrierShipment'
import { activeStepKey, type FlowStep } from '~/composables/shipping/shippingFlow'
import { otherActionableSteps, stepPosition } from '~/utils/dnFlowDisplay'
import { useDnActions } from '~/composables/dn/useDnActions'

const props = defineProps<{
  /** 要看的步（null = 流程现在该做的那步） */
  selected: string | null
  dnId: number | string
  dnStatus: string | null | undefined
  closedAt?: string | null
}>()
const emit = defineEmits<{
  select: [key: string | null]
  changed: []
  'edit-customs': []
}>()

const { t } = useI18n()
const staffStore = useStaffStore()
const view = inject(SHIPPING_FLOW_VIEW)!
const { format, formatLocale } = useTimeZone()
const { busy: actionBusy, start } = useDnActions()

const steps = computed<FlowStep[]>(() => view.flow.value?.steps || [])
const activeKey = computed(() => activeStepKey(steps.value))
const shownKey = computed(() => props.selected || activeKey.value)
const step = computed(() => steps.value.find((s) => s.key === shownKey.value) || null)
const isActive = computed(() => !!step.value && step.value.key === activeKey.value && (step.value.state === 'current' || step.value.state === 'warning'))
const closed = computed(() => props.dnStatus === 'closed')
const position = computed(() => stepPosition(steps.value, shownKey.value))
const others = computed(() => otherActionableSteps(steps.value, shownKey.value))

// ------------------ 头部 ----------------------
const eyebrow = computed(() => {
  if (!step.value || !position.value) return ''
  const pos = t('dn.detail.step-of', { index: position.value.index, total: position.value.total })
  if (isActive.value) return t('dn.detail.now', { position: pos })
  return `${pos} · ${t(`shipping.states.${step.value.state}`)}`
})
/** 卡片标题：大多是步骤名；运单已建好时是运单号 */
const title = computed(() => (step.value ? view.stepTitle(step.value.key) : ''))
const summary = computed(() => (step.value ? view.summaryText(step.value) : ''))
const stepProblems = computed(() => (step.value ? view.problemsOf(step.value.key) : []))
const sourceText = computed(() => {
  const s = step.value?.source
  if (!s) return ''
  const key = s === 'api' && (step.value?.key === 'waybill' || step.value?.key === 'pickup') ? 'shipping.sources.carrier-api' : `shipping.sources.${s}`
  return t(key)
})
/** 右边的关键信息：运输中 / 签收没到时的预计送达；完成的步的时刻 */
const eta = computed(() => {
  if (!step.value || !['transit', 'delivered'].includes(step.value.key) || step.value.state === 'done') return ''
  const transit = steps.value.find((s) => s.key === 'transit')
  return String(step.value.summary?.estimated_delivery || transit?.summary?.tracking?.estimated_delivery || '')
})
const etaText = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(eta.value)
  if (!m) return eta.value
  return format(eta.value.slice(0, 10), 'MM/DD', { withZone: false })
})
const syncedAt = computed(() => {
  const transit = steps.value.find((s) => s.key === 'transit')
  return transit?.summary?.tracking?.synced_at || null
})

// ------------------ 内容（看过的步保留挂载） ----------------------
const mounted = ref<string[]>([])
watch(shownKey, (key) => {
  if (key && !mounted.value.includes(key)) mounted.value = [...mounted.value, key]
}, { immediate: true })

const carrierRef = ref<{ reload: () => Promise<void>; cancel: () => Promise<void> } | null>(null)
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

watch(view.version, async () => {
  await carrierRef.value?.reload()
  // 有没保存的修改时不覆盖
  if (packagesRef.value && !packagesRef.value.dirty) await packagesRef.value.reload()
})

const stepByKey = (key: string) => steps.value.find((s) => s.key === key) || null
const waybillStep = computed(() => stepByKey('waybill'))
const handoverAt = computed(() => stepByKey('handover')?.at ?? null)
const activeWaybill = computed(() => (isActiveShipment(view.waybillShipment.value) ? view.waybillShipment.value : null))

/** 拣货一步：待处理的发货单可以在这里开始作业 */
const canStart = computed(() => props.dnStatus === 'pending' && staffStore.hasPermission('dn_edit'))
const startWork = async () => {
  if (await start(props.dnId)) emit('changed')
}
/** 运输中：签收能做时给「确认签收」（切到签收一步） */
const signable = computed(() => !!stepByKey('delivered')?.actions.some((a) => a.key === 'sign' && a.enabled))

/** 页面（右栏、处理记录）要在某一步上做事：切到那一步，挂载后再执行（取消运单、导出文件……） */
const openStep = async (key: string, action?: string) => {
  emit('select', key === activeKey.value ? null : key)
  await nextTick()
  await nextTick()
  if (!action) return
  if (action === 'cancel_waybill') await carrierRef.value?.cancel()
  else runners[key]?.run(action)
}

const onChanged = () => emit('changed')

defineExpose({ openStep, packagesDirty })
</script>

<template>
  <section class="w-dnstep" :class="{ 'is-current': isActive }" :aria-labelledby="'dn-step-title'">
    <!-- 已关闭 / 已取消：没有要做的步 -->
    <template v-if="closed">
      <header class="w-dnstep__head">
        <div class="w-dnstep__main">
          <h2 id="dn-step-title" class="w-dnstep__title">{{ t('dn.detail.closed-title') }}</h2>
          <p v-if="closedAt" class="w-dnstep__summary">{{ t('dn.detail.closed-at', { time: formatLocale(closedAt) }) }}</p>
        </div>
      </header>
    </template>

    <template v-else-if="step">
      <header class="w-dnstep__head">
        <div class="w-dnstep__main">
          <span class="w-dnstep__eyebrow" :class="{ 'is-now': isActive }">{{ eyebrow }}</span>
          <h2 id="dn-step-title" class="w-dnstep__title">{{ title }}</h2>
          <p v-if="summary" class="w-dnstep__summary">{{ summary }}</p>
          <ul v-if="stepProblems.length" class="w-dnstep__problems">
            <li v-for="(p, i) in stepProblems" :key="`${p.code}-${i}`">
              <WStatus tone="warn" variant="text">{{ view.problemText(p) }}</WStatus>
            </li>
          </ul>
        </div>
        <div class="w-dnstep__aside">
          <template v-if="eta">
            <span class="w-dnstep__fact-label">{{ t('dn.detail.eta', { carrier: view.carrier.value?.name || '' }) }}</span>
            <span class="w-dnstep__fact">{{ etaText }}</span>
            <span v-if="syncedAt" class="w-dnstep__fact-sub">{{ t('dn.detail.synced', { time: format(syncedAt, 'MM/DD HH:mm', { withZone: false }) }) }}</span>
          </template>
          <template v-else-if="step.at">
            <span class="w-dnstep__fact-label">{{ sourceText }}</span>
            <span class="w-dnstep__fact is-small">{{ formatLocale(step.at) }}</span>
          </template>
          <span v-if="view.taskLinks(step.key).length" class="w-dnstep__tasks">
            <NuxtLink v-for="link in view.taskLinks(step.key)" :key="link.to" :to="link.to" class="w-dnstep__link">{{ link.text }}</NuxtLink>
          </span>
        </div>
      </header>

      <div class="w-dnstep__body">
        <!-- 下单 -->
        <div v-show="shownKey === 'ordered'" v-if="mounted.includes('ordered')" class="w-dnstep__plain">
          {{ t('dn.detail.ordered-hint') }}
        </div>

        <!-- 拣货：待处理时开始作业；进行中给拣货任务 -->
        <div v-show="shownKey === 'picking'" v-if="mounted.includes('picking')" class="w-dnstep__plain">
          <template v-if="dnStatus === 'pending'">
            <span>{{ t('dn.detail.not-started') }}</span>
            <WButton v-if="canStart" variant="primary" :loading="!!actionBusy" @click="startWork">{{ t('dn.actions.start') }}</WButton>
          </template>
          <span v-else-if="step.state !== 'done'">{{ t('dn.detail.picking-hint') }}</span>
        </div>

        <!-- 打包：录箱子 -->
        <div v-show="shownKey === 'packing'" v-if="mounted.includes('packing')" class="w-dnstep__stack">
          <DnPackagesEditor :ref="setPackagesRef" :dn-id="dnId" :editable="view.canEditPackages.value"
            :readonly-reason="view.packagesReadonlyReason.value" @saved="onChanged" />
          <p v-if="!view.flow.value?.route.requires_customs && view.canEditPackages.value" class="w-dnstep__hint">{{ t('customs.packages.domestic-tip') }}</p>
        </div>

        <!-- 报关单证 -->
        <FlowDocumentsDetail v-show="shownKey === 'documents'" v-if="mounted.includes('documents') && stepByKey('documents')"
          :ref="(el: any) => setRunner('documents', el)" :dn-id="dnId" :step="stepByKey('documents')!" :view="view.customsView.value"
          :loading="view.customsLoading.value" :load-error="view.customsError.value" :dn-status="view.dnStatus.value"
          :warehouse-id="view.warehouse.value" :packages-dirty="packagesDirty" :declared-mode="view.declaredMode.value"
          @changed="onChanged" @edit-customs="emit('edit-customs')" />

        <!-- 运单 -->
        <div v-show="shownKey === 'waybill'" v-if="mounted.includes('waybill') && waybillStep" class="w-dnstep__stack">
          <FlowWaybillFileDetail v-if="view.waybillFileMode.value" :ref="(el: any) => setRunner('waybill', el)" :dn-id="dnId"
            :step="waybillStep" :carrier="view.carrier.value" :warehouse-id="view.warehouse.value" :locked="view.locked.value"
            @changed="onChanged" />
          <CarrierShipmentPanel :ref="setCarrierRef" :dn-id="dnId" :locked="view.locked.value" :customs="view.customsView.value?.customs ?? null"
            :packages-dirty="packagesDirty" :warehouse-id="view.warehouse.value" :package-count="view.packageCount.value"
            :task-id="view.tasks.value.delivery" :tracking-editable="view.canEnterTracking.value"
            :hidden-blocker-codes="view.documentsProblemCodes.value" :can-edit-customs="view.canEditCustoms.value"
            :show-pickup="false" :show-tracking="false" :tracking-refresh="false" :manual-only="view.waybillManualOnly.value"
            :file-mode="view.waybillFileMode.value" @changed="onChanged" @edit-customs="emit('edit-customs')" />
          <!-- 运单服务选项（配送日、时间带……）：建运单 / 导出后锁定 -->
          <ShippingOptionsEditor v-if="view.waybillOptions.value && view.waybillOptions.value.schema.length" :dn-id="dnId"
            :options="view.waybillOptions.value" :locked="view.locked.value" @saved="onChanged" />
          <ShippingFlowActionNotes v-if="!view.locked.value" :actions="waybillStep.actions" :carrier-name="view.carrier.value?.name"
            :tracking-number="waybillStep.summary?.tracking_number" />
        </div>

        <!-- 揽收 -->
        <FlowPickupDetail v-show="shownKey === 'pickup'" v-if="mounted.includes('pickup') && stepByKey('pickup')"
          :ref="(el: any) => setRunner('pickup', el)" :dn-id="dnId" :step="stepByKey('pickup')!" :carrier="view.carrier.value"
          :shipment="activeWaybill" :warehouse-id="view.warehouse.value" :locked="view.locked.value" @changed="onChanged" />

        <!-- 交承运商 -->
        <FlowHandoverDetail v-show="shownKey === 'handover'" v-if="mounted.includes('handover') && stepByKey('handover')"
          :ref="(el: any) => setRunner('handover', el)" :step="stepByKey('handover')!" :task-id="view.tasks.value.delivery"
          :carrier="view.carrier.value" :locked="view.locked.value" @changed="onChanged" />

        <!-- 运输中 -->
        <FlowTransitDetail v-show="shownKey === 'transit'" v-if="mounted.includes('transit') && stepByKey('transit')"
          :ref="(el: any) => setRunner('transit', el)" :dn-id="dnId" :step="stepByKey('transit')!" :carrier-name="view.carrier.value?.name"
          :tracking-url="view.carrier.value?.tracking_url" @changed="onChanged">
          <template v-if="signable" #actions>
            <WButton @click="openStep('delivered')">{{ t('shipping.actions.sign') }}</WButton>
            <WHelp :text="t('shipping.delivered.manual-hint')" />
          </template>
        </FlowTransitDetail>

        <!-- 签收 -->
        <FlowDeliveredDetail v-show="shownKey === 'delivered'" v-if="mounted.includes('delivered') && stepByKey('delivered')"
          :ref="(el: any) => setRunner('delivered', el)" :step="stepByKey('delivered')!" :task-id="view.tasks.value.delivery"
          :carrier="view.carrier.value" :dn-status="view.dnStatus.value" :handover-at="handoverAt" @changed="onChanged" />
      </div>

      <footer v-if="others.length || !isActive" class="w-dnstep__foot">
        <template v-if="others.length">
          <span class="w-faint">{{ t('dn.detail.also') }}</span>
          <button v-for="other in others" :key="other.key" type="button" class="w-dnstep__link" @click="emit('select', other.key)">
            {{ view.stepTitle(other.key) }} →
          </button>
        </template>
        <span class="w-dnstep__spacer" />
        <button v-if="selected && selected !== activeKey && activeKey" type="button" class="w-dnstep__link" @click="emit('select', null)">
          {{ t('dn.detail.back-to-current') }}
        </button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.w-dnstep {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  font-family: var(--w-font);
  color: var(--w-text-1);
}
/* 当前步骤卡：一圈紫 200 描边，不铺底色 */
.w-dnstep.is-current { border-color: var(--w-sel-line); box-shadow: 0 0 0 1px var(--w-sel-line); }
.w-dnstep__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 24px;
  padding: 20px var(--w-card-pad) 16px;
  border-bottom: 1px solid var(--w-line);
}
.w-dnstep__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 320px; }
.w-dnstep__eyebrow { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dnstep__eyebrow.is-now { color: var(--w-sel-text); font-weight: var(--w-fw-semibold); }
.w-dnstep__title {
  margin: 0;
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
}
.w-dnstep__summary { margin: 0; font-size: var(--w-fs-13); line-height: var(--w-lh-13); color: var(--w-text-2); overflow-wrap: anywhere; }
.w-dnstep__problems { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; font-size: var(--w-fs-13); }
.w-dnstep__aside { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.w-dnstep__fact-label { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dnstep__fact { font-size: var(--w-fs-20); line-height: var(--w-lh-20); font-weight: var(--w-fw-semibold); }
.w-dnstep__fact.is-small { font-size: var(--w-fs-14); line-height: var(--w-lh-14); font-weight: var(--w-fw-medium); }
.w-dnstep__fact-sub { font-size: var(--w-fs-12); line-height: var(--w-lh-12); color: var(--w-text-3); }
.w-dnstep__tasks { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 10px; margin-top: 4px; font-size: var(--w-fs-13); }
.w-dnstep__body { padding: 16px var(--w-card-pad) 20px; }
.w-dnstep__plain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-2);
}
.w-dnstep__stack { display: flex; flex-direction: column; gap: 16px; }
.w-dnstep__hint { margin: 0; font-size: var(--w-fs-12); color: var(--w-text-3); }
.w-dnstep__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 10px var(--w-card-pad);
  border-top: 1px solid var(--w-line);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-dnstep__spacer { flex: 1; }
.w-dnstep__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-medium);
  text-decoration: none;
  cursor: pointer;
}
.w-dnstep__link:hover { color: var(--w-link-hover); }
</style>
