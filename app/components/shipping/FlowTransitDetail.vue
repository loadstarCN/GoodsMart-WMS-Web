<script lang="ts" setup>
/**
 * 流程 ·「运输中 / 在途」一步的内容：承运商跟踪的状态、预计送达、扫描记录（新的在前），
 * 立即刷新跟踪（refresh_tracking）、打开承运商的公开查询页（open_tracking）。跟踪方式为 link（只有查询页）时只给查询页链接。
 * 发货流程：刷新 POST /dn/<id>/carrier-shipment/track（揽收 / 送达了会当场自动完成发货 / 签收）；
 * 入库流程传 refreshUrl（POST /asn/<id>/track，只存跟踪结果）。做了操作 emit changed。
 */
import { carrierShipmentUrl, type CarrierTracking, type CarrierTrackingEvent } from '~/composables/customs/carrierShipment'
import { flowActionEnabled, type FlowStepBase } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  /** 发货流程的出库单（refreshUrl 没给时按它拼刷新接口） */
  dnId?: number | string | null
  step: FlowStepBase
  carrierName?: string | null
  /** 承运商的公开查询页（流程的 carrier.tracking_url），这一步没给时用它 */
  trackingUrl?: string | null
  /** 刷新跟踪的接口（入库流程用）；默认出库单运单的 /track */
  refreshUrl?: string | null
  /** 经 API 跟踪、还没查到第一条时的说明；默认发货流程的（定时查询） */
  waitingText?: string | null
}>(), {
  dnId: null,
  carrierName: null,
  trackingUrl: null,
  refreshUrl: null,
  waitingText: null,
})

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()
/** 扫描时刻按流程提供的时区（DN / ASN 所属仓库）显示 */
const { formatLocale } = useTimeZone()

const carrier = computed(() => props.carrierName || t('customs.carrier.carrier-fallback'))
const tracking = computed<CarrierTracking | null>(() => {
  const tr = props.step.summary?.tracking
  return tr && typeof tr === 'object' ? (tr as CarrierTracking) : null
})
const events = computed<CarrierTrackingEvent[]>(() => (Array.isArray(tracking.value?.events) ? tracking.value!.events : []))
const url = computed(() => String(props.step.summary?.tracking_url || props.trackingUrl || '').trim())
const time = (value: string | null | undefined) => formatLocale(value)

const statusText = computed(() => {
  const tr = tracking.value
  if (!tr?.status) return ''
  const text = t(`customs.carrier.tracking.status.${tr.status}`, { carrier: carrier.value })
  return tr.status_text ? `${text}（${tr.status_text}）` : text
})
/** 跟踪状态的语义：异常 / 查不到 → 异常红；送达 → 完成绿；在途 → 进行中紫 */
const statusTone = computed<'bad' | 'ok' | 'info' | 'none'>(() => {
  const s = tracking.value?.status
  if (s === 'exception' || s === 'unknown') return 'bad'
  if (s === 'delivered') return 'ok'
  if (s === 'in_transit' || s === 'out_for_delivery') return 'info'
  return 'none'
})

const canRefresh = computed(() => flowActionEnabled(props.step, 'refresh_tracking',
  !!tracking.value || !!props.step.summary?.tracked_by_api))
const canOpen = computed(() => !!url.value && flowActionEnabled(props.step, 'open_tracking', true))

const refreshing = ref(false)
const refresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  const endpoint = props.refreshUrl || (props.dnId !== null && props.dnId !== undefined
    ? `${carrierShipmentUrl(props.dnId)}/track` : '')
  if (!endpoint) {
    refreshing.value = false
    return
  }
  await httpRequest<any>(endpoint, {
    method: 'POST',
    onSuccess: (data) => {
      const sync = data?.tracking_sync || {}
      if (sync.error) {
        // 入库流程：这次没查到（保留上次结果），原因在跟踪的 error 里
        showToast(t('customs.carrier.tracking.error', { reason: String(sync.error) }), 'warning')
      } else if (sync.shipped || sync.signed) {
        showToast(t(sync.signed ? 'customs.carrier.tracking.auto-signed' : 'customs.carrier.tracking.auto-shipped',
          { carrier: carrier.value }), 'success')
      } else {
        showToast(t('shipping.transit.refreshed'), 'success')
      }
    },
    onError: (error) => showToast(bizErrorMessage(error), 'warning'),
    onFinally: () => {
      refreshing.value = false
    },
  })
  // 刷新可能当场完成发货 / 签收：总是让流程整体重读
  emit('changed')
}

const open = () => {
  if (!url.value) return
  window.open(url.value, '_blank', 'noopener')
}

const run = (key: string) => {
  if (key === 'refresh_tracking') refresh()
  else if (key === 'open_tracking') open()
}

defineExpose({ run })
</script>

<template>
  <div class="w-flow-transit">
    <template v-if="tracking">
      <div class="w-flow-transit__status">
        <WStatus v-if="statusText" :tone="statusTone" :variant="statusTone === 'bad' ? 'text' : 'dot'">{{ statusText }}</WStatus>
        <span v-if="tracking.estimated_delivery && tracking.status !== 'delivered'">
          {{ t('customs.carrier.tracking.eta', { date: tracking.estimated_delivery }) }}
        </span>
        <span v-if="tracking.delivered_at">{{ t('customs.carrier.tracking.delivered-at', { time: time(tracking.delivered_at) }) }}</span>
        <span v-if="tracking.synced_at" class="w-faint">{{ t('customs.carrier.tracking.synced', { time: time(tracking.synced_at) }) }}</span>
      </div>
      <WAlert v-if="tracking.problem" tone="warn" :title="t('shipping.states.warning')">
        {{ t('customs.carrier.tracking.problem', { reason: tracking.problem }) }}
      </WAlert>
      <WAlert v-if="tracking.error" tone="warn" :title="t('shipping.states.warning')">
        {{ t('customs.carrier.tracking.error', { reason: tracking.error }) }}
      </WAlert>

      <!-- 扫描记录：新的在前，第一条加粗、实心紫点 -->
      <ol v-if="events.length" class="w-flow-transit__events" :aria-label="t('shipping.transit.event')">
        <li v-for="(e, i) in events" :key="`ev-${i}`" class="w-flow-transit__event" :class="{ 'is-latest': i === 0 }">
          <span class="w-flow-transit__time">{{ time(e.time) }}</span>
          <span class="w-flow-transit__rail" aria-hidden="true"><span class="w-flow-transit__dot" /></span>
          <span class="w-flow-transit__text">
            <span class="w-flow-transit__desc">{{ e.description || e.code || '' }}<span v-if="e.code && e.description" class="w-flow-transit__code"> {{ e.code }}</span></span>
            <span v-if="e.location" class="w-flow-transit__place">{{ e.location }}</span>
          </span>
        </li>
      </ol>
      <p v-else class="w-flow-transit__note">{{ t('shipping.transit.no-events') }}</p>
    </template>
    <!-- 经 API 跟踪、还没查到第一条 -->
    <p v-else-if="step.summary?.tracked_by_api" class="w-flow-transit__note">{{ waitingText || t('shipping.transit.waiting', { carrier }) }}</p>
    <p v-else-if="url" class="w-flow-transit__note">{{ t('shipping.transit.link-only', { carrier }) }}</p>
    <p v-else class="w-flow-transit__note">{{ t('shipping.transit.none') }}</p>

    <div v-if="canRefresh || canOpen || $slots.actions" class="w-flow-transit__actions">
      <WButton v-if="canRefresh" icon="refresh" :loading="refreshing" @click="refresh">{{ t('shipping.actions.refresh_tracking') }}</WButton>
      <a v-if="canOpen" :href="url" target="_blank" rel="noopener" class="w-flow-transit__link">
        {{ t('shipping.transit.carrier-page', { carrier }) }}<WIcon name="external" :size="13" />
      </a>
      <span class="w-flow-transit__spacer" />
      <slot name="actions" />
    </div>
    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier" />
  </div>
</template>

<style scoped>
.w-flow-transit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.w-flow-transit__status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  color: var(--w-text-2);
}
.w-flow-transit__events {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.w-flow-transit__event {
  display: grid;
  grid-template-columns: minmax(96px, max-content) 16px minmax(0, 1fr);
  gap: 0 12px;
  position: relative;
  padding-bottom: 14px;
}
.w-flow-transit__event:last-child { padding-bottom: 0; }
/* 点与点之间的竖线：画在点所在的格子里，伸到下一条 */
.w-flow-transit__rail { position: relative; align-self: stretch; }
.w-flow-transit__event:not(:last-child) .w-flow-transit__rail::after {
  content: '';
  position: absolute;
  top: 16px;
  bottom: -12px;
  left: 50%;
  width: 1px;
  background: var(--w-line);
}
.w-flow-transit__time { color: var(--w-text-3); font-size: var(--w-fs-12); white-space: nowrap; padding-top: 1px; }
.w-flow-transit__dot {
  display: block;
  width: 9px;
  height: 9px;
  margin: 5px auto 0;
  border: 1.5px solid var(--w-border-strong);
  border-radius: var(--w-radius-pill);
  background: var(--w-surface);
}
.w-flow-transit__event.is-latest .w-flow-transit__dot { border-color: var(--w-sel); background: var(--w-sel); }
.w-flow-transit__text { display: flex; flex-direction: column; min-width: 0; }
.w-flow-transit__desc { overflow-wrap: anywhere; }
.w-flow-transit__event.is-latest .w-flow-transit__desc { font-weight: var(--w-fw-semibold); }
.w-flow-transit__code { color: var(--w-text-3); font-weight: var(--w-fw-regular); font-size: var(--w-fs-12); }
.w-flow-transit__place { color: var(--w-text-3); font-size: var(--w-fs-12); line-height: var(--w-lh-12); }
.w-flow-transit__note { margin: 0; color: var(--w-text-2); }
.w-flow-transit__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.w-flow-transit__spacer { flex: 1; }
.w-flow-transit__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--w-link);
  font-weight: var(--w-fw-medium);
  text-decoration: none;
}
.w-flow-transit__link:hover { color: var(--w-link-hover); }
</style>
