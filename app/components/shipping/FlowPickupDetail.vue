<script lang="ts" setup>
/**
 * 发货流程 ·「揽收」一步的内容，按承运商的揽收方式（summary.method，没有时用承运商的 methods.pickup）：
 * - api：在线预约（book_pickup）——先读这家承运商在本仓库的待揽收运单，前置条件不满足就列出来；否则打开预约弹窗
 *   （本单默认勾上，同仓库其它等揽收的运单可以一起带；今天已经约过一次时提示快递员来时可以一起交）
 * - manual：电话 / 网站约好后记一笔（record_pickup，ManualPickupModal），显示约揽收的联系方式；
 *   api 的承运商也可以手工记一笔（承运商系统故障、电话约的），后端列出 record_pickup 时给次要按钮
 * - scheduled：定期集荷，显示星期与时间段，不用逐票约
 * - dropoff：自送网点
 * 已约上的：日期 / 时间段 / 受理号，可取消（cancel_pickup；手工记录只改本地）。做了操作 emit changed。
 */
import { warehouseHeaders } from '~/utils/http'
import {
  carrierShipmentUrl,
  isActiveShipment,
  normalizeCarrierStatus,
  type CarrierShipment,
} from '~/composables/customs/carrierShipment'
import {
  PICKUPS_URL,
  pickupTimeWindow,
  pickupUrl,
  type CarrierPickup,
  type ManualPickupShipment,
  type PickupBlocker,
  type PickupOverview,
  type PickupShipmentRow,
  type PickupSummary,
} from '~/composables/customs/carrierPickup'
import {
  flowActionEnabled,
  type FlowCarrier,
  type FlowStep,
  type PickupSchedule,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  dnId: number | string
  step: FlowStep
  carrier: FlowCarrier | null
  /** 运单一步的运单（有效时才能约） */
  shipment: CarrierShipment | null
  warehouseId?: number | string | null
  /** DN 已发货：只显示结果 */
  locked?: boolean
}>(), {
  warehouseId: null,
  locked: false,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()

const method = computed(() => String(props.step.summary?.method || props.carrier?.methods.pickup || 'none'))
const pickup = computed<PickupSummary | null>(() => {
  const p = props.step.summary?.pickup
  return p && typeof p === 'object' ? (p as PickupSummary) : null
})
const schedule = computed<PickupSchedule | null>(() => {
  const s = props.step.summary?.schedule
  return s && typeof s === 'object' && Array.isArray(s.weekdays) ? (s as PickupSchedule) : null
})
const contact = computed(() => String(props.step.summary?.contact || '').trim())
const contactIsUrl = computed(() => /^https?:\/\//i.test(contact.value))
const carrierName = computed(() => props.carrier?.name || t('customs.carrier.carrier-fallback'))
/** 流程的运单一步没带运单详情（旧后端）时自己读一次 */
const fetchedShipment = ref<CarrierShipment | null>(null)
const activeShipment = computed(() => {
  const s = props.shipment ?? fetchedShipment.value
  return isActiveShipment(s) ? s : null
})
const loadShipment = async () => {
  if (props.shipment || props.locked) return
  await httpRequest<any>(carrierShipmentUrl(props.dnId), {
    method: 'GET',
    onSuccess: (data) => {
      fetchedShipment.value = normalizeCarrierStatus(data)?.shipment ?? null
    },
  })
}
onMounted(loadShipment)
watch(() => props.step.summary?.pickup?.id, loadShipment)
const scheduled = computed(() => pickup.value?.status === 'scheduled' && !pickup.value.past)
const holds = computed(() => !!pickup.value?.holds_shipments)

const weekdayText = (days: number[]) =>
  [...days].sort((a, b) => a - b).map((d) => t(`shipping.weekdays.${d}`)).join(t('shipping.list-separator'))

const pickupText = computed(() => {
  const p = pickup.value
  if (!p || ['cancelled', 'failed', 'dismissed'].includes(p.status)) return t('customs.carrier.pickup.none')
  // 这一步已完成（货已交出）时揽收日过了是正常的，不再提示重约
  if (p.status === 'scheduled' && p.past && !props.locked && props.step.state !== 'done') {
    return t('customs.carrier.pickup.past', { date: p.pickup_date })
  }
  if (p.status === 'scheduled') {
    return t('customs.carrier.pickup.scheduled', { date: p.pickup_date, window: pickupTimeWindow(p), code: p.confirmation_code || '—' })
  }
  return t(p.status === 'pending' ? 'customs.carrier.pickup.pending' : 'customs.carrier.pickup.unknown')
})
const pageLink = computed(() => ({
  path: '/delivery/pickup',
  query: { carrier_id: props.carrier?.id ?? undefined, warehouse_id: props.warehouseId ?? undefined },
}))

// ------------------ 能做的操作（后端没列出时按状态推断） ----------------------
const canBook = computed(() => flowActionEnabled(props.step, 'book_pickup',
  method.value === 'api' && !props.locked && !!activeShipment.value && !holds.value))
const canRecord = computed(() => (method.value === 'manual' || method.value === 'api')
  && flowActionEnabled(props.step, 'record_pickup', method.value === 'manual' && !props.locked && !!activeShipment.value
    && !holds.value))
const canCancel = computed(() => flowActionEnabled(props.step, 'cancel_pickup', !props.locked && scheduled.value))
const actionText = (key: string) => (te(`shipping.actions.${key}`) ? t(`shipping.actions.${key}`) : key)

// ------------------ 在线预约 ----------------------
const preparing = ref(false)
const blockers = ref<PickupBlocker[]>([])
const overview = ref<PickupOverview | null>(null)
const bookOpen = ref(false)

watch(() => activeShipment.value?.id, () => {
  blockers.value = []
})

const blockerText = (b: PickupBlocker) =>
  te(`delivery.pickup.blockers.${b.code}`) ? t(`delivery.pickup.blockers.${b.code}`) : b.message || b.code

const book = async () => {
  const mineId = activeShipment.value?.id
  if (preparing.value || !props.carrier?.id || !mineId) return
  preparing.value = true
  blockers.value = []
  await httpRequest<PickupOverview>(`${PICKUPS_URL}?carrier_id=${props.carrier.id}`, {
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
      bookOpen.value = true
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      preparing.value = false
    },
  })
}

/** 预约弹窗里的运单：本单在最前，后面是同仓库其它还能约的 */
const modalShipments = computed(() => {
  const rows = overview.value?.shipments || []
  const mineId = activeShipment.value?.id
  return [
    ...rows.filter((r: PickupShipmentRow) => r.shipment_id === mineId),
    ...rows.filter((r: PickupShipmentRow) => r.shipment_id !== mineId && r.can_schedule),
  ]
})
const initialSelected = computed(() => (activeShipment.value?.id ? [activeShipment.value.id] : []))
const note = computed(() => {
  const today = overview.value?.today
  const booked = (overview.value?.pickups || []).find((p: CarrierPickup) => p.status === 'scheduled' && !p.past && p.pickup_date === today)
  return booked
    ? t('customs.carrier.pickup.booked-today', { window: pickupTimeWindow(booked), code: booked.confirmation_code || '—' })
    : null
})

// ------------------ 手工记录 ----------------------
const recordOpen = ref(false)
const manualShipments = computed<ManualPickupShipment[]>(() => (activeShipment.value?.id
  ? [{ shipment_id: activeShipment.value.id, tracking_number: activeShipment.value.tracking_number, dn_id: Number(props.dnId) }]
  : []))
const record = () => {
  if (!canRecord.value || !activeShipment.value?.id) return
  recordOpen.value = true
}

// ------------------ 取消 ----------------------
const cancelling = ref(false)
const cancel = async () => {
  const p = pickup.value
  if (!p?.id || cancelling.value) return
  const confirmed = await showConfirm(
    t('delivery.pickup.cancel-confirm-title'),
    t('delivery.pickup.cancel-confirm', { date: p.pickup_date, window: pickupTimeWindow(p), code: p.confirmation_code || '—' }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return
  cancelling.value = true
  await httpRequest(pickupUrl(p.id, 'cancel'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) },
    onSuccess: () => {
      showToast(t('delivery.pickup.cancelled-toast'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      cancelling.value = false
    },
  })
  emit('changed')
}

/** 标题行上的操作按钮（流程组件展开这一步后调用） */
const run = (key: string) => {
  if (key === 'book_pickup') book()
  else if (key === 'record_pickup') record()
  else if (key === 'cancel_pickup') cancel()
}

defineExpose({ run })
</script>

<template>
  <div class="flow-pickup fs-13">
    <!-- 定期集荷 / 自送网点：不用逐票约 -->
    <template v-if="method === 'scheduled'">
      <div>
        <i class="ri-calendar-check-line me-1 text-success"></i>
        <template v-if="schedule && schedule.weekdays.length">
          {{ t('shipping.pickup.schedule', { days: weekdayText(schedule.weekdays), window: pickupTimeWindow(schedule) }) }}
        </template>
        <template v-else>{{ t('shipping.pickup.schedule-unset') }}</template>
      </div>
      <div class="fs-12 text-muted mt-1">{{ t('shipping.pickup.schedule-hint', { carrier: carrierName }) }}</div>
    </template>
    <template v-else-if="method === 'dropoff'">
      <div><i class="ri-store-2-line me-1"></i>{{ t('shipping.pickup.dropoff', { carrier: carrierName }) }}</div>
    </template>

    <!-- 在线预约 / 手工记录 -->
    <template v-else-if="method === 'api' || method === 'manual'">
      <!-- 概要行已经写了「还没约」：有预约记录时才在这里列出（带来源） -->
      <div :class="scheduled || step.state === 'done' ? 'text-success' : (pickup?.status === 'unknown' || pickup?.past ? 'text-warning' : '')" v-if="pickup">
        <i class="ri-truck-line me-1"></i>{{ pickupText }}
        <span class="badge bg-light text-default ms-1" v-if="pickup && pickup.source === 'manual'">{{ t('shipping.pickup.manual-badge') }}</span>
      </div>
      <div class="mt-1" v-if="method === 'manual' && contact">
        <i class="ri-phone-line me-1 text-muted"></i>{{ t('shipping.pickup.contact') }}
        <a :href="contact" target="_blank" rel="noopener" v-if="contactIsUrl">{{ contact }}</a>
        <span class="text-break" v-else>{{ contact }}</span>
      </div>
      <div class="fs-12 text-muted mt-1" v-if="!activeShipment && !locked">{{ t('shipping.pickup.after-waybill') }}</div>

      <div class="d-flex flex-wrap align-items-center gap-2 mt-2" v-if="!locked">
        <button type="button" class="btn btn-sm btn-primary" v-if="method === 'api' && canBook" :disabled="preparing" @click="book">
          <span v-if="preparing" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="ri-truck-line me-1"></i>{{ actionText('book_pickup') }}
        </button>
        <button type="button" class="btn btn-sm" :class="method === 'manual' ? 'btn-primary' : 'btn-light'" v-if="canRecord"
          @click="record">
          <i class="ri-edit-box-line me-1"></i>{{ actionText('record_pickup') }}
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" v-if="canCancel && pickup?.id" :disabled="cancelling" @click="cancel">
          <span v-if="cancelling" class="spinner-border spinner-border-sm me-1"></span>{{ actionText('cancel_pickup') }}
        </button>
        <NuxtLink :to="pageLink" class="btn btn-sm btn-link px-0">{{ t('customs.carrier.pickup.page') }}</NuxtLink>
      </div>

      <!-- 不能约的原因（点「预约揽收」时读到的） -->
      <div class="alert alert-warning-transparent fs-13 mt-2 mb-0" v-if="blockers.length">
        <div class="fw-semibold mb-1">{{ t('delivery.pickup.blockers.title') }}</div>
        <ul class="mb-0 ps-3">
          <li v-for="(b, i) in blockers" :key="`pb-${i}`">{{ blockerText(b) }}</li>
        </ul>
      </div>
    </template>

    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrierName" v-if="!locked" />

    <CarrierPickupModal v-model:open="bookOpen" :carrier-id="carrier?.id ?? null" :carrier-name="carrierName"
      :warehouse-id="warehouseId" :shipments="modalShipments" selectable :initial-selected="initialSelected"
      :location="overview?.pickup_location" :max-remarks="overview?.max_remarks" :today="overview?.today" :note="note"
      @submitted="emit('changed')" />
    <ManualPickupModal v-model:open="recordOpen" :carrier-id="carrier?.id ?? null" :carrier-name="carrierName"
      :warehouse-id="warehouseId" :shipments="manualShipments" :contact="contact || null"
      @submitted="emit('changed')" />
  </div>
</template>
