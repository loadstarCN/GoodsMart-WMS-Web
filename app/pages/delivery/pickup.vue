<script lang="ts" setup>
/**
 * 上门揽收（当前仓库）
 *
 * 承运商的揽收方式（pickup_method）：
 * - api：在线对接支持预约揽收（如 FedEx，没有定期集荷），运单建好后在这里约快递员上门
 * - manual：电话 / 网站约好后在这里记一笔（ManualPickupModal，直接是已约上；取消只改本地），页面显示约揽收的联系方式
 *   （api 的承运商也可以手工记一笔：承运商系统故障或电话约的，后端 can_record）
 * 揽收按「仓库 + 承运商 + 日期」约，
 * 一次带多张该承运商的运单，件数 / 总重量按所选运单的箱子合计。有多个能约揽收的承运商时在页头切换（?carrier_id=）。
 * 仓库用页头的当前仓库；页头选的是「全部仓库」时用地址栏 ?warehouse_id=（从配送任务点过来时带着）。
 * - 待揽收运单：该承运商的自动运单（有效、出库单未发货）。已被预约占着的（预约中 / 已约上且揽收日没过 / 结果不明）不能勾选；
 *   揽收日过了还没发货的可以重新预约（快递员没来 / 忘了完成发货）
 * - 预约（api）：先向承运商查可约日期与可选时间（下拉），默认承运商给的默认时间；约好后不能改，只能取消重约
 * - 记录（manual）：填约好的日期、时间段、受理号、备注
 * - 预约记录列出在线预约与手工记录（来源徽章）
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
/** 揽收日、时间段、创建时刻都按揽收仓库的时区（弹窗也用它）；与浏览器不同时在表头标出 */
const pickupTimeZone = provideTimeZone(() => warehouseId.value)
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
/** 当前承运商的揽收方式：manual = 手工记录；旧后端没有该字段时按在线预约 */
const pickupMethod = computed(() => String(overview.value?.method || overview.value?.carrier?.pickup_method || 'api'))
const manualMode = computed(() => pickupMethod.value === 'manual')
const pickupContact = computed(() => String(overview.value?.carrier?.pickup_contact || '').trim())
const contactIsUrl = computed(() => /^https?:\/\//i.test(pickupContact.value))
const carrierOptionText = (c: { name: string; pickup_method?: string | null }) => {
  const key = `carrier.methods.options.pickup.${c.pickup_method}`
  return c.pickup_method && te(key) ? `${c.name}（${t(key)}）` : c.name
}

/** 列表上的操作（取消 / 作废）失败时的详情 */
const listFailure = ref<PickupFailure | null>(null)

let overviewGeneration=0
const fetchOverview = async () => {
  const seq=++overviewGeneration
  if (!hasWarehouse.value) {
    overview.value = null
    loading.value = false
    return
  }
  loading.value = true
  await httpRequest<PickupOverview>(`${PICKUPS_URL}${carrierQuery()}`, {
    headers: headers(),
    onSuccess: (data: PickupOverview) => {
      if(seq!==overviewGeneration)return
      overview.value = data
      loadError.value = null
      carrierId.value = data.carrier?.id ?? null
      const selectable = new Set(data.shipments.filter((r) => r.can_schedule).map((r) => r.shipment_id))
      selected.value = selected.value.filter((id: number) => selectable.has(id))
    },
    onError: (error) => {
      if(seq!==overviewGeneration)return
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
      if(seq===overviewGeneration)loading.value = false
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
/** 手工记录：选了运单就能记（api 的承运商也可以，后端 can_record 说了算；旧后端没有该字段时只有 manual 能记） */
const canRecord = computed(() => !!overview.value?.carrier && selected.value.length > 0
  && (overview.value.can_record ?? manualMode.value))

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
  describePickupFailure(error, carrierName.value, t, bizErrorMessage, te)

// ------------------ 预约弹窗（CarrierPickupModal） ----------------------
const showModal = ref(false)
const openModal = () => {
  if (canSchedule.value) showModal.value = true
}
/** 手工记录的弹窗 */
const showManualModal = ref(false)
const openManualModal = () => {
  if (canRecord.value) showManualModal.value = true
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

onBeforeUnmount(()=>overviewGeneration++)
const selectRow=(id:number,on:boolean)=>{selected.value=on?[...new Set([...selected.value,id])]:selected.value.filter(value=>value!==id)}
const bookOne=(row:PickupShipmentRow)=>{selected.value=[row.shipment_id];if(manualMode.value)openManualModal();else openModal()}
const recordColumns=computed(()=>[
 {key:'pickup_date',label:t('delivery.pickup.fields.pickup-date')},{key:'window',label:t('delivery.pickup.fields.time-window')},
 {key:'status',label:t('delivery.pickup.fields.status')},{key:'source',label:t('shipping.pickup.source')},
 {key:'code',label:t('delivery.pickup.fields.confirmation-code')},{key:'packages',label:t('delivery.pickup.fields.packages')},
 {key:'shipments',label:t('delivery.pickup.fields.shipments')},{key:'created',label:t('delivery.pickup.fields.created')},{key:'actions',label:t('delivery.pickup.fields.actions'),align:'right' as const}
])
useHead({title:()=>t('delivery.pickup.title')})
</script>
<template><div class="w-pickup w-scope"><header><h1>{{t('delivery.pickup.title')}}</h1><TimeZoneBadge :zone="pickupTimeZone"/><WButton :loading="loading" @click="fetchOverview">{{t('delivery.pickup.operations.refresh')}}</WButton></header><WAlert v-if="!hasWarehouse" tone="warn" :title="t('delivery.pickup.select-warehouse')"/><template v-else><WAlert v-if="loadError" tone="block" :title="loadError"/><WCard v-if="loading&&!overview"><WEmptyState :title="t('common.status.loading')"/></WCard><template v-if="overview"><nav class="carrier-tabs" :aria-label="t('delivery.pickup.carrier')"><button v-for="carrier in carrierOptions" :key="carrier.id" type="button" :class="{active:carrier.id===carrierId}" :aria-pressed="carrier.id===carrierId" :disabled="loading" @click="switchCarrier(carrier.id)">{{carrier.name}}</button></nav><WCard flush><div class="section-title"><h2>{{overview.carrier?.name||t('delivery.pickup.title')}}</h2><small>{{manualMode?t('shipping.pickup.page-intro-manual',{carrier:carrierName}):t('delivery.pickup.intro')}}</small><p v-if="!manualMode">{{formatPickupAddress(overview.pickup_location)||'—'}} · {{overview.pickup_location?.contact?.personName||'—'}} · {{overview.pickup_location?.contact?.phoneNumber||'—'}}</p></div><div v-if="!overview.carrier" class="notice">{{t('delivery.pickup.no-carrier')}} <NuxtLink to="/carrier">{{t('delivery.pickup.carrier-list')}}</NuxtLink></div><template v-else><WAlert v-if="!overview.enabled&&!manualMode" tone="warn" :title="t('delivery.pickup.disabled',{carrier:carrierName})"><NuxtLink :to="'/carrier/edit/'+overview.carrier.id">{{t('delivery.pickup.setup-link')}}</NuxtLink></WAlert><WAlert v-if="overview.blockers.length&&!manualMode" tone="warn" :title="t('delivery.pickup.blockers.title')"><ul><li v-for="(blocker,index) in overview.blockers" :key="index">{{blockerText(blocker)}}</li></ul></WAlert><div class="pickup-grid"><div class="shipments"><div class="shipment-heading"><span>{{t('delivery.pickup.shipments.title')}} {{shipments.length}}</span><WCheckbox :model-value="allSelected" :disabled="!schedulable.length" @update:model-value="toggleAll">{{t('delivery.pickup.shipments.select-all')}}</WCheckbox></div><div v-for="row in shipments" :key="row.shipment_id" class="shipment-row" :class="{selected:selected.includes(row.shipment_id)}"><WCheckbox :model-value="selected.includes(row.shipment_id)" :disabled="!row.can_schedule" :aria-label="row.tracking_number||String(row.shipment_id)" @update:model-value="value=>selectRow(row.shipment_id,value===true)"/><div class="shipment-name"><NuxtLink class="w-pickup-name" :to="'/dn/detail/'+row.dn_id">DN-{{row.dn_id}} · {{row.tracking_number||'—'}}</NuxtLink><small>{{row.order_number}} · {{row.ship_date||'—'}} · {{row.service_name||formatServiceType(row.service_type)||'—'}}</small><small v-if="!row.can_schedule">{{rowPickupText(row)}}</small></div><span class="packages">{{t('delivery.pickup.fields.packages-value',{count:row.package_count,weight:formatWeight(row.weight_kg)})}}</span><WButton v-if="row.can_schedule" size="sm" @click="bookOne(row)">{{t(manualMode?'shipping.actions.record_pickup':'delivery.pickup.operations.schedule')}}</WButton></div><WEmptyState v-if="!shipments.length" :title="t('delivery.pickup.shipments.empty')"/></div><div class="booking"><h3>{{t('delivery.pickup.shipments.selected',{count:selected.length,packages:selectedPackages,weight:selectedWeight})}}</h3><p v-if="manualMode&&pickupContact">{{t('shipping.pickup.contact')}} <a v-if="contactIsUrl" :href="pickupContact" target="_blank" rel="noopener">{{pickupContact}}</a><span v-else>{{pickupContact}}</span></p><WButton v-if="!manualMode" variant="primary" block :disabled="!canSchedule" @click="openModal">{{t('delivery.pickup.operations.schedule')}}</WButton><WButton v-if="manualMode||overview.can_record!==undefined" :variant="manualMode?'primary':'text'" block :disabled="!canRecord" @click="openManualModal">{{t('shipping.actions.record_pickup')}}</WButton><small>{{t('delivery.pickup.location.hint')}}</small></div></div></template></WCard><WCard flush><div class="section-title"><h2>{{t('delivery.pickup.pickups.title')}}</h2></div><WAlert v-if="listFailure" tone="block" :title="listFailure.summary"><ul><li v-for="(error,index) in listFailure.errors" :key="index">{{error.code}} {{error.message}}</li></ul><small>{{listFailure.transactionId}}</small></WAlert><WTable :columns="recordColumns" :rows="overview.pickups" inset><template #cell-window="{row}">{{timeWindow(row)}}</template><template #cell-status="{row}"><WStatus :tone="pickupDisplayStatus(row)==='scheduled'?'ok':'warn'">{{t('delivery.pickup.status.'+pickupDisplayStatus(row))}}</WStatus><small v-if="pickupReasonText(row)">{{pickupReasonText(row)}}</small><small v-if="row.error_message&&row.status!=='scheduled'">{{row.error_message}}</small></template><template #cell-source="{row}">{{t(row.source==='manual'?'shipping.pickup.manual-badge':'shipping.pickup.api-badge')}}</template><template #cell-code="{row}">{{row.confirmation_code||'—'}}<small>{{row.location_code}}</small></template><template #cell-packages="{row}">{{t('delivery.pickup.fields.packages-value',{count:row.package_count,weight:formatWeight(row.total_weight_kg)})}}</template><template #cell-shipments="{row}">{{(row.shipments||[]).map((shipment:any)=>shipment.tracking_number).filter(Boolean).join(', ')||'—'}}</template><template #cell-created="{row}">{{$dayjs(row.created_at,'MM/DD HH:mm',pickupTimeZone)}}<small>{{row.created_by_user?.user_name}}</small></template><template #cell-actions="{row}"><WButton v-if="row.can_cancel" size="sm" variant="danger" :disabled="busyPickupId!==null" @click="cancelPickup(row)">{{t(row.reason==='cancel_unclear'?'delivery.pickup.operations.retry-cancel':'delivery.pickup.operations.cancel')}}</WButton><WButton v-if="row.can_dismiss" size="sm" :disabled="busyPickupId!==null" @click="dismissPickup(row)">{{t('delivery.pickup.operations.dismiss')}}</WButton></template></WTable><p class="record-hint">{{t('delivery.pickup.pickups.hint')}}</p></WCard></template></template><CarrierPickupModal v-model:open="showModal" :carrier-id="carrierId" :carrier-name="carrierName" :warehouse-id="warehouseId" :shipments="selectedRows" :location="overview?.pickup_location" :max-remarks="overview?.max_remarks" :today="overview?.today" @booked="selected=[]" @submitted="fetchOverview"/><ManualPickupModal v-model:open="showManualModal" :carrier-id="carrierId" :carrier-name="carrierName" :warehouse-id="warehouseId" :shipments="selectedRows" :contact="pickupContact||null" :today="overview?.today" @recorded="selected=[]" @submitted="fetchOverview"/></div></template>
<style scoped>
.w-pickup{display:flex;flex-direction:column;gap:16px}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}header>.w-button{margin-left:auto}h1{font-size:24px;line-height:32px;font-weight:600;margin:0}.carrier-tabs{display:flex;flex-wrap:wrap;gap:8px}.carrier-tabs button{height:32px;padding:0 12px;border:1px solid var(--w-border-strong);border-radius:999px;background:white;color:var(--w-text-2);font:inherit;font-size:13px;line-height:20px}.carrier-tabs button.active{border-color:#DAD6FF;background:#F5F4FF;color:#4E1DBC;font-weight:600}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0 0 2px}small{display:block;color:var(--w-text-3);font-size:12px;line-height:18px}p{font-size:13px;line-height:20px;margin:6px 0 0}.pickup-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;padding:16px 24px 24px;align-items:start}.shipments{display:flex;flex-direction:column;gap:8px;min-width:0}.shipment-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--w-text-3)}.shipment-row{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border:1px solid var(--w-border);border-radius:10px}.shipment-row.selected{border-color:#DAD6FF;background:#F5F4FF}.shipment-name{min-width:0;flex:1}.w-pickup-name{font-size:14px;line-height:20px;font-weight:600;text-decoration:none;color:var(--w-text-1);overflow-wrap:anywhere}.packages{font-size:13px;line-height:20px}.booking{padding:16px;border:1px solid var(--w-border);border-radius:10px;display:flex;flex-direction:column;gap:12px}h3{font-size:14px;line-height:22px;font-weight:600;margin:0}.record-hint,.notice{padding:16px 24px;margin:0;color:var(--w-text-3)}.w-pickup :deep(.w-table){min-width:1040px}.w-pickup :deep(.w-table td){padding-top:12px;padding-bottom:12px;vertical-align:top}@media(max-width:1100px){.pickup-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:600px){.pickup-grid{padding:16px}.shipment-row{flex-wrap:wrap}.shipment-name{min-width:65%}}
</style>
