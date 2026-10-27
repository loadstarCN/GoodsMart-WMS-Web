<script lang="ts" setup>
/**
 * 入库单的入库流程（入库单详情的主区域，轻量版的发货流程）。
 *
 * 读 GET /asn/<id>/flow：上面是横向进度条（创建 / 在途 / 收货 / 分拣 / 上架 / 完成），下面是逐步清单。每一步显示状态、
 * 实际发生时刻、来源（仓库 / 承运商 / 来源系统 / 系统）、一行概要和操作，组件与发货流程共用（ShippingFlowStepper /
 * ShippingFlowStep / FlowTransitDetail）：
 * - 在途：FlowTransitDetail（跟踪状态、扫描记录；refresh_tracking → POST /asn/<id>/track，open_tracking → 承运商查询页）。
 *   跟踪只用来显示，承运商说已送达也不会自动收货
 * - 收货：receive → PUT /asn/<id>/receive/（要 asn_receive 或 asn_edit；刷新跟踪同样）
 * - 分拣：分拣任务的入口（summary.task_ids → /sorting/detail/<id>）
 * - 上架：逐商品的待上架（按待上架库存估算，上架记录不带入库单），商品详情里可以上架
 * 状态不在界面推算，按后端给的。做了操作整体重读，并 emit changed 让页面刷新自己的数据。
 * 时刻按 ASN 所属仓库的时区显示（接口顶层的 timezone → 仓库下拉里该仓库的 → 页头 / 浏览器），与浏览器不同时标题旁标出。
 */
import {
  INBOUND_STAGE_GROUPS,
  inboundFlowUrl,
  inboundTrackUrl,
  normalizeInboundFlow,
  type InboundFlow,
  type InboundStep,
  type InboundStepKey,
} from '~/composables/asn/inboundFlow'
import type { CarrierTracking } from '~/composables/customs/carrierShipment'
import { activeStepKey, flowActionOf, type FlowAction, type FlowProblem } from '~/composables/shipping/shippingFlow'

const props = defineProps<{
  asnId: number | string
  selected?: string | null
}>()

const emit = defineEmits<{
  /** 做了操作（流程已重读）：页面刷新自己的数据 */
  (e: 'changed'): void
  /** 读到流程（页头据此显示阶段） */
  (e: 'loaded', flow: InboundFlow): void
}>()

const { t, te, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()
const staffStore = useStaffStore()

const flow = ref<InboundFlow | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)
/** ASN 所属仓库的时区（共用的步骤组件、在途详情都用它） */
const flowTimeZone = provideTimeZone(() => flow.value?.timezone, () => flow.value?.warehouse_id)
const carrierName = computed(() => flow.value?.carrier?.name || t('customs.carrier.carrier-fallback'))
// 收货、刷新跟踪：作业员的 asn_receive 或 asn_edit 任一（新建 / 修改 / 关闭 / 取消收货通知仍只认 asn_edit）
const canReceive = computed(() => staffStore.hasPermission('asn_receive', 'asn_edit'))

let loadGeneration = 0
onBeforeUnmount(() => { loadGeneration++ })
const load = async () => {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = null
  await httpRequest<any>(inboundFlowUrl(props.asnId), {
    method: 'GET',
    onSuccess: (data) => {
      if (generation !== loadGeneration) return
      const next = normalizeInboundFlow(data)
      flow.value = next
      if (next) emit('loaded', next)
    },
    onError: (error) => {
      if (generation !== loadGeneration) return
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      if (generation !== loadGeneration) return
      loading.value = false
    },
  })
  if (generation === loadGeneration) syncExpanded()
}

/** 做了操作：整体重读，通知页面 */
const refresh = async () => {
  await load()
  emit('changed')
}

/** 页面自己做了操作（收货、关闭、取消）后重读：不再 emit changed */
const reload = async () => {
  await load()
}

onMounted(load)
watch(() => props.asnId, () => {
  flow.value = null
  expanded.value = []
  autoKey = null
  load()
})

// ------------------ 展开 / 收起 ----------------------
const expanded = ref<string[]>([])
const userOpened = new Set<string>()
let autoKey: string | null = null

const expandable = (step: InboundStep): boolean => {
  if (step.state === 'skipped') return false
  if (step.key === 'in_transit') return !!flow.value?.tracking_number
  if (step.key === 'putaway') return Array.isArray(step.summary?.goods) && step.summary.goods.length > 0
  return false
}
const isExpanded = (key: string) => expanded.value.includes(key)
const toggle = (step: InboundStep) => {
  if (isExpanded(step.key)) {
    expanded.value = expanded.value.filter((k: string) => k !== step.key)
    userOpened.delete(step.key)
  } else {
    expanded.value = [...expanded.value, step.key]
    userOpened.add(step.key)
  }
}
/** 当前步骤变了：展开新的当前步骤（能展开时），收起上次自动展开、用户没点过的 */
const syncExpanded = () => {
  const steps = flow.value?.steps || []
  const active = activeStepKey(steps)
  if (active !== autoKey) {
    if (autoKey && !userOpened.has(autoKey)) expanded.value = expanded.value.filter((k: string) => k !== autoKey)
    const step = active ? steps.find((s: InboundStep) => s.key === active) : null
    if (step && expandable(step) && !expanded.value.includes(step.key)) expanded.value = [...expanded.value, step.key]
    autoKey = active
  }
  expanded.value = expanded.value.filter((key: string) => {
    const step = steps.find((s: InboundStep) => s.key === key)
    return !!step && expandable(step)
  })
}

// ------------------ 文案 ----------------------
const stepTitle = (key: string) => (te(`asn.flow.steps.${key}`) ? t(`asn.flow.steps.${key}`) : key)
const actionText = (key: string) => {
  for (const k of [`asn.flow.actions.${key}`, `shipping.actions.${key}`]) {
    if (te(k)) return t(k)
  }
  return key
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const time = (value: unknown) => formatLocaleDateTime(value ? String(value) : null, locale.value, flowTimeZone.value)

const problemText = (p: FlowProblem): string => {
  const params = { carrier: carrierName.value, date: String(p.date ?? ''), message: p.message || '' }
  for (const key of [`asn.flow.problems.${p.code}`, `shipping.problems.${p.code}`]) {
    if (te(key)) return t(key, params)
  }
  return p.message || p.code
}
const stepProblems = (step: InboundStep): FlowProblem[] =>
  (flow.value?.problems || []).filter((p: FlowProblem) => p.step === step.key)
const generalProblems = computed(() => {
  const keys = (flow.value?.steps || []).map((s: InboundStep) => s.key as string)
  return (flow.value?.problems || []).filter((p: FlowProblem) => !p.step || !keys.includes(String(p.step)))
})

const trackingText = (tr: CarrierTracking | null): string => {
  if (!tr?.status) return ''
  if (tr.status === 'delivered') {
    return tr.delivered_at
      ? t('asn.flow.summary.carrier-delivered-at', { carrier: carrierName.value, time: time(tr.delivered_at) })
      : t('asn.flow.summary.carrier-delivered', { carrier: carrierName.value })
  }
  const parts = [t(`customs.carrier.tracking.status.${tr.status}`, { carrier: carrierName.value })]
  const latest = tr.events?.[0]
  if (latest && tr.status !== 'label_created') {
    parts.push(t('customs.carrier.tracking.latest', {
      event: [latest.description, latest.location].filter(Boolean).join(' · ') || latest.code || '—',
    }))
  }
  if (tr.estimated_delivery) parts.push(t('customs.carrier.tracking.eta', { date: tr.estimated_delivery }))
  return parts.join(' · ')
}

/** 每一步的一行概要 */
const summaryText = (step: InboundStep): string => {
  const s = step.summary || {}
  switch (step.key) {
    case 'created': {
      const parts = [] as string[]
      if (s.order_number) parts.push(t('asn.flow.summary.order-number', { number: s.order_number }))
      parts.push(t('asn.flow.summary.lines', { lines: num(s.line_count) ?? 0, quantity: num(s.quantity) ?? 0 }))
      return parts.join(' · ')
    }
    case 'in_transit': {
      const number = String(s.tracking_number || '')
      if (!number) return t('asn.flow.summary.no-tracking')
      const tr = s.tracking && typeof s.tracking === 'object' ? (s.tracking as CarrierTracking) : null
      const text = trackingText(tr)
      if (text) return `${number} · ${text}`
      if (s.tracked_by_api && step.state !== 'done') return `${number} · ${t('asn.flow.summary.not-tracked-yet')}`
      if (s.tracking_url) return `${number} · ${t('asn.flow.summary.tracking-link')}`
      return number
    }
    case 'received': {
      if (step.state === 'done') {
        const actual = num(s.actual_quantity)
        return actual === null
          ? t('asn.flow.summary.received', { quantity: num(s.expected_quantity) ?? 0 })
          : t('asn.flow.summary.received-actual', { actual, quantity: num(s.expected_quantity) ?? 0 })
      }
      // 预计到货日已过：下面的问题（ARRIVAL_OVERDUE）会单独提示
      if (step.state === 'skipped' || !s.expected_arrival_date) return ''
      return t('asn.flow.summary.expected', { date: s.expected_arrival_date })
    }
    case 'sorting': {
      if (step.state === 'todo' || step.state === 'skipped') return ''
      return t('asn.flow.summary.sorting', {
        sorted: num(s.sorted_quantity) ?? 0, damaged: num(s.damage_quantity) ?? 0, quantity: num(s.expected_quantity) ?? 0,
      })
    }
    case 'putaway': {
      if (step.state === 'todo' || step.state === 'skipped') return ''
      const quantity = num(s.quantity) ?? 0
      if (step.state === 'current') return t('asn.flow.summary.putaway-pending', { pending: num(s.pending_quantity) ?? 0, quantity })
      return quantity > 0 ? t('asn.flow.summary.putaway-done', { quantity }) : t('asn.flow.summary.putaway-nothing')
    }
    case 'completed': {
      if (step.state !== 'done') return ''
      const diff = num(s.difference) ?? 0
      return t('asn.flow.summary.completed', {
        actual: num(s.actual_quantity) ?? 0, quantity: num(s.expected_quantity) ?? 0,
        difference: diff > 0 ? `+${diff}` : String(diff),
      })
    }
    default:
      return ''
  }
}

// ------------------ 分拣任务入口 ----------------------
const sortingTasks = (step: InboundStep): { id: number; status: string }[] =>
  (Array.isArray(step.summary?.tasks) ? step.summary.tasks : [])
    .filter((x: any) => x && x.id)
    .map((x: any) => ({ id: Number(x.id), status: String(x.status || '') }))
const taskStatusText = (status: string) => (te(`common.status.${status.replace('_', '-')}`)
  ? t(`common.status.${status.replace('_', '-')}`) : status)

// ------------------ 标题行的操作 ----------------------
const ACTION_ICONS: Record<string, string> = {
  receive: 'ri-checkbox-line',
  refresh_tracking: 'ri-refresh-line',
  open_tracking: 'ri-external-link-line',
}
/** 要 asn_receive / asn_edit 的操作 */
const RECEIVE_ACTIONS = ['receive', 'refresh_tracking']
const headerActions = (step: InboundStep): FlowAction[] => step.actions.filter((a: FlowAction) => a.enabled
  && Object.keys(ACTION_ICONS).includes(a.key) && (!RECEIVE_ACTIONS.includes(a.key) || canReceive.value)
  // 在途展开后由详细内容提供刷新 / 查询页
  && !(step.key === 'in_transit' && isExpanded(step.key)))

const transitRef = ref<{ run: (key: string) => void } | null>(null)
const setTransitRef = (el: any) => {
  transitRef.value = el && typeof el.run === 'function' ? el : null
}

const receiving = ref(false)
const selectedStep = computed(() => props.selected || null)
const activeStep = computed(() => flow.value?.steps.find(step => ['current', 'warning', 'blocked'].includes(step.state))
  || flow.value?.steps.filter(step => step.state === 'done').at(-1) || flow.value?.steps[0])
const shownSteps = computed(() => {
  const selected = flow.value?.steps.find(step => step.key === selectedStep.value) || activeStep.value
  return selected ? [selected] : []
})

const receive = async () => {
  if (receiving.value) return
  receiving.value = true
  await httpRequest(`/api/warehouse/asn/${props.asnId}/receive/`, {
    method: 'PUT',
    onSuccess: () => showToast(t('action-results.success'), 'success'),
    onError: (error) => showToast(bizErrorMessage(error), 'error'),
  })
  receiving.value = false
  // 成功，或失败（状态可能已经变了）：都整体重读
  await refresh()
}

const onHeaderAction = async (step: InboundStep, key: string) => {
  if (key === 'receive') return receive()
  if (key === 'open_tracking') {
    const url = String(flowActionOf(step, 'open_tracking')?.url || step.summary?.tracking_url || '').trim()
    if (url) window.open(url, '_blank', 'noopener')
    return
  }
  if (key === 'refresh_tracking') {
    if (!isExpanded(step.key)) toggle(step)
    await nextTick()
    transitRef.value?.run('refresh_tracking')
  }
}

/** 在途一步给 FlowTransitDetail 的：没有 asn_receive / asn_edit 时刷新按不能做（不带原因，不列说明） */
const transitStep = (step: InboundStep): InboundStep => (canReceive.value ? step : {
  ...step,
  actions: step.actions.map((a: FlowAction) => (a.key === 'refresh_tracking'
    ? { ...a, enabled: false, reason: null, reason_code: null } : a)),
})

defineExpose({ reload })
</script>


<template>
  <div class="asn-current" id="inbound-flow">
    <WCard v-if="loading && !flow"><span role="status">{{ t('common.status.loading') }}</span></WCard>
    <WAlert v-else-if="loadError && !flow" tone="block" :title="loadError"><template #actions><WButton @click="reload">{{ t('dn.list.retry') }}</WButton></template></WAlert>
    <template v-else-if="flow">
      <WAlert v-for="(problem, index) in generalProblems" :key="index" :tone="problem.level === 'error' ? 'block' : 'warn'" :title="problemText(problem)" />
      <section v-for="step in shownSteps" :key="step.key" class="asn-current__card" :aria-label="stepTitle(step.key)">
        <header class="asn-current__header">
          <div class="asn-current__heading">
            <span class="asn-current__eyebrow">{{ step.key === activeStep?.key ? t('dn.detail.now', { position: t('dn.detail.step-of', { index: flow.steps.indexOf(step) + 1, total: flow.steps.length }) }) : t('dn.detail.step-of', { index: flow.steps.indexOf(step) + 1, total: flow.steps.length }) }}</span>
            <h2>{{ stepTitle(step.key) }}</h2>
            <p v-if="summaryText(step)">{{ summaryText(step) }}</p>
          </div>
          <div class="asn-current__reference" v-if="step.key === 'in_transit' && flow.tracking_number"><span>{{ flow.carrier?.name }} · {{ t('common.fields.tracking-number') }}</span><strong>{{ flow.tracking_number }}</strong></div>
          <div class="asn-current__reference" v-else-if="step.at"><span>{{ t('common.fields.status') }} · {{ t('shipping.states.' + step.state) }}</span><strong class="asn-current__date">{{ time(step.at) }}</strong></div>
        </header>
        <div class="asn-current__body">
          <WAlert v-for="(problem, index) in stepProblems(step)" :key="index" :tone="problem.level === 'error' ? 'block' : 'warn'" :title="problemText(problem)" />
          <FlowTransitDetail v-if="step.key === 'in_transit' && expandable(step)" :ref="setTransitRef" :step="transitStep(step)"
            :carrier-name="flow.carrier?.name" :tracking-url="flow.carrier?.tracking_url" :refresh-url="inboundTrackUrl(asnId)"
            :waiting-text="t('asn.flow.transit.waiting', { carrier: carrierName })" @changed="refresh" />
          <template v-if="step.key === 'putaway' && expandable(step)">
            <WTable :rows="step.summary.goods" row-key="goods_id" :columns="[
              { key: 'goods', label: t('common.entities.goods'), wrap: true },
              { key: 'quantity', label: t('asn.flow.putaway.quantity'), type: 'qty', keepZero: true },
              { key: 'pending', label: t('asn.flow.putaway.pending'), type: 'qty', keepZero: true, strong: true }]">
              <template #cell-goods="{ row }"><NuxtLink :to="'/goods/detail/' + row.goods_id">{{ row.name || row.code }}</NuxtLink><div class="w-muted">{{ row.code }}</div></template>
            </WTable>
            <p class="asn-current__note">{{ t('asn.flow.putaway.estimated') }} <template v-if="step.summary.last_putaway_at">{{ t('asn.flow.putaway.last', { time: time(step.summary.last_putaway_at) }) }}</template></p>
          </template>
          <div v-if="step.key === 'sorting' && sortingTasks(step).length" class="asn-current__actions"><WButton v-for="task in sortingTasks(step)" :key="task.id" :to="'/sorting/detail/' + task.id">SORT-{{ task.id }} · {{ taskStatusText(task.status) }}</WButton></div>
          <div class="asn-current__actions" v-if="step.key !== 'in_transit' && headerActions(step).length">
            <WButton v-for="action in headerActions(step)" :key="action.key" :variant="action.key === 'receive' ? 'primary' : 'secondary'" :loading="action.key === 'receive' && receiving" @click="onHeaderAction(step, action.key)">{{ actionText(action.key) }}</WButton>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.asn-current { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.asn-current__card { background: var(--w-surface); border: 1px solid var(--w-sel-line); border-radius: 10px; overflow: hidden; }
.asn-current__header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; padding: 20px 24px 16px; border-bottom: 1px solid var(--w-line); }
.asn-current__heading { display: flex; flex-direction: column; gap: 2px; flex: 1 1 320px; min-width: 0; }
.asn-current__eyebrow { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--w-sel-text); }
.asn-current h2 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; }
.asn-current p { margin: 0; font-size: 13px; line-height: 20px; color: var(--w-text-2); }
.asn-current__reference { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
.asn-current__reference > span { font-size: 12px; line-height: 18px; color: var(--w-text-3); }
.asn-current__reference > strong { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: .02em; }
.asn-current__reference > .asn-current__date { font-size: 14px; letter-spacing: 0; }
.asn-current__body { padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 12px; }
.asn-current__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.asn-current .asn-current__note { font-size: 12px; line-height: 18px; color: var(--w-text-3); }
</style>
