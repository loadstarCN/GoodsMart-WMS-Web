<script lang="ts" setup>
/**
 * 配送任务 · 海外发货的「预约揽收」一步。承运商要另约揽收（integration.books_pickups，如 FedEx 没有定期集荷），
 * 或这张运单已经约过时才显示（由外层判断）。
 * - 运单建好前：等运单
 * - 已约上且揽收日没过：完成，显示日期 / 时间段 / 确认号；要取消去揽收页
 * - 预约中 / 结果不明：去揽收页处理
 * - 没约（或没约上 / 已取消 / 已作废 / 揽收日过了）：「预约揽收」→ 读这家承运商在本仓库的待揽收运单，前置条件不满足就列出来；
 *   否则打开预约弹窗，本单默认勾上，同仓库其它等揽收的运单可以一起带；今天已经约过一次时提示快递员来时可以一起交
 * 预约后（不论成败）emit changed，外层重读运单状态。
 */
import { warehouseHeaders } from '~/utils/http'
import { isActiveShipment, type CarrierShipmentStatus } from '~/composables/customs/carrierShipment'
import {
  PICKUPS_URL,
  pickupTimeWindow,
  type CarrierPickup,
  type PickupBlocker,
  type PickupOverview,
  type PickupShipmentRow,
} from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  index: number
  /** 承运商运单状态（GET carrier-shipment） */
  status: CarrierShipmentStatus | null
  /** DN 所属仓库（揽收按仓库约） */
  warehouseId?: number | string | null
  /** 打包完成（或已发货）后才办 */
  ready?: boolean
  /** DN 已发货：只显示结果 */
  locked?: boolean
  last?: boolean
}>(), {
  warehouseId: null,
  ready: false,
  locked: false,
  last: false,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const staffStore = useStaffStore()

const shipment = computed(() => {
  const s = props.status?.shipment ?? null
  return isActiveShipment(s) ? s : null
})
const pickup = computed(() => shipment.value?.pickup ?? null)
const carrierId = computed(() => props.status?.carrier?.id ?? null)
const carrierName = computed(() => props.status?.integration?.name || props.status?.carrier?.name || '')
const scheduled = computed(() => pickup.value?.status === 'scheduled' && !pickup.value.past)
const pageLink = computed(() => ({
  path: '/delivery/pickup',
  query: { carrier_id: carrierId.value ?? undefined, warehouse_id: props.warehouseId ?? undefined },
}))
const canBook = computed(() => staffStore.hasPermission('delivery_edit') || staffStore.hasPermission('packing_edit'))
/** 还没被预约占着（没约 / 没约上 / 已取消 / 已作废 / 揽收日过了）：可以约 */
const needsBooking = computed(() =>
  props.ready && !props.locked && !!shipment.value && !(pickup.value?.holds_shipments ?? false))

const scheduledText = () => {
  const p = pickup.value
  return p ? t('customs.carrier.pickup.scheduled', { date: p.pickup_date, window: pickupTimeWindow(p), code: p.confirmation_code || '—' }) : ''
}

const step = computed<{ state: 'done' | 'current' | 'todo' | 'warning'; summary: string }>(() => {
  const p = pickup.value
  if (props.locked) return { state: 'done', summary: p?.status === 'scheduled' ? scheduledText() : '' }
  if (!props.ready || !shipment.value) return { state: 'todo', summary: t('customs.steps.pickup-after-shipment') }
  if (scheduled.value) return { state: 'done', summary: scheduledText() }
  if (p?.status === 'pending') return { state: 'current', summary: t('customs.carrier.pickup.pending') }
  if (p?.status === 'unknown') return { state: 'warning', summary: t('customs.carrier.pickup.unknown') }
  if (p?.status === 'scheduled' && p.past) return { state: 'warning', summary: t('customs.carrier.pickup.past', { date: p.pickup_date }) }
  return { state: 'current', summary: t('customs.carrier.pickup.none') }
})

// ------------------ 预约 ----------------------
const preparing = ref(false)
const blockers = ref<PickupBlocker[]>([])
const overview = ref<PickupOverview | null>(null)
const modalOpen = ref(false)

// 运单变了（取消、重建）：上次读到的前置条件不再作数
watch(() => shipment.value?.id, () => {
  blockers.value = []
})

const blockerText = (b: PickupBlocker) =>
  te(`delivery.pickup.blockers.${b.code}`) ? t(`delivery.pickup.blockers.${b.code}`) : b.message || b.code

const book = async () => {
  if (preparing.value || !carrierId.value || !shipment.value) return
  preparing.value = true
  blockers.value = []
  const mineId = shipment.value.id
  await httpRequest<PickupOverview>(`${PICKUPS_URL}?carrier_id=${carrierId.value}`, {
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) },
    onSuccess: (data: PickupOverview) => {
      overview.value = data
      if (data.blockers?.length) {
        blockers.value = data.blockers
        return
      }
      const mine = data.shipments.find((r: PickupShipmentRow) => r.shipment_id === mineId)
      if (!mine?.can_schedule) {
        // 别人刚约了 / 运单变了：按最新状态显示
        showToast(t('customs.carrier.pickup.stale'), 'warning')
        emit('changed')
        return
      }
      modalOpen.value = true
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      preparing.value = false
    },
  })
}

/** 弹窗里的运单：本单在最前，后面是同仓库其它还能约的 */
const modalShipments = computed(() => {
  const rows = overview.value?.shipments || []
  const mineId = shipment.value?.id
  return [
    ...rows.filter((r: PickupShipmentRow) => r.shipment_id === mineId),
    ...rows.filter((r: PickupShipmentRow) => r.shipment_id !== mineId && r.can_schedule),
  ]
})
const initialSelected = computed(() => (shipment.value?.id ? [shipment.value.id] : []))
/** 今天已经约过一次（还没过）：快递员来时可以一起交，不一定要再约 */
const note = computed(() => {
  const today = overview.value?.today
  const booked = (overview.value?.pickups || []).find((p: CarrierPickup) => p.status === 'scheduled' && !p.past && p.pickup_date === today)
  return booked
    ? t('customs.carrier.pickup.booked-today', { window: pickupTimeWindow(booked), code: booked.confirmation_code || '—' })
    : null
})
</script>

<template>
  <ShippingStep :index="index" :title="t('customs.steps.pickup')" :state="step.state" :summary="step.summary" :last="last">
    <template #actions v-if="ready && shipment">
      <button type="button" class="btn btn-sm btn-primary" v-if="needsBooking && canBook" :disabled="preparing" @click="book">
        <span v-if="preparing" class="spinner-border spinner-border-sm me-1"></span>
        <i v-else class="ri-truck-line me-1"></i>{{ t('customs.carrier.pickup.book') }}
      </button>
      <NuxtLink :to="pageLink" class="btn btn-sm btn-link px-0">
        {{ scheduled ? t('customs.carrier.pickup.view') : t('customs.carrier.pickup.page') }}
      </NuxtLink>
    </template>
    <!-- 不能约的原因（点「预约揽收」时读到的）；没有时不占正文 -->
    <template #default v-if="blockers.length">
      <div class="alert alert-warning-transparent fs-13 mb-0">
        <div class="fw-semibold mb-1">{{ t('delivery.pickup.blockers.title') }}</div>
        <ul class="mb-0 ps-3">
          <li v-for="(b, i) in blockers" :key="`pb-${i}`">{{ blockerText(b) }}</li>
        </ul>
      </div>
    </template>
  </ShippingStep>

  <CarrierPickupModal v-model:open="modalOpen" :carrier-id="carrierId" :carrier-name="carrierName"
    :warehouse-id="warehouseId" :shipments="modalShipments" selectable :initial-selected="initialSelected"
    :location="overview?.pickup_location" :max-remarks="overview?.max_remarks" :today="overview?.today" :note="note"
    @submitted="emit('changed')" />
</template>
