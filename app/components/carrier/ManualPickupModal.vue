<script lang="ts" setup>
/**
 * 记录手工约好的揽收（承运商的揽收方式 = manual：电话 / 网站约好后在 WMS 记一笔；发货流程的「揽收」一步、揽收页共用）。
 *
 * POST /warehouse/dn/carrier-pickups/manual
 *   body {warehouse_id, carrier_id, shipment_ids, pickup_date: 'YYYY-MM-DD', ready_time: 'HH:MM', close_time: 'HH:MM',
 *         confirmation_code?, remarks?} → 201 {pickup}
 * 记录直接是「已约上」（scheduled），不调承运商；取消只改本地（POST /carrier-pickups/<id>/cancel）。
 * selectable：列出 shipments 让人勾选这次带哪些（initialSelected 默认勾上）；不传时 shipments 全部带上。
 * 提交后不论成败都 emit submitted，父组件据此刷新。
 */
import { warehouseHeaders } from '~/utils/http'
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_READY_TIME,
  MANUAL_PICKUP_URL,
  formatPickupWeight,
  pickupTimeProblem,
  type CarrierPickup,
  type ManualPickupShipment,
} from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  open: boolean
  carrierId: number | null
  carrierName: string
  /** 揽收仓库（X-WAREHOUSE-ID、body.warehouse_id）；不传用页头的当前仓库 */
  warehouseId?: number | string | null
  shipments: ManualPickupShipment[]
  selectable?: boolean
  initialSelected?: number[] | null
  /** 约揽收的电话 / 网址 / 说明（承运商设置里的 pickup_contact） */
  contact?: string | null
  /** 默认的时间段（如定期集荷的时间） */
  defaultReadyTime?: string | null
  defaultCloseTime?: string | null
  /** 仓库当地的今天（揽收页接口的 today）：揽收日不能早于它；不传按本机的今天 */
  today?: string | null
}>(), {
  warehouseId: null,
  selectable: false,
  initialSelected: null,
  contact: null,
  defaultReadyTime: null,
  defaultCloseTime: null,
  today: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'recorded', pickup: CarrierPickup | null): void
  (e: 'submitted'): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()

const chosen = ref<number[]>([])
const submitting = ref(false)
const failure = ref<string | null>(null)
const form = reactive({
  pickup_date: '',
  ready_time: DEFAULT_READY_TIME,
  close_time: DEFAULT_CLOSE_TIME,
  confirmation_code: '',
  remarks: '',
})

/** 今天（YYYY-MM-DD）：揽收日默认今天；有仓库当地的今天（后端按它校验）时用它 */
const localToday = () => {
  const d = new Date()
  const browser = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return props.today && props.today > browser ? props.today : browser
}

const timeProblem = computed(() => pickupTimeProblem(null, form.ready_time, form.close_time))
const timeProblemText = computed(() => (timeProblem.value ? t(`delivery.pickup.validation.${timeProblem.value}`, { cutoff: '—', minutes: '—' }) : ''))
const contactIsUrl = computed(() => /^https?:\/\//i.test(String(props.contact || '').trim()))

watch(() => props.open, (open: boolean) => {
  if (!open) return
  chosen.value = props.initialSelected ? [...props.initialSelected] : props.shipments.map((r: ManualPickupShipment) => r.shipment_id)
  failure.value = null
  form.pickup_date = localToday()
  form.ready_time = props.defaultReadyTime || DEFAULT_READY_TIME
  form.close_time = props.defaultCloseTime || DEFAULT_CLOSE_TIME
  form.confirmation_code = ''
  form.remarks = ''
}, { immediate: true })

const close = () => {
  if (!submitting.value) emit('update:open', false)
}

const submit = async () => {
  if (submitting.value || timeProblem.value || !form.pickup_date || !chosen.value.length || !props.carrierId) return
  submitting.value = true
  failure.value = null
  await httpRequest<{ pickup: CarrierPickup }>(MANUAL_PICKUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) },
    body: {
      warehouse_id: props.warehouseId === null || props.warehouseId === '' ? null : Number(props.warehouseId),
      carrier_id: props.carrierId,
      shipment_ids: chosen.value,
      pickup_date: form.pickup_date,
      ready_time: form.ready_time,
      close_time: form.close_time,
      confirmation_code: form.confirmation_code.trim() || null,
      remarks: form.remarks.trim() || null,
    },
    onSuccess: (data: { pickup: CarrierPickup }) => {
      showToast(t('shipping.pickup.recorded-toast'), 'success')
      emit('recorded', data?.pickup ?? null)
      emit('update:open', false)
    },
    onError: (error) => {
      failure.value = bizErrorMessage(error)
    },
    onFinally: () => {
      submitting.value = false
    },
  })
  emit('submitted')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal fade" :class="{ show: open }" :style="{ display: open ? 'block' : 'none' }" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('shipping.pickup.record-title') }} · {{ carrierName }}</h6>
            <button type="button" class="btn-close" :disabled="submitting" @click="close"></button>
          </div>
          <div class="modal-body">
            <p class="fs-13 text-muted mb-2">{{ t('shipping.pickup.record-intro', { carrier: carrierName }) }}</p>
            <div class="alert alert-secondary-transparent fs-13 py-2" v-if="contact">
              <i class="ri-phone-line me-1"></i>{{ t('shipping.pickup.contact') }}
              <a :href="contact" target="_blank" rel="noopener" v-if="contactIsUrl">{{ contact }}</a>
              <span class="text-break" v-else>{{ contact }}</span>
            </div>

            <div class="mb-3" v-if="selectable">
              <div class="form-label">{{ t('delivery.pickup.modal.shipments') }}</div>
              <div class="manual-pickup-shipments">
                <label class="form-check d-flex align-items-center gap-2 mb-1" v-for="row in shipments" :key="row.shipment_id">
                  <input class="form-check-input mt-0" type="checkbox" :value="row.shipment_id" v-model="chosen">
                  <span class="font-monospace">{{ row.tracking_number || '—' }}</span>
                  <span class="fs-12 text-muted" v-if="row.dn_id || row.order_number">
                    {{ row.order_number || `DN-${row.dn_id}` }}
                    <template v-if="row.package_count !== null && row.package_count !== undefined">
                      · {{ t('delivery.pickup.fields.packages-value', { count: row.package_count, weight: formatPickupWeight(row.weight_kg) }) }}
                    </template>
                  </span>
                </label>
              </div>
            </div>
            <div class="fs-13 mb-3" v-else-if="shipments.length">
              {{ t('delivery.pickup.fields.tracking-number') }}:
              <span class="font-monospace">{{ shipments.map((r) => r.tracking_number || '—').join(', ') }}</span>
            </div>

            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label" for="manual-pickup-date">{{ t('delivery.pickup.modal.date') }} <abbr title="required" class="text-danger">*</abbr></label>
                <input type="date" class="form-control" id="manual-pickup-date" :min="today || undefined" v-model="form.pickup_date">
              </div>
              <div class="col-md-4">
                <label class="form-label" for="manual-pickup-ready">{{ t('delivery.pickup.modal.ready-time') }} <abbr title="required" class="text-danger">*</abbr></label>
                <input type="time" class="form-control" id="manual-pickup-ready" v-model="form.ready_time">
              </div>
              <div class="col-md-4">
                <label class="form-label" for="manual-pickup-close">{{ t('delivery.pickup.modal.close-time') }} <abbr title="required" class="text-danger">*</abbr></label>
                <input type="time" class="form-control" id="manual-pickup-close" v-model="form.close_time">
              </div>
            </div>
            <div class="invalid-feedback d-block" v-if="timeProblemText">{{ timeProblemText }}</div>

            <div class="row g-3 mt-1">
              <div class="col-md-5">
                <label class="form-label" for="manual-pickup-code">{{ t('shipping.pickup.confirmation-code') }}</label>
                <input type="text" class="form-control font-monospace" id="manual-pickup-code" v-model="form.confirmation_code" maxlength="50">
                <div class="form-text">{{ t('shipping.pickup.confirmation-code-hint') }}</div>
              </div>
              <div class="col-md-7">
                <label class="form-label" for="manual-pickup-remarks">{{ t('shipping.pickup.remarks') }}</label>
                <input type="text" class="form-control" id="manual-pickup-remarks" v-model="form.remarks" maxlength="200">
              </div>
            </div>

            <div class="alert alert-danger-transparent fs-13 mt-3 mb-0" v-if="failure">{{ failure }}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" :disabled="submitting" @click="close">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" @click="submit"
              :disabled="submitting || !!timeProblem || !form.pickup_date || !chosen.length || !carrierId">
              <span v-if="submitting" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('shipping.pickup.record-submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="open" @click="close"></div>
  </Teleport>
</template>

<style scoped>
.manual-pickup-shipments {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
