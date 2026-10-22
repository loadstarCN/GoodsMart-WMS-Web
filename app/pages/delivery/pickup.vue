<script lang="ts" setup>
/**
 * 上门揽收预约（当前仓库）
 *
 * 承运商的在线对接支持预约揽收时（如 FedEx，没有定期集荷），运单建好后要在这里约快递员上门。揽收按「仓库 + 承运商 + 日期」约，
 * 一次带多张该承运商的运单，件数 / 总重量按所选运单的箱子合计。有多个能约揽收的承运商时在页头切换（?carrier_id=）。
 * 仓库用页头的当前仓库；页头选的是「全部仓库」时用地址栏 ?warehouse_id=（从配送任务点过来时带着）。
 * - 待揽收运单：该承运商的自动运单（有效、出库单未发货）。已被预约占着的（预约中 / 已约上且揽收日没过 / 结果不明）不能勾选；
 *   揽收日过了还没发货的可以重新预约（快递员没来 / 忘了完成发货）
 * - 预约：先向承运商查可约日期与可选时间（下拉），默认承运商给的默认时间；约好后不能改，只能取消重约
 * - 预约结果不明（承运商超时等）：运单仍被占着，向承运商核对后「确认作废」才能重新预约
 * - 取消：已约上、揽收日没过；取消结果不明时可重试
 */
import { warehouseHeaders, type HttpRequestError } from '~/utils/http'
import { formatServiceType } from '~/composables/customs/carrierShipment'
import {
  PICKUPS_URL,
  describePickupFailure,
  formatPickupAddress,
  formatPickupWeight,
  pickupDisplayStatus,
  pickupStatusColor,
  pickupTimeWindow,
  pickupUrl,
  type CarrierPickup,
  type PickupFailure,
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

/** 揽收仓库：页头的当前仓库，没选（全部仓库）时用地址栏的 ?warehouse_id= */
const queryWarehouseId = (): number | null => {
  const n = Number(route.query.warehouse_id)
  return Number.isInteger(n) && n > 0 ? n : null
}
const warehouseId = computed(() => warehouseStore.currentWarehouse?.id ?? queryWarehouseId())
const hasWarehouse = computed(() => !!warehouseId.value)
const headers = () => ({ 'Content-Type': 'application/json', ...warehouseHeaders(warehouseId.value) })
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

/** 列表上的操作（取消 / 作废）失败时的详情 */
const listFailure = ref<PickupFailure | null>(null)

const fetchOverview = async () => {
  if (!hasWarehouse.value) {
    overview.value = null
    loading.value = false
    return
  }
  loading.value = true
  await httpRequest<PickupOverview>(`${PICKUPS_URL}${carrierQuery()}`, {
    headers: headers(),
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

watch(warehouseId, () => {
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

const formatWeight = formatPickupWeight
const timeWindow = pickupTimeWindow

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
const describeFailure = (error: HttpRequestError): PickupFailure =>
  describePickupFailure(error, carrierName.value, t, bizErrorMessage)

// ------------------ 预约弹窗（CarrierPickupModal） ----------------------
const showModal = ref(false)
const openModal = () => {
  if (canSchedule.value) showModal.value = true
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
    headers: headers(),
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
    headers: headers(),
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

  <!-- 预约弹窗：提交后不论成败都按最新状态显示（预约可能落成 failed / unknown、运单可能被别人约了） -->
  <CarrierPickupModal v-model:open="showModal" :carrier-id="carrierId" :carrier-name="carrierName" :warehouse-id="warehouseId"
    :shipments="selectedRows" :location="overview?.pickup_location" :max-remarks="overview?.max_remarks"
    :today="overview?.today" @booked="selected = []" @submitted="fetchOverview" />
</template>

<style scoped></style>
