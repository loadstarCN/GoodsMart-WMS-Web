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

const load = async () => {
  loading.value = true
  loadError.value = null
  await httpRequest<any>(inboundFlowUrl(props.asnId), {
    method: 'GET',
    onSuccess: (data) => {
      const next = normalizeInboundFlow(data)
      flow.value = next
      if (next) emit('loaded', next)
    },
    onError: (error) => {
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
  syncExpanded()
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
  <div class="card custom-card inbound-flow" id="inbound-flow">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div class="card-title d-flex flex-wrap align-items-center gap-2">
        <span><i class="ri-route-line me-1 align-middle"></i>{{ t('asn.flow.title') }}</span>
        <InboundStageBadge :stage="flow?.stage" />
        <span class="badge bg-light text-default fw-normal" v-if="flow?.carrier">
          <i class="ri-truck-line me-1"></i>{{ flow.carrier.name }}
        </span>
        <TimeZoneBadge v-if="flow" :zone="flowTimeZone" />
      </div>
      <button type="button" class="btn btn-sm btn-icon btn-light" :disabled="loading" :title="t('shipping.refresh')"
        :aria-label="t('shipping.refresh')" @click="refresh">
        <span class="spinner-border spinner-border-sm" v-if="loading && flow"></span>
        <i class="ri-refresh-line" v-else></i>
      </button>
    </div>

    <div class="card-body">
      <div class="d-flex justify-content-center py-4" v-if="loading && !flow">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
        </div>
      </div>
      <div class="alert alert-danger-transparent mb-0" v-else-if="loadError && !flow">{{ loadError }}</div>

      <template v-else-if="flow">
        <ShippingFlowStepper :steps="flow.steps" :groups="INBOUND_STAGE_GROUPS" label-prefix="asn.flow.steps"
          :aria-label="t('asn.flow.title')" class="mb-3" />

        <ul class="list-unstyled fs-13 mb-3" v-if="generalProblems.length">
          <li v-for="(p, i) in generalProblems" :key="`gp-${i}`" :class="p.level === 'error' ? 'text-danger' : 'text-warning'">
            <i class="me-1" :class="p.level === 'error' ? 'ri-close-circle-line' : 'ri-error-warning-line'"></i>{{ problemText(p) }}
          </li>
        </ul>

        <ShippingFlowStep v-for="(step, index) in flow.steps" :key="step.key" :step="step" :index="index + 1"
          id-prefix="inbound-step" :title="stepTitle(step.key)" :summary="summaryText(step)" :expandable="expandable(step)"
          :expanded="isExpanded(step.key)" :problems="stepProblems(step)" :problem-text="problemText"
          :last="index === flow.steps.length - 1" @toggle="toggle(step)">
          <template #meta v-if="step.key === 'sorting' && sortingTasks(step).length">
            <NuxtLink v-for="task in sortingTasks(step)" :key="task.id" :to="`/sorting/detail/${task.id}`">
              #SORT-{{ task.id }}<span class="text-muted ms-1">{{ taskStatusText(task.status) }}</span>
            </NuxtLink>
          </template>
          <template #actions v-if="headerActions(step).length">
            <button type="button" class="btn btn-sm" v-for="a in headerActions(step)" :key="a.key"
              :class="a.key === 'receive' ? 'btn-primary-light' : 'btn-light'"
              :disabled="a.key === 'receive' && receiving" @click="onHeaderAction(step, a.key)">
              <span class="spinner-border spinner-border-sm me-1" v-if="a.key === 'receive' && receiving"></span>
              <i class="me-1" :class="ACTION_ICONS[a.key]" v-else></i>{{ actionText(a.key) }}
            </button>
          </template>

          <!-- 在途：跟踪状态、扫描记录、刷新 / 查询页 -->
          <FlowTransitDetail v-if="step.key === 'in_transit' && expandable(step)" :ref="setTransitRef" :step="transitStep(step)"
            :carrier-name="flow.carrier?.name" :tracking-url="flow.carrier?.tracking_url" :refresh-url="inboundTrackUrl(asnId)"
            :waiting-text="t('asn.flow.transit.waiting', { carrier: carrierName })" @changed="refresh" />

          <!-- 上架：逐商品的待上架（估算） -->
          <template v-else-if="step.key === 'putaway' && expandable(step)">
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0 fs-12 inbound-putaway">
                <thead>
                  <tr>
                    <th scope="col">{{ t('common.entities.goods') }}</th>
                    <th scope="col" class="text-end">{{ t('asn.flow.putaway.quantity') }}</th>
                    <th scope="col" class="text-end">{{ t('asn.flow.putaway.pending') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in step.summary.goods" :key="g.goods_id">
                    <td class="text-wrap">
                      <NuxtLink :to="`/goods/detail/${g.goods_id}`">{{ g.name || g.code || `#${g.goods_id}` }}</NuxtLink>
                      <span class="text-muted ms-1" v-if="g.code && g.name">{{ g.code }}</span>
                    </td>
                    <td class="text-end">{{ g.quantity }}</td>
                    <td class="text-end" :class="{ 'fw-semibold text-warning': Number(g.pending) > 0 }">{{ g.pending }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="fs-12 text-muted mb-0 mt-1">
              <i class="ri-information-line me-1"></i>{{ t('asn.flow.putaway.estimated') }}
              <template v-if="step.summary.last_putaway_at"> {{ t('asn.flow.putaway.last', { time: time(step.summary.last_putaway_at) }) }}</template>
            </p>
          </template>
        </ShippingFlowStep>
      </template>
    </div>
  </div>
</template>

<style scoped>
.inbound-putaway {
  max-width: 40rem;
}
</style>
