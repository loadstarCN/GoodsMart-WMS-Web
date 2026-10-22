<script lang="ts" setup>
/**
 * 预约上门揽收的弹窗（揽收页、配送任务的「预约揽收」一步共用）。
 *
 * 打开时先向承运商查可约日期与可选时间（下拉），默认用承运商给的默认时间；没查到就让人自己填，承运商会再核对。
 * selectable：列出 shipments 让人勾选这次带哪些（配送页：本单默认勾上，同仓库其它等揽收的运单可以一起带）；
 * 不传时 shipments 全部带上（揽收页：表格里已经选好了）。
 * 提交后不论成败都 emit submitted（预约记录可能落成 failed / unknown，运单可能被别人约了），父组件据此刷新。
 */
import { warehouseHeaders } from '~/utils/http'
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_READY_TIME,
  PICKUPS_URL,
  PICKUP_EMAIL_STORAGE_KEY,
  describePickupFailure,
  formatPickupAddress,
  formatPickupWeight,
  pickupTimeProblem,
  type CarrierPickup,
  type PickupAvailability,
  type PickupFailure,
  type PickupLocation,
  type PickupOption,
  type PickupShipmentRow,
} from '~/composables/customs/carrierPickup'

const props = withDefaults(defineProps<{
  open: boolean
  carrierId: number | null
  /** 文案里的承运商名（FedEx） */
  carrierName: string
  /** 揽收仓库（X-WAREHOUSE-ID）；不传用页头的当前仓库 */
  warehouseId?: number | string | null
  shipments: PickupShipmentRow[]
  /** 列出运单让人勾选；initialSelected 是默认勾上的（不传 = 全部） */
  selectable?: boolean
  initialSelected?: number[] | null
  location?: PickupLocation | null
  maxRemarks?: number | null
  /** 仓库当地今天（YYYY-MM-DD） */
  today?: string | null
  /** 弹窗顶部的补充说明（如「今天已经约过一次」） */
  note?: string | null
}>(), {
  warehouseId: null,
  selectable: false,
  initialSelected: null,
  location: null,
  maxRemarks: null,
  today: null,
  note: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'booked', pickup: CarrierPickup): void
  (e: 'submitted'): void
}>()

const { t } = useI18n()
const { bizErrorMessage } = useBizError()

const headers = computed(() => ({ 'Content-Type': 'application/json', ...warehouseHeaders(props.warehouseId) }))
const carrierQuery = () => (props.carrierId ? `?carrier_id=${props.carrierId}` : '')

const chosen = ref<number[]>([])
const chosenRows = computed(() => props.shipments.filter((r: PickupShipmentRow) => chosen.value.includes(r.shipment_id)))
const chosenPackages = computed(() => chosenRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.package_count) || 0), 0))
const chosenWeight = computed(() =>
  formatPickupWeight(chosenRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.weight_kg) || 0), 0)))

const availability = ref<PickupAvailability | null>(null)
const availabilityLoading = ref(false)
const availabilityError = ref<string | null>(null)
const submitting = ref(false)
const failure = ref<PickupFailure | null>(null)
const form = reactive({
  pickup_date: '',
  ready_time: DEFAULT_READY_TIME,
  close_time: DEFAULT_CLOSE_TIME,
  remarks: '',
  notification_email: '',
})

const availableOptions = computed(() => (availability.value?.options || []).filter((o: PickupOption) => o.available))
const currentOption = computed(() => availableOptions.value.find((o: PickupOption) => o.pickup_date === form.pickup_date) || null)
const readyChoices = computed(() => currentOption.value?.ready_times || [])
const closeChoices = computed(() => currentOption.value?.latest_times || [])
const timeProblem = computed(() => pickupTimeProblem(currentOption.value, form.ready_time, form.close_time))
const timeProblemText = computed(() => {
  if (!timeProblem.value) return ''
  return t(`delivery.pickup.validation.${timeProblem.value}`, {
    cutoff: currentOption.value?.cutoff_time || '—',
    minutes: currentOption.value?.access_minutes ?? '—',
  })
})
const remarksMax = computed(() => props.maxRemarks || 60)

const pick = (choices: string[], preferred: string | null | undefined, fallback: string): string => {
  if (!choices.length) return preferred || fallback
  if (preferred && choices.includes(preferred)) return preferred
  return choices.includes(fallback) ? fallback : (choices[0] as string)
}

const applyOption = () => {
  const option = currentOption.value
  if (!option) return
  form.ready_time = pick(option.ready_times, option.default_ready_time, DEFAULT_READY_TIME)
  form.close_time = pick(option.latest_times, option.default_latest_time, DEFAULT_CLOSE_TIME)
}
watch(() => form.pickup_date, applyOption)

const dateLabel = (value: string): string => {
  const today = availability.value?.today || props.today
  return value === today ? `${value}（${t('delivery.pickup.modal.today')}）` : value
}

const loadEmail = (): string => {
  try {
    return localStorage.getItem(PICKUP_EMAIL_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
const saveEmail = (value: string) => {
  try {
    if (value) localStorage.setItem(PICKUP_EMAIL_STORAGE_KEY, value)
  } catch {
    // 存不了就算了
  }
}

const loadAvailability = async () => {
  availabilityLoading.value = true
  await httpRequest<PickupAvailability>(`${PICKUPS_URL}/availability${carrierQuery()}`, {
    headers: headers.value,
    onSuccess: (data: PickupAvailability) => {
      availability.value = data
      const first = (data.options || []).find((o: PickupOption) => o.available)
      if (first) {
        form.pickup_date = first.pickup_date
        applyOption()
      }
    },
    onError: (error) => {
      availabilityError.value = describePickupFailure(error, props.carrierName, t, bizErrorMessage).summary
    },
    onFinally: () => {
      availabilityLoading.value = false
    },
  })
}

// 每次打开都从头来：默认勾选、表单、可约时间
watch(() => props.open, (open: boolean) => {
  if (!open) return
  chosen.value = props.initialSelected ? [...props.initialSelected] : props.shipments.map((r: PickupShipmentRow) => r.shipment_id)
  failure.value = null
  availability.value = null
  availabilityError.value = null
  form.pickup_date = props.today || ''
  form.ready_time = DEFAULT_READY_TIME
  form.close_time = DEFAULT_CLOSE_TIME
  form.remarks = ''
  form.notification_email = loadEmail()
  loadAvailability()
}, { immediate: true })

const close = () => {
  if (!submitting.value) emit('update:open', false)
}

const submit = async () => {
  if (submitting.value || timeProblem.value || !form.pickup_date || !chosen.value.length) return
  const confirmed = await showConfirm(
    t('delivery.pickup.confirm-title'),
    t('delivery.pickup.confirm', {
      date: form.pickup_date,
      window: `${form.ready_time}–${form.close_time}`,
      count: chosen.value.length,
      packages: chosenPackages.value,
      weight: chosenWeight.value,
    }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return
  submitting.value = true
  failure.value = null
  const email = form.notification_email.trim()
  await httpRequest<{ pickup: CarrierPickup }>(PICKUPS_URL, {
    method: 'POST',
    headers: headers.value,
    body: {
      carrier_id: props.carrierId,
      shipment_ids: chosen.value,
      pickup_date: form.pickup_date,
      ready_time: form.ready_time,
      close_time: form.close_time,
      remarks: form.remarks.trim() || null,
      notification_email: email || null,
    },
    onSuccess: (data: { pickup: CarrierPickup }) => {
      saveEmail(email)
      showToast(t('delivery.pickup.scheduled-toast', { code: data?.pickup?.confirmation_code || '—' }), 'success')
      emit('booked', data?.pickup)
      emit('update:open', false)
    },
    onError: (error) => {
      failure.value = describePickupFailure(error, props.carrierName, t, bizErrorMessage)
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
            <h6 class="modal-title">{{ t('delivery.pickup.modal.title') }} · {{ carrierName }}</h6>
            <button type="button" class="btn-close" :disabled="submitting" @click="close"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-secondary-transparent fs-13 py-2" v-if="note">{{ note }}</div>

            <!-- 这次带哪些运单（配送页可以把同仓库其它等揽收的一起带上） -->
            <div class="mb-3" v-if="selectable">
              <div class="form-label">{{ t('delivery.pickup.modal.shipments') }}</div>
              <div class="pickup-modal-shipments">
                <label class="form-check d-flex align-items-center gap-2 mb-1" v-for="(row, i) in shipments" :key="row.shipment_id">
                  <input class="form-check-input mt-0" type="checkbox" :value="row.shipment_id" v-model="chosen">
                  <span class="font-monospace">{{ row.tracking_number || '—' }}</span>
                  <span class="fs-12 text-muted">
                    {{ row.order_number || `DN-${row.dn_id}` }} ·
                    {{ t('delivery.pickup.fields.packages-value', { count: row.package_count, weight: formatPickupWeight(row.weight_kg) }) }}
                  </span>
                  <span class="badge bg-primary-transparent" v-if="i === 0 && initialSelected?.includes(row.shipment_id)">
                    {{ t('delivery.pickup.modal.this-one') }}
                  </span>
                </label>
              </div>
            </div>

            <div class="alert alert-primary-transparent fs-13 py-2">
              {{ t('delivery.pickup.modal.summary', { count: chosen.length, packages: chosenPackages, weight: chosenWeight }) }}
              <div class="fs-12 text-muted mt-1">{{ formatPickupAddress(location) }}</div>
            </div>

            <div class="fs-12 text-muted mb-2" v-if="availabilityLoading">
              <span class="spinner-border spinner-border-sm me-1"></span>{{ t('delivery.pickup.modal.loading-availability', { carrier: carrierName }) }}
            </div>
            <div class="alert alert-warning-transparent fs-12 py-2" v-else-if="availabilityError">
              {{ t('delivery.pickup.modal.availability-failed', { message: availabilityError, carrier: carrierName }) }}
            </div>
            <div class="alert alert-warning-transparent fs-12 py-2" v-else-if="availability && !availableOptions.length">
              {{ t('delivery.pickup.modal.no-options', { carrier: carrierName }) }}
            </div>

            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label">{{ t('delivery.pickup.modal.date') }} <abbr title="required" class="text-danger">*</abbr></label>
                <select class="form-select" v-model="form.pickup_date" v-if="availableOptions.length">
                  <option v-for="o in availableOptions" :key="o.pickup_date" :value="o.pickup_date">{{ dateLabel(o.pickup_date) }}</option>
                </select>
                <input type="date" class="form-control" v-model="form.pickup_date" :min="today || undefined" v-else>
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('delivery.pickup.modal.ready-time') }} <abbr title="required" class="text-danger">*</abbr></label>
                <select class="form-select" v-model="form.ready_time" v-if="readyChoices.length">
                  <option v-for="v in readyChoices" :key="v" :value="v">{{ v }}</option>
                </select>
                <input type="time" class="form-control" v-model="form.ready_time" v-else>
              </div>
              <div class="col-md-4">
                <label class="form-label">{{ t('delivery.pickup.modal.close-time') }} <abbr title="required" class="text-danger">*</abbr></label>
                <select class="form-select" v-model="form.close_time" v-if="closeChoices.length">
                  <option v-for="v in closeChoices" :key="v" :value="v">{{ v }}</option>
                </select>
                <input type="time" class="form-control" v-model="form.close_time" v-else>
              </div>
            </div>
            <div class="fs-12 text-muted mt-2" v-if="currentOption?.cutoff_time || currentOption?.access_minutes">
              {{ t('delivery.pickup.modal.limits', { cutoff: currentOption?.cutoff_time || '—', minutes: currentOption?.access_minutes ?? '—' }) }}
            </div>
            <div class="invalid-feedback d-block" v-if="timeProblemText">{{ timeProblemText }}</div>

            <div class="row g-3 mt-1">
              <div class="col-md-7">
                <label class="form-label">{{ t('delivery.pickup.modal.remarks') }}</label>
                <input type="text" class="form-control" v-model="form.remarks" :maxlength="remarksMax"
                  :placeholder="t('delivery.pickup.modal.remarks-placeholder')">
                <div class="form-text">{{ t('delivery.pickup.modal.remarks-hint', { max: remarksMax }) }}</div>
              </div>
              <div class="col-md-5">
                <label class="form-label">{{ t('delivery.pickup.modal.email') }}</label>
                <input type="email" class="form-control" v-model="form.notification_email" maxlength="80" autocomplete="email">
                <div class="form-text">{{ t('delivery.pickup.modal.email-hint', { carrier: carrierName }) }}</div>
              </div>
            </div>
            <div class="fs-12 text-muted mt-3">{{ t('delivery.pickup.modal.no-change') }}</div>

            <div class="alert alert-danger-transparent fs-13 mt-3 mb-0" v-if="failure">
              <div>{{ failure.summary }}</div>
              <ul class="mb-0 ps-3 mt-1" v-if="failure.errors.length">
                <li v-for="(e, i) in failure.errors" :key="`me-${i}`" class="text-break">
                  <code class="me-1" v-if="e.code">{{ e.code }}</code>{{ e.message }}
                </li>
              </ul>
              <div class="fs-12 mt-1" v-if="failure.transactionId">
                {{ t('delivery.pickup.tips.transaction-id', { carrier: carrierName }) }}: <span class="font-monospace">{{ failure.transactionId }}</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" :disabled="submitting" @click="close">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" @click="submit"
              :disabled="submitting || availabilityLoading || !!timeProblem || !form.pickup_date || !chosen.length">
              <span v-if="submitting" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('delivery.pickup.modal.submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="open" @click="close"></div>
  </Teleport>
</template>

<style scoped>
.pickup-modal-shipments {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
