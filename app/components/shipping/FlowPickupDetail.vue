<script lang="ts" setup>
/**
 * 发货流程 ·「揽收」一步的内容（设计稿 CarrierSteps「揽收」、DeliveryPrint「预约揽收」），按承运商的揽收方式
 * （summary.method，没有时用承运商的 methods.pickup）：
 * - api：在线预约（book_pickup）——点「预约揽收」先读这家承运商在本仓库的待揽收运单，前置条件不满足就列出来；
 *   否则在这里展开预约表单 CarrierPickupForm（本单默认勾上，同仓库其它等揽收的运单可以一起带；今天已经约过一次时提示
 *   快递员来时可以一起交）。不自动展开：展开时要向承运商查可约时间
 * - manual：电话 / 网站约好后记一笔（record_pickup，ManualPickupForm 直接展开），显示约揽收的联系方式；
 *   api 的承运商也可以手工记一笔（承运商系统故障、电话约的），后端列出 record_pickup 时给「登记预约」
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
/** 预约状态的圆点：已约上 / 已完成绿；结果不明、揽收日已过琥珀；还没约灰 */
const pickupTone = computed<'ok' | 'warn' | 'none'>(() => {
  const p = pickup.value
  if (props.step.state === 'done' || scheduled.value) return 'ok'
  if (p?.status === 'unknown' || p?.past || p?.status === 'pending') return 'warn'
  return 'none'
})
/** 定期集荷：下一次揽收的日期（仓库当地的今天起，按星期找） */
const nextScheduled = computed(() => {
  const sc = schedule.value
  if (!sc || !sc.weekdays.length) return ''
  const today = zonedToday(resolveTimeZone(props.warehouseId))
  const base = new Date(today + 'T00:00:00Z')
  for (let i = 0; i < 8; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    const iso = ((d.getUTCDay() + 6) % 7) + 1
    if (sc.weekdays.includes(iso)) {
      const date = d.toISOString().slice(0, 10)
      return t('shipping.pickup.next', { date: date.slice(5, 7) + '/' + date.slice(8, 10), weekday: t('shipping.weekdays.' + iso) })
    }
  }
  return ''
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
const bookForm = ref<{ submit: () => Promise<void>; submitting: boolean; canSubmit: boolean; submitSummary: string } | null>(null)

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
      recordOpen.value = false
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
const recordForm = ref<{ submit: () => Promise<void>; submitting: boolean; canSubmit: boolean } | null>(null)
/** 手工方式、还没约上：表单直接展开（不用逐一点开） */
const recordInline = computed(() => method.value === 'manual' && canRecord.value && !scheduled.value && !props.locked)
const manualShipments = computed<ManualPickupShipment[]>(() => (activeShipment.value?.id
  ? [{ shipment_id: activeShipment.value.id, tracking_number: activeShipment.value.tracking_number, dn_id: Number(props.dnId) }]
  : []))
const record = () => {
  if (!canRecord.value || !activeShipment.value?.id) return
  bookOpen.value = false
  recordOpen.value = true
}
const onPickupDone = () => {
  bookOpen.value = false
  recordOpen.value = false
}

// ------------------ 取消 ----------------------
const cancelling = ref(false)
const cancel = async () => {
  const p = pickup.value
  if (!p?.id || cancelling.value) return
  const confirmed = await wConfirm({
    title: t('delivery.pickup.cancel-confirm-title'),
    message: t('delivery.pickup.cancel-confirm', { date: p.pickup_date, window: pickupTimeWindow(p), code: p.confirmation_code || '—' }),
    confirmText: t('shipping.actions.cancel_pickup'),
    cancelText: t('delivery.pickup.keep'),
    danger: true,
  })
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
  <div class="w-flow-pickup">
    <!-- 定期集荷 / 自送网点：不用逐票约 -->
    <template v-if="method === 'scheduled'">
      <div class="w-flow-pickup__big">
        <template v-if="schedule && schedule.weekdays.length">
          {{ t('shipping.pickup.schedule', { days: weekdayText(schedule.weekdays), window: pickupTimeWindow(schedule) }) }}
        </template>
        <template v-else>{{ t('shipping.pickup.schedule-unset') }}</template>
      </div>
      <p class="w-flow-pickup__note">
        {{ nextScheduled }}<WHelp :text="t('shipping.pickup.schedule-hint', { carrier: carrierName })" />
      </p>
    </template>
    <template v-else-if="method === 'dropoff'">
      <div class="w-flow-pickup__big">{{ t('shipping.pickup.dropoff', { carrier: carrierName }) }}</div>
      <p class="w-flow-pickup__note">{{ t('shipping.pickup.dropoff-hint') }}</p>
    </template>

    <!-- 在线预约 / 手工记录 -->
    <template v-else-if="method === 'api' || method === 'manual'">
      <div v-if="pickup" class="w-flow-pickup__status">
        <WStatus :tone="pickupTone">{{ pickupText }}</WStatus>
        <WTag v-if="pickup.source === 'manual'">{{ t('shipping.pickup.manual-badge') }}</WTag>
      </div>
      <div v-if="method === 'manual' && contact && !recordInline" class="w-flow-pickup__contact">
        <span class="w-faint">{{ t('shipping.pickup.contact') }}</span>
        <a v-if="contactIsUrl" :href="contact" target="_blank" rel="noopener" class="w-flow-pickup__link">{{ contact }}<WIcon name="external" :size="12" /></a>
        <span v-else>{{ contact }}</span>
      </div>
      <p v-if="!activeShipment && !locked" class="w-flow-pickup__plain">{{ t('shipping.pickup.after-waybill') }}</p>

      <!-- 不能约的原因（点「预约揽收」时读到的） -->
      <WAlert v-if="blockers.length" tone="warn" :title="t('delivery.pickup.blockers.title')">
        <span v-for="(b, i) in blockers" :key="`pb-${i}`" class="w-flow-pickup__line">{{ blockerText(b) }}</span>
      </WAlert>

      <!-- 在线预约的表单：点了「预约揽收」后展开 -->
      <div v-if="bookOpen && !locked" class="w-flow-pickup__form">
        <CarrierPickupForm ref="bookForm" :active="bookOpen" :carrier-id="carrier?.id ?? null" :carrier-name="carrierName"
          :warehouse-id="warehouseId" :shipments="modalShipments" selectable :initial-selected="initialSelected"
          :location="overview?.pickup_location" :max-remarks="overview?.max_remarks" :today="overview?.today" :note="note"
          @booked="onPickupDone" @submitted="emit('changed')">
          <template #batch-footer>
            <NuxtLink :to="pageLink" class="w-flow-pickup__link">{{ t('customs.carrier.pickup.page') }} →</NuxtLink>
          </template>
        </CarrierPickupForm>
        <div class="w-flow-pickup__actions">
          <WButton v-if="canRecord" variant="text" @click="record">{{ t('shipping.pickup.record-instead') }}</WButton>
          <span class="w-flow-pickup__spacer" />
          <WButton :disabled="bookForm?.submitting" @click="bookOpen = false">{{ t('button.cancel') }}</WButton>
          <WButton variant="primary" :loading="bookForm?.submitting" :disabled="!bookForm?.canSubmit" @click="bookForm?.submit()">
            {{ t('shipping.pickup.book-submit', { carrier: carrierName, summary: bookForm?.submitSummary || '' }) }}
          </WButton>
        </div>
      </div>

      <!-- 手工登记：手工方式直接展开；在线方式点「登记预约」后展开 -->
      <div v-else-if="(recordInline || recordOpen) && !locked" class="w-flow-pickup__form">
        <ManualPickupForm ref="recordForm" :active="recordInline || recordOpen" :carrier-id="carrier?.id ?? null"
          :carrier-name="carrierName" :warehouse-id="warehouseId" :shipments="manualShipments" :contact="contact || null"
          @recorded="onPickupDone" @submitted="emit('changed')" />
        <div class="w-flow-pickup__actions">
          <NuxtLink :to="pageLink" class="w-flow-pickup__link">{{ t('customs.carrier.pickup.page') }} →</NuxtLink>
          <span class="w-flow-pickup__spacer" />
          <WButton v-if="recordOpen && !recordInline" :disabled="recordForm?.submitting" @click="recordOpen = false">{{ t('button.cancel') }}</WButton>
          <WButton variant="primary" :loading="recordForm?.submitting" :disabled="!recordForm?.canSubmit" @click="recordForm?.submit()">
            {{ t('shipping.pickup.record-submit') }}
          </WButton>
        </div>
      </div>

      <div v-else-if="!locked" class="w-flow-pickup__actions">
        <WButton v-if="method === 'api' && canBook" variant="primary" icon="pickup" :loading="preparing" @click="book">
          {{ actionText('book_pickup') }}
        </WButton>
        <WButton v-if="canRecord" :variant="method === 'manual' ? 'primary' : 'text'" @click="record">{{ t('shipping.pickup.record-instead') }}</WButton>
        <WButton v-if="canCancel && pickup?.id" variant="danger" :loading="cancelling" @click="cancel">{{ actionText('cancel_pickup') }}</WButton>
        <span class="w-flow-pickup__spacer" />
        <NuxtLink :to="pageLink" class="w-flow-pickup__link">{{ t('customs.carrier.pickup.page') }} →</NuxtLink>
      </div>
    </template>

    <ShippingFlowActionNotes v-if="!locked" :actions="step.actions" :carrier-name="carrierName" />
  </div>
</template>

<style scoped>
.w-flow-pickup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-flow-pickup__big {
  font-size: var(--w-fs-20);
  line-height: var(--w-lh-20);
  font-weight: var(--w-fw-semibold);
}
.w-flow-pickup__note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: -8px 0 0;
  color: var(--w-text-2);
}
.w-flow-pickup__plain { margin: 0; color: var(--w-text-2); }
.w-flow-pickup__status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.w-flow-pickup__contact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.w-flow-pickup__line { display: block; }
.w-flow-pickup__form { display: flex; flex-direction: column; gap: 16px; }
.w-flow-pickup__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.w-flow-pickup__spacer { flex: 1; }
.w-flow-pickup__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--w-link);
  font-weight: var(--w-fw-medium);
  text-decoration: none;
}
.w-flow-pickup__link:hover { color: var(--w-link-hover); }
</style>
