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

const { t, localeProperties } = useI18n()
const { bizErrorMessage } = useBizError()

const carrier = computed(() => props.carrierName || t('customs.carrier.carrier-fallback'))
const tracking = computed<CarrierTracking | null>(() => {
  const tr = props.step.summary?.tracking
  return tr && typeof tr === 'object' ? (tr as CarrierTracking) : null
})
const events = computed<CarrierTrackingEvent[]>(() => (Array.isArray(tracking.value?.events) ? tracking.value!.events : []))
const url = computed(() => String(props.step.summary?.tracking_url || props.trackingUrl || '').trim())
const locale = computed(() => String(localeProperties.value?.iso || '') || undefined)
const time = (value: string | null | undefined) => formatLocaleDateTime(value, locale.value)

const statusText = computed(() => {
  const tr = tracking.value
  if (!tr?.status) return ''
  const text = t(`customs.carrier.tracking.status.${tr.status}`, { carrier: carrier.value })
  return tr.status_text ? `${text}（${tr.status_text}）` : text
})
const statusClass = computed(() => {
  const s = tracking.value?.status
  if (s === 'exception' || s === 'unknown') return 'text-danger'
  if (s === 'delivered') return 'text-success'
  if (s === 'in_transit' || s === 'out_for_delivery') return 'text-primary'
  return 'text-muted'
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
  <div class="flow-transit fs-13">
    <template v-if="tracking">
      <div class="d-flex flex-wrap align-items-baseline gap-2">
        <span class="fw-semibold" :class="statusClass" v-if="statusText">{{ statusText }}</span>
        <span class="text-muted" v-if="tracking.estimated_delivery && tracking.status !== 'delivered'">
          {{ t('customs.carrier.tracking.eta', { date: tracking.estimated_delivery }) }}
        </span>
        <span class="text-muted" v-if="tracking.delivered_at">
          {{ t('customs.carrier.tracking.delivered-at', { time: time(tracking.delivered_at) }) }}
        </span>
        <span class="fs-12 text-muted" v-if="tracking.synced_at">
          · {{ t('customs.carrier.tracking.synced', { time: time(tracking.synced_at) }) }}
        </span>
      </div>
      <div class="fs-12 mt-1 text-danger" v-if="tracking.problem">
        <i class="ri-error-warning-line me-1"></i>{{ t('customs.carrier.tracking.problem', { reason: tracking.problem }) }}
      </div>
      <div class="fs-12 mt-1 text-warning" v-if="tracking.error">
        {{ t('customs.carrier.tracking.error', { reason: tracking.error }) }}
      </div>

      <div class="table-responsive mt-2" v-if="events.length">
        <table class="table table-sm align-middle mb-0 fs-12 flow-transit-events">
          <thead>
            <tr>
              <th scope="col">{{ t('shipping.transit.time') }}</th>
              <th scope="col">{{ t('shipping.transit.event') }}</th>
              <th scope="col">{{ t('shipping.transit.location') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in events" :key="`ev-${i}`" :class="{ 'fw-semibold': i === 0 }">
              <td class="text-nowrap">{{ time(e.time) || '—' }}</td>
              <td class="text-wrap">
                {{ e.description || '—' }}<code class="ms-1 fs-11" v-if="e.code">{{ e.code }}</code>
              </td>
              <td class="text-wrap">{{ e.location || '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="fs-12 text-muted mb-0 mt-1" v-else>{{ t('shipping.transit.no-events') }}</p>
    </template>
    <!-- 经 API 跟踪、还没查到第一条 -->
    <p class="text-muted mb-0" v-else-if="step.summary?.tracked_by_api">{{ waitingText || t('shipping.transit.waiting', { carrier }) }}</p>
    <p class="text-muted mb-0" v-else-if="url">{{ t('shipping.transit.link-only', { carrier }) }}</p>
    <p class="text-muted mb-0" v-else>{{ t('shipping.transit.none') }}</p>

    <div class="d-flex flex-wrap align-items-center gap-2 mt-2" v-if="canRefresh || canOpen">
      <button type="button" class="btn btn-sm btn-light" v-if="canRefresh" :disabled="refreshing" @click="refresh">
        <span v-if="refreshing" class="spinner-border spinner-border-sm me-1"></span>
        <i v-else class="ri-refresh-line me-1"></i>{{ t('shipping.actions.refresh_tracking') }}
      </button>
      <a :href="url" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary" v-if="canOpen">
        <i class="ri-external-link-line me-1"></i>{{ t('shipping.actions.open_tracking') }}
      </a>
    </div>
    <ShippingFlowActionNotes :actions="step.actions" :carrier-name="carrier" />
  </div>
</template>

<style scoped>
.flow-transit-events {
  max-width: 48rem;
}
</style>
