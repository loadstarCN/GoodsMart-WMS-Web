/**
 * 上门揽收预约（承运商在线对接支持预约揽收时，如 FedEx：没有定期集荷，自动建好的运单要另约快递员上门）
 *
 * 揽收按「当前仓库 + 承运商 + 日期」约，一次带多张该承运商的运单，件数 / 总重量按所带运单的箱子合计。
 * 接口都按页头的当前仓库（X-WAREHOUSE-ID）；承运商用 carrier_id（不带 = 本公司第一个能约揽收的承运商）：
 * GET  /warehouse/dn/carrier-pickups?carrier_id=               能约揽收的承运商（carriers）、待揽收运单（shipments）、
 *                                                              最近的预约（pickups）、前置条件（blockers）、揽收地点
 * GET  /warehouse/dn/carrier-pickups/availability?carrier_id=  承运商开放的揽收日与可选时间（只查询，不预约）
 * POST /warehouse/dn/carrier-pickups                 body {carrier_id, shipment_ids, pickup_date, ready_time, close_time, remarks?,
 *                                                    notification_email?} → 201 {pickup, alerts, message}
 * POST /warehouse/dn/carrier-pickups/<id>/cancel     取消（已约上、揽收日没过）
 * POST /warehouse/dn/carrier-pickups/<id>/dismiss    body {confirm: true}：结果不明的预约，向承运商核对后作废，运单可重新预约
 * 失败：409 16130（blockers）/ 400 16131（参数，field）/ 409 16132（所选运单不能约，details.shipments）/
 *       409 16133（当前状态不能取消 / 作废）/ 502 16073 / 504 16074（承运商报错 / 超时，details.pickup：
 *       failed = 没约上、运单已放开；unknown = 结果不明、运单仍被占着）
 */

import type { HttpRequestError } from '~/utils/http'
import { extractCarrierErrors, type CarrierApiErrorItem } from '~/composables/customs/carrierShipment'

export interface PickupBlocker {
  code: string
  message?: string | null
  field?: string | null
}

/** 运单上的揽收概要 */
export interface PickupSummary {
  id: number
  /** pending / scheduled / cancelled / failed / unknown / dismissed */
  status: string
  reason: string | null
  pickup_date: string | null
  ready_time: string | null
  close_time: string | null
  confirmation_code: string | null
  /** 揽收日已过 */
  past: boolean
  /** 还占着运单（不能再约） */
  holds_shipments: boolean
}

export interface PickupShipmentRow {
  shipment_id: number
  dn_id: number
  order_number: string | null
  delivery_task_id: number | null
  tracking_number: string | null
  service_type: string | null
  /** 服务的显示名（International Economy）；旧后端没有 */
  service_name?: string | null
  ship_date: string | null
  package_count: number
  weight_kg: number
  created_at: string | null
  pickup: PickupSummary | null
  can_schedule: boolean
}

export interface PickupLocation {
  contact: { companyName?: string; personName?: string; phoneNumber?: string } | null
  address: { streetLines?: string[]; city?: string; postalCode?: string; countryCode?: string } | null
}

export interface CarrierPickup {
  id: number
  /** 对接插件代码（fedex） */
  carrier?: string
  carrier_id?: number | null
  status: string
  reason: string | null
  error_message: string | null
  pickup_date: string
  ready_time: string
  close_time: string
  package_count: number
  total_weight_kg: number
  shipments: { shipment_id: number; dn_id: number; order_number?: string | null; tracking_number: string | null;
    package_count: number; weight_kg: number }[]
  pickup_location: PickupLocation | null
  remarks: string | null
  notification_email: string | null
  confirmation_code: string | null
  location_code: string | null
  transaction_id: string | null
  created_at: string | null
  created_by_user: { id: number; user_name: string } | null
  cancelled_at: string | null
  cancelled_by_user: { id: number; user_name: string } | null
  past: boolean
  holds_shipments: boolean
  can_cancel: boolean
  can_dismiss: boolean
}

/** 能约揽收的承运商 */
export interface PickupCarrier {
  id: number
  name: string
  code: string | null
  /** 对接插件代码（fedex） */
  adapter: string | null
  /** 对接已启用 */
  enabled: boolean
}

export interface PickupOverview {
  /** 当前承运商的对接可以约揽收（启用、设置齐全） */
  enabled: boolean
  /** 当前承运商（没有能约揽收的承运商时为 null） */
  carrier: PickupCarrier | null
  carriers: PickupCarrier[]
  integration: { code: string; name: string; portal_name: string | null; portal_url: string | null } | null
  warehouse_id: number
  today: string
  timezone: string
  can_create: boolean
  blockers: PickupBlocker[]
  pickup_location: PickupLocation | null
  max_remarks: number
  shipments: PickupShipmentRow[]
  pickups: CarrierPickup[]
}

export interface PickupOption {
  pickup_date: string
  schedule_day: string | null
  available: boolean
  /** 准备好时间不能晚于它（HH:MM） */
  cutoff_time: string | null
  /** 准备好到最晚揽收至少隔多少分钟 */
  access_minutes: number | null
  ready_times: string[]
  latest_times: string[]
  default_ready_time: string | null
  default_latest_time: string | null
}

export interface PickupAvailability {
  today: string
  timezone: string
  options: PickupOption[]
}

export const PICKUP_BIZ_CODES = {
  BLOCKED: 16130,
  INVALID: 16131,
  SHIPMENTS_INVALID: 16132,
  STATE_CONFLICT: 16133,
} as const

export const PICKUPS_URL = '/api/warehouse/dn/carrier-pickups'
export const pickupUrl = (id: number, action: 'cancel' | 'dismiss') => `${PICKUPS_URL}/${id}/${action}`

/** 没有 FedEx 可选时间时的默认值（与 FedEx 网站一致） */
export const DEFAULT_READY_TIME = '12:00'
export const DEFAULT_CLOSE_TIME = '18:00'

/** 'HH:MM' → 分钟；不合法 null */
export const minutesOf = (value: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * 所选时间是否满足 FedEx 给的限制：准备好时间不晚于截止时间、最晚揽收比准备好至少晚 access_minutes。
 * 返回问题的 i18n key（delivery.pickup.validation.*），没问题返回 null。没有 option 时只检查先后。
 */
export const pickupTimeProblem = (option: PickupOption | null | undefined, ready: string, close: string): string | null => {
  const r = minutesOf(ready)
  const c = minutesOf(close)
  if (r === null) return 'ready-time'
  if (c === null) return 'close-time'
  if (c <= r) return 'close-before-ready'
  if (option?.cutoff_time) {
    const cutoff = minutesOf(option.cutoff_time)
    if (cutoff !== null && r > cutoff) return 'after-cutoff'
  }
  if (option?.access_minutes && c - r < option.access_minutes) return 'access-time'
  return null
}

/** 揽收记录的显示状态：scheduled 且日期已过 → done（不再能取消） */
export const pickupDisplayStatus = (pickup: Pick<CarrierPickup, 'status' | 'past'> | PickupSummary): string =>
  pickup.status === 'scheduled' && pickup.past ? 'done' : pickup.status

export const pickupStatusColor = (status: string): string => {
  switch (status) {
    case 'scheduled': return 'success'
    case 'done': return 'secondary'
    case 'unknown':
    case 'pending': return 'warning'
    case 'failed': return 'danger'
    default: return 'light'
  }
}

/** 揽收地点的一行地址 */
export const formatPickupAddress = (location: PickupLocation | null | undefined): string => {
  const a = location?.address
  if (!a) return ''
  return [...(a.streetLines || []), a.city, a.postalCode, a.countryCode].filter(Boolean).join(', ')
}

/** 揽收时间段 12:00–18:00 */
export const pickupTimeWindow = (p: { ready_time?: string | null; close_time?: string | null }): string =>
  `${p.ready_time || '—'}–${p.close_time || '—'}`

/** 重量（kg）最多两位小数 */
export const formatPickupWeight = (value: number | string | null | undefined): string => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '—'
}

/** 确认邮件地址记在本机（下次预约预填） */
export const PICKUP_EMAIL_STORAGE_KEY = 'wms.carrierPickup.notificationEmail'

export interface PickupFailure {
  summary: string
  /** 承运商回的错误原文（只有承运商报错 / 超时时有） */
  errors: CarrierApiErrorItem[]
  transactionId: string | null
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * 揽收接口失败 → 显示用的摘要（结果不明 / 没约上 / 取消结果不明各补一句该怎么办）+ 承运商错误原文 + 交易 ID。
 * carrier：文案里的承运商名
 */
export const describePickupFailure = (
  error: HttpRequestError,
  carrier: string,
  t: Translate,
  bizErrorMessage: (error: HttpRequestError) => string,
): PickupFailure => {
  const { errors, transactionId, permissionDenied } = extractCarrierErrors(error.details)
  let summary = bizErrorMessage(error)
  const pickup = error.details?.pickup
  if (permissionDenied) summary = t('delivery.pickup.tips.permission-denied', { carrier })
  else if (pickup && typeof pickup === 'object') {
    if (pickup.status === 'unknown') summary = `${summary} ${t('delivery.pickup.tips.unknown', { carrier })}`
    else if (pickup.status === 'failed') summary = `${summary} ${t('delivery.pickup.tips.failed')}`
    else if (pickup.reason === 'cancel_unclear') summary = `${summary} ${t('delivery.pickup.tips.cancel-unclear', { carrier })}`
  }
  return { summary, errors: error.code === 16073 || error.code === 16074 ? errors : [], transactionId }
}
