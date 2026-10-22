<script lang="ts" setup>
/**
 * 上门揽收预约（当前仓库）
 *
 * 承运商的在线对接支持预约揽收时（如 FedEx，没有定期集荷），运单建好后要在这里约快递员上门。揽收按「仓库 + 承运商 + 日期」约，
 * 一次带多张该承运商的运单，件数 / 总重量按所选运单的箱子合计。有多个能约揽收的承运商时在页头切换（?carrier_id=）。
 * - 待揽收运单：该承运商的自动运单（有效、出库单未发货）。已被预约占着的（预约中 / 已约上且揽收日没过 / 结果不明）不能勾选；
 *   揽收日过了还没发货的可以重新预约（快递员没来 / 忘了完成发货）
 * - 预约：先向承运商查可约日期与可选时间（下拉），默认承运商给的默认时间；约好后不能改，只能取消重约
 * - 预约结果不明（承运商超时等）：运单仍被占着，向承运商核对后「确认作废」才能重新预约
 * - 取消：已约上、揽收日没过；取消结果不明时可重试
 */
import type { HttpRequestError } from '~/utils/http'
import { extractCarrierErrors, formatServiceType, type CarrierApiErrorItem } from '~/composables/customs/carrierShipment'
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_READY_TIME,
  PICKUPS_URL,
  formatPickupAddress,
  pickupDisplayStatus,
  pickupStatusColor,
  pickupTimeProblem,
  pickupUrl,
  type CarrierPickup,
  type PickupAvailability,
  type PickupOption,
  type PickupOverview,
  type PickupShipmentRow,
} from '~/composables/customs/carrierPickup'

definePageMeta({})

const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()
const warehouseStore = useWarehouseStore()
const route = useRoute()
const router = useRouter()

const dataToPass = computed(() => ({
  current: t('delivery.pickup.title'),
  list: [t('nav.warehouse'), t('nav.delivery'), t('delivery.pickup.title')],
}))

const EMAIL_STORAGE_KEY = 'wms.carrierPickup.notificationEmail'

const hasWarehouse = computed(() => !!warehouseStore.currentWarehouse)
const loading = ref(true)
const loadError = ref<string | null>(null)
const overview = ref<PickupOverview | null>(null)
const selected = ref<number[]>([])

/** 当前承运商：地址栏 ?carrier_id=，没有用后端给的默认（第一个能约揽收的承运商） */
const queryCarrierId = (): number | null => {
  const n = Number(route.query.carrier_id)
  return Number.isInteger(n) && n > 0 ? n : null
}
const carrierId = ref<number | null>(queryCarrierId())
const carrierQuery = () => (carrierId.value ? `?carrier_id=${carrierId.value}` : '')
/** 文案里的承运商名：对接插件名（FedEx），没有用承运商名 */
const carrierName = computed(() => overview.value?.integration?.name || overview.value?.carrier?.name || t('delivery.pickup.carrier'))
const carrierOptions = computed(() => overview.value?.carriers || [])

interface Failure {
  summary: string
  errors: CarrierApiErrorItem[]
  transactionId: string | null
}
/** 列表上的操作（取消 / 作废）失败时的详情 */
const listFailure = ref<Failure | null>(null)

const fetchOverview = async () => {
  if (!hasWarehouse.value) {
    overview.value = null
    loading.value = false
    return
  }
  loading.value = true
  await httpRequest<PickupOverview>(`${PICKUPS_URL}${carrierQuery()}`, {
    onSuccess: (data: PickupOverview) => {
      overview.value = data
      loadError.value = null
      carrierId.value = data.carrier?.id ?? null
      const selectable = new Set(data.shipments.filter((r) => r.can_schedule).map((r) => r.shipment_id))
      selected.value = selected.value.filter((id: number) => selectable.has(id))
    },
    onError: (error) => {
      // 地址栏里的承运商不对（已删除 / 不是本公司的）：退回默认承运商
      if (error.code === 16131 && carrierId.value) {
        carrierId.value = null
        router.replace({ query: { ...route.query, carrier_id: undefined } })
        fetchOverview()
        return
      }
      loadError.value = bizErrorMessage(error)
    },
    onFinally: () => {
      loading.value = false
    },
  })
}

const switchCarrier = (id: number) => {
  if (id === carrierId.value) return
  carrierId.value = id
  selected.value = []
  listFailure.value = null
  router.replace({ query: { ...route.query, carrier_id: String(id) } })
  fetchOverview()
}

watch(() => warehouseStore.currentWarehouse?.id, () => {
  selected.value = []
  listFailure.value = null
  fetchOverview()
})
onMounted(fetchOverview)

// ------------------ 待揽收运单 ----------------------
const shipments = computed(() => overview.value?.shipments || [])
const schedulable = computed(() => shipments.value.filter((r: PickupShipmentRow) => r.can_schedule))
const allSelected = computed(() => schedulable.value.length > 0 && schedulable.value.every((r: PickupShipmentRow) => selected.value.includes(r.shipment_id)))
const toggleAll = () => {
  selected.value = allSelected.value ? [] : schedulable.value.map((r: PickupShipmentRow) => r.shipment_id)
}
const selectedRows = computed(() => shipments.value.filter((r: PickupShipmentRow) => selected.value.includes(r.shipment_id)))
const selectedPackages = computed(() => selectedRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.package_count) || 0), 0))
const selectedWeight = computed(() => formatWeight(selectedRows.value.reduce((sum: number, r: PickupShipmentRow) => sum + (Number(r.weight_kg) || 0), 0)))
const canSchedule = computed(() => !!overview.value?.enabled && !overview.value.blockers.length && selected.value.length > 0)

const formatWeight = (value: number | string | null | undefined): string => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '—'
}

const timeWindow = (p: { ready_time?: string | null; close_time?: string | null }) =>
  `${p.ready_time || '—'}–${p.close_time || '—'}`

/** 运单行的揽收状态文字 */
const rowPickupText = (row: PickupShipmentRow): string => {
  const p = row.pickup
  if (!p) return t('delivery.pickup.row-status.none')
  if (p.status === 'scheduled' && !p.past) {
    return t('delivery.pickup.row-status.scheduled', { date: p.pickup_date, window: timeWindow(p), code: p.confirmation_code || '—' })
  }
  if (p.status === 'scheduled' && p.past) return t('delivery.pickup.row-status.past', { date: p.pickup_date })
  if (p.status === 'unknown' || p.status === 'pending') return t(`delivery.pickup.row-status.${p.status}`)
  return t('delivery.pickup.row-status.none')
}
const rowPickupColor = (row: PickupShipmentRow): string =>
  row.pickup?.status === 'scheduled' && !row.pickup.past ? 'text-success' : 'text-warning'

const blockerText = (b: { code: string; message?: string | null }) =>
  te(`delivery.pickup.blockers.${b.code}`) ? t(`delivery.pickup.blockers.${b.code}`) : b.message || b.code

// ------------------ 失败详情 ----------------------
const describeFailure = (error: HttpRequestError): Failure => {
  const { errors, transactionId, permissionDenied } = extractCarrierErrors(error.details)
  let summary = bizErrorMessage(error)
  const pickup = error.details?.pickup
  const carrier = { carrier: carrierName.value }
  if (permissionDenied) summary = t('delivery.pickup.tips.permission-denied', carrier)
  else if (pickup && typeof pickup === 'object') {
    if (pickup.status === 'unknown') summary = `${summary} ${t('delivery.pickup.tips.unknown', carrier)}`
    else if (pickup.status === 'failed') summary = `${summary} ${t('delivery.pickup.tips.failed')}`
    else if (pickup.reason === 'cancel_unclear') summary = `${summary} ${t('delivery.pickup.tips.cancel-unclear', carrier)}`
  }
  return { summary, errors: error.code === 16073 || error.code === 16074 ? errors : [], transactionId }
}

// ------------------ 预约弹窗 ----------------------
const showModal = ref(false)
const availability = ref<PickupAvailability | null>(null)
const availabilityLoading = ref(false)
const availabilityError = ref<string | null>(null)
const submitting = ref(false)
const modalFailure = ref<Failure | null>(null)
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
const remarksMax = computed(() => overview.value?.max_remarks || 60)

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
  const today = availability.value?.today || overview.value?.today
  return value === today ? `${value}（${t('delivery.pickup.modal.today')}）` : value
}

const loadEmail = (): string => {
  try {
    return localStorage.getItem(EMAIL_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
const saveEmail = (value: string) => {
  try {
    if (value) localStorage.setItem(EMAIL_STORAGE_KEY, value)
  } catch {
    // 存不了就算了
  }
}

const openModal = async () => {
  if (!canSchedule.value) return
  modalFailure.value = null
  availability.value = null
  availabilityError.value = null
  form.pickup_date = overview.value?.today || ''
  form.ready_time = DEFAULT_READY_TIME
  form.close_time = DEFAULT_CLOSE_TIME
  form.remarks = ''
  form.notification_email = loadEmail()
  showModal.value = true
  availabilityLoading.value = true
  await httpRequest<PickupAvailability>(`${PICKUPS_URL}/availability${carrierQuery()}`, {
    onSuccess: (data: PickupAvailability) => {
      availability.value = data
      const first = (data.options || []).find((o) => o.available)
      if (first) {
        form.pickup_date = first.pickup_date
        applyOption()
      }
    },
    onError: (error) => {
      availabilityError.value = describeFailure(error).summary
    },
    onFinally: () => {
      availabilityLoading.value = false
    },
  })
}

const closeModal = () => {
  if (!submitting.value) showModal.value = false
}

const submit = async () => {
  if (submitting.value || timeProblem.value || !form.pickup_date) return
  const confirmed = await showConfirm(
    t('delivery.pickup.confirm-title'),
    t('delivery.pickup.confirm', {
      date: form.pickup_date,
      window: `${form.ready_time}–${form.close_time}`,
      count: selected.value.length,
      packages: selectedPackages.value,
      weight: selectedWeight.value,
    }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return
  submitting.value = true
  modalFailure.value = null
  const email = form.notification_email.trim()
  await httpRequest<{ pickup: CarrierPickup }>(PICKUPS_URL, {
    method: 'POST',
    body: {
      carrier_id: carrierId.value,
      shipment_ids: selected.value,
      pickup_date: form.pickup_date,
      ready_time: form.ready_time,
      close_time: form.close_time,
      remarks: form.remarks.trim() || null,
      notification_email: email || null,
    },
    onSuccess: (data: { pickup: CarrierPickup }) => {
      saveEmail(email)
      showModal.value = false
      selected.value = []
      showToast(t('delivery.pickup.scheduled-toast', { code: data?.pickup?.confirmation_code || '—' }), 'success')
    },
    onError: (error) => {
      modalFailure.value = describeFailure(error)
    },
    onFinally: () => {
      submitting.value = false
    },
  })
  // 成功、失败（预约记录落成 failed / unknown、运单被别人约了）都要按最新状态显示
  await fetchOverview()
}

// ------------------ 预约记录：取消 / 确认作废 ----------------------
const busyPickupId = ref<number | null>(null)

const cancelPickup = async (pickup: CarrierPickup) => {
  const confirmed = await showConfirm(
    t('delivery.pickup.cancel-confirm-title'),
    t('delivery.pickup.cancel-confirm', { date: pickup.pickup_date, window: timeWindow(pickup), code: pickup.confirmation_code || '—' }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return
  busyPickupId.value = pickup.id
  listFailure.value = null
  await httpRequest(pickupUrl(pickup.id, 'cancel'), {
    method: 'POST',
    onSuccess: () => {
      showToast(t('delivery.pickup.cancelled-toast'), 'success')
    },
    onError: (error) => {
      listFailure.value = describeFailure(error)
      showToast(listFailure.value.summary, 'error')
    },
    onFinally: () => {
      busyPickupId.value = null
    },
  })
  await fetchOverview()
}

const dismissPickup = async (pickup: CarrierPickup) => {
  const confirmed = await showConfirm(
    t('delivery.pickup.dismiss-confirm-title'),
    t('delivery.pickup.dismiss-confirm', { date: pickup.pickup_date, window: timeWindow(pickup), carrier: carrierName.value }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (!confirmed) return
  busyPickupId.value = pickup.id
  listFailure.value = null
  await httpRequest(pickupUrl(pickup.id, 'dismiss'), {
    method: 'POST',
    body: { confirm: true },
    onSuccess: () => {
      showToast(t('action-results.success'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
    },
    onFinally: () => {
      busyPickupId.value = null
    },
  })
  await fetchOverview()
}

const pickupReasonText = (pickup: CarrierPickup): string => {
  if (!pickup.reason) return ''
  const key = `delivery.pickup.reasons.${pickup.reason}`
  return te(key) ? t(key, { carrier: carrierName.value }) : ''
}
</script>

<template>
  <PageHeader :propData="dataToPass" />

  <div class="alert alert-warning-transparent" v-if="!hasWarehouse">
    <i class="ri-error-warning-line me-1"></i>{{ t('delivery.pickup.select-warehouse') }}
  </div>

  <template v-else>
    <div class="row d-flex justify-content-center mb-4" v-if="loading && !overview">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
      </div>
    </div>

    <div class="alert alert-danger-transparent" v-if="loadError">{{ loadError }}</div>

    <template v-if="overview">
      <!-- 说明 + 揽收地点 -->
      <div class="card custom-card">
        <div class="card-header justify-content-between flex-wrap gap-2">
          <div class="card-title">
            {{ t('delivery.pickup.title') }}
            <span class="badge bg-light text-default ms-1 fs-12 align-middle" v-if="overview.carrier && carrierOptions.length <= 1">
              {{ overview.carrier.name }}
            </span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <select class="form-select form-select-sm" style="width: auto" :aria-label="t('delivery.pickup.carrier')"
              :value="carrierId ?? ''" :disabled="loading" v-if="carrierOptions.length > 1"
              @change="switchCarrier(Number(($event.target as HTMLSelectElement).value))">
              <option v-for="c in carrierOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <button type="button" class="btn btn-sm btn-light" :disabled="loading" @click="fetchOverview">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="ri-refresh-line me-1"></i>{{ t('delivery.pickup.operations.refresh') }}
            </button>
          </div>
        </div>
        <div class="card-body">
          <p class="fs-13 text-muted mb-3">{{ t('delivery.pickup.intro') }}</p>
          <!-- 没有能约揽收的承运商：去承运商里设在线对接 -->
          <div class="alert alert-secondary-transparent fs-13 mb-3" v-if="!overview.carrier">
            {{ t('delivery.pickup.no-carrier') }}
            <NuxtLink to="/carrier" class="ms-1">{{ t('delivery.pickup.carrier-list') }}</NuxtLink>
          </div>
          <div class="alert alert-secondary-transparent fs-13 mb-3" v-else-if="!overview.enabled">
            {{ t('delivery.pickup.disabled', { carrier: carrierName }) }}
            <NuxtLink :to="`/carrier/edit/${overview.carrier.id}`" class="ms-1">{{ t('delivery.pickup.setup-link') }}</NuxtLink>
          </div>
          <div class="row gy-2 fs-13" v-if="overview.carrier">
            <div class="col-md-6">
              <div class="text-muted fs-12">{{ t('delivery.pickup.location.address') }}</div>
              <div>{{ formatPickupAddress(overview.pickup_location) || '—' }}</div>
            </div>
            <div class="col-md-3">
              <div class="text-muted fs-12">{{ t('delivery.pickup.location.contact') }}</div>
              <div>
                {{ overview.pickup_location?.contact?.personName || '—' }}
                <span class="text-muted" v-if="overview.pickup_location?.contact?.companyName">
                  / {{ overview.pickup_location.contact.companyName }}
                </span>
              </div>
            </div>
            <div class="col-md-3">
              <div class="text-muted fs-12">{{ t('delivery.pickup.location.phone') }}</div>
              <div class="font-monospace">{{ overview.pickup_location?.contact?.phoneNumber || '—' }}</div>
            </div>
          </div>
          <div class="fs-12 text-muted mt-2" v-if="overview.carrier">{{ t('delivery.pickup.location.hint') }}</div>
          <div class="alert alert-warning-transparent fs-13 mt-3 mb-0" v-if="overview.carrier && overview.blockers.length">
            <div class="fw-semibold mb-1">{{ t('delivery.pickup.blockers.title') }}</div>
            <ul class="mb-0 ps-3">
              <li v-for="(b, i) in overview.blockers" :key="`b-${i}`">{{ blockerText(b) }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 待揽收运单 -->
      <div class="card custom-card">
        <div class="card-header justify-content-between flex-wrap gap-2">
          <div class="card-title">
            {{ t('delivery.pickup.shipments.title') }}
            <span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{ shipments.length }}</span>
          </div>
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="fs-12 text-muted" v-if="selected.length">
              {{ t('delivery.pickup.shipments.selected', { count: selected.length, packages: selectedPackages, weight: selectedWeight }) }}
            </span>
            <button type="button" class="btn btn-sm btn-primary" :disabled="!canSchedule" @click="openModal">
              <i class="ri-truck-line me-1"></i>{{ t('delivery.pickup.operations.schedule') }}
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table text-nowrap table-bordered fs-13 mb-0">
              <thead>
                <tr>
                  <th scope="col" style="width: 1%">
                    <input class="form-check-input" type="checkbox" :checked="allSelected" :disabled="!schedulable.length"
                      :aria-label="t('delivery.pickup.shipments.select-all')" @change="toggleAll">
                  </th>
                  <th scope="col">{{ t('delivery.pickup.fields.tracking-number') }}</th>
                  <th scope="col">DN</th>
                  <th scope="col" class="d-none d-lg-table-cell">{{ t('delivery.pickup.fields.delivery-task') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.packages') }}</th>
                  <th scope="col" class="d-none d-md-table-cell">{{ t('delivery.pickup.fields.service') }}</th>
                  <th scope="col" class="d-none d-md-table-cell">{{ t('delivery.pickup.fields.ship-date') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.pickup-status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in shipments" :key="row.shipment_id">
                  <td>
                    <input class="form-check-input" type="checkbox" :value="row.shipment_id" v-model="selected"
                      :disabled="!row.can_schedule" :aria-label="row.tracking_number || String(row.shipment_id)">
                  </td>
                  <td class="font-monospace">{{ row.tracking_number || '—' }}</td>
                  <td>
                    <NuxtLink :to="`/dn/detail/${row.dn_id}`" class="text-default">DN-{{ row.dn_id }}</NuxtLink>
                    <div class="fs-12 text-muted" v-if="row.order_number">{{ row.order_number }}</div>
                  </td>
                  <td class="d-none d-lg-table-cell">
                    <NuxtLink v-if="row.delivery_task_id" :to="`/delivery/detail/${row.delivery_task_id}`" class="text-default">
                      DEL-{{ row.delivery_task_id }}
                    </NuxtLink>
                    <span v-else>—</span>
                  </td>
                  <td>{{ t('delivery.pickup.fields.packages-value', { count: row.package_count, weight: formatWeight(row.weight_kg) }) }}</td>
                  <td class="d-none d-md-table-cell">{{ row.service_name || formatServiceType(row.service_type) || '—' }}</td>
                  <td class="d-none d-md-table-cell">{{ row.ship_date || '—' }}</td>
                  <td :class="rowPickupColor(row)" class="text-wrap">{{ rowPickupText(row) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-4 border border-top-0 text-muted" v-if="!shipments.length">
              {{ t('delivery.pickup.shipments.empty') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 预约记录 -->
      <div class="card custom-card">
        <div class="card-header">
          <div class="card-title">{{ t('delivery.pickup.pickups.title') }}</div>
        </div>
        <div class="card-body">
          <div class="alert alert-danger-transparent fs-13" v-if="listFailure">
            <div>{{ listFailure.summary }}</div>
            <ul class="mb-0 ps-3 mt-1" v-if="listFailure.errors.length">
              <li v-for="(e, i) in listFailure.errors" :key="`le-${i}`" class="text-break">
                <code class="me-1" v-if="e.code">{{ e.code }}</code>{{ e.message }}
              </li>
            </ul>
            <div class="fs-12 mt-1" v-if="listFailure.transactionId">
              {{ t('delivery.pickup.tips.transaction-id', { carrier: carrierName }) }}: <span class="font-monospace">{{ listFailure.transactionId }}</span>
            </div>
          </div>
          <div class="table-responsive">
            <table class="table text-nowrap table-bordered fs-13 mb-0">
              <thead>
                <tr>
                  <th scope="col">{{ t('delivery.pickup.fields.pickup-date') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.time-window') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.status') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.confirmation-code') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.packages') }}</th>
                  <th scope="col" class="d-none d-lg-table-cell">{{ t('delivery.pickup.fields.shipments') }}</th>
                  <th scope="col" class="d-none d-xl-table-cell">{{ t('delivery.pickup.fields.created') }}</th>
                  <th scope="col">{{ t('delivery.pickup.fields.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in overview.pickups" :key="p.id">
                  <td>{{ p.pickup_date }}</td>
                  <td>{{ timeWindow(p) }}</td>
                  <td class="text-wrap">
                    <span :class="`badge bg-${pickupStatusColor(pickupDisplayStatus(p))}-transparent`">
                      {{ t(`delivery.pickup.status.${pickupDisplayStatus(p)}`) }}
                    </span>
                    <div class="fs-12 text-warning mt-1" v-if="pickupReasonText(p)">{{ pickupReasonText(p) }}</div>
                    <div class="fs-12 text-muted mt-1 text-break" v-if="p.error_message && p.status !== 'scheduled'"
                      style="max-width: 320px">{{ p.error_message }}</div>
                  </td>
                  <td class="font-monospace">
                    {{ p.confirmation_code || '—' }}
                    <div class="fs-12 text-muted" v-if="p.location_code">{{ p.location_code }}</div>
                  </td>
                  <td>{{ t('delivery.pickup.fields.packages-value', { count: p.package_count, weight: formatWeight(p.total_weight_kg) }) }}</td>
                  <td class="d-none d-lg-table-cell font-monospace fs-12 text-wrap" style="max-width: 260px">
                    {{ (p.shipments || []).map((s: CarrierPickup['shipments'][number]) => s.tracking_number).filter(Boolean).join(', ') || '—' }}
                  </td>
                  <td class="d-none d-xl-table-cell">
                    {{ $dayjs(p.created_at, 'YYYY-MM-DD HH:mm') || '—' }}
                    <span class="text-muted ms-1" v-if="p.created_by_user">{{ p.created_by_user.user_name }}</span>
                  </td>
                  <td>
                    <div class="btn-list">
                      <button type="button" class="btn btn-sm btn-outline-danger" v-if="p.can_cancel"
                        :disabled="busyPickupId !== null" @click="cancelPickup(p)">
                        <span v-if="busyPickupId === p.id" class="spinner-border spinner-border-sm me-1"></span>
                        {{ p.reason === 'cancel_unclear' ? t('delivery.pickup.operations.retry-cancel') : t('delivery.pickup.operations.cancel') }}
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-warning" v-if="p.can_dismiss"
                        :disabled="busyPickupId !== null" @click="dismissPickup(p)">
                        <span v-if="busyPickupId === p.id" class="spinner-border spinner-border-sm me-1"></span>
                        {{ t('delivery.pickup.operations.dismiss') }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-center p-4 border border-top-0 text-muted" v-if="!overview.pickups.length">
              {{ t('delivery.pickup.pickups.empty') }}
            </div>
          </div>
          <div class="fs-12 text-muted mt-2">{{ t('delivery.pickup.pickups.hint') }}</div>
        </div>
      </div>
    </template>
  </template>

  <!-- 预约弹窗 -->
  <Teleport to="body">
    <div class="modal fade" :class="{ show: showModal }" :style="{ display: showModal ? 'block' : 'none' }"
      tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h6 class="modal-title">{{ t('delivery.pickup.modal.title') }} · {{ overview?.carrier?.name }}</h6>
            <button type="button" class="btn-close" :disabled="submitting" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-primary-transparent fs-13 py-2">
              {{ t('delivery.pickup.modal.summary', { count: selected.length, packages: selectedPackages, weight: selectedWeight }) }}
              <div class="fs-12 text-muted mt-1">{{ formatPickupAddress(overview?.pickup_location) }}</div>
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
                <input type="date" class="form-control" v-model="form.pickup_date" :min="overview?.today" v-else>
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

            <div class="alert alert-danger-transparent fs-13 mt-3 mb-0" v-if="modalFailure">
              <div>{{ modalFailure.summary }}</div>
              <ul class="mb-0 ps-3 mt-1" v-if="modalFailure.errors.length">
                <li v-for="(e, i) in modalFailure.errors" :key="`me-${i}`" class="text-break">
                  <code class="me-1" v-if="e.code">{{ e.code }}</code>{{ e.message }}
                </li>
              </ul>
              <div class="fs-12 mt-1" v-if="modalFailure.transactionId">
                {{ t('delivery.pickup.tips.transaction-id', { carrier: carrierName }) }}: <span class="font-monospace">{{ modalFailure.transactionId }}</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-light" :disabled="submitting" @click="closeModal">{{ t('button.cancel') }}</button>
            <button type="button" class="btn btn-primary" @click="submit"
              :disabled="submitting || availabilityLoading || !!timeProblem || !form.pickup_date || !selected.length">
              <span v-if="submitting" class="spinner-border spinner-border-sm me-1"></span>
              {{ t('delivery.pickup.modal.submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showModal" @click="closeModal"></div>
  </Teleport>
</template>

<style scoped></style>
