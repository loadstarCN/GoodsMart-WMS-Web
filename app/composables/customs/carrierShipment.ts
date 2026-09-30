/**
 * 承运商运单（FedEx 自动建单）相关的类型与工具
 *
 * GET  /warehouse/dn/<dn_id>/carrier-shipment          状态（是否启用、能否建单、blockers、当前运单）
 * POST /warehouse/dn/<dn_id>/carrier-shipment          建单（运单号自动保存到配送任务）
 * POST /warehouse/dn/<dn_id>/carrier-shipment/cancel   取消运单（DN 未发货时）
 * 面单 PDF 与单证共用 GET /warehouse/dn/<dn_id>/customs-documents/<doc_id>/file
 */
import type { HttpRequestError } from '~/utils/http'
import type { PdfDocumentRef } from '~/composables/customs/customsDocuments'

export interface CarrierShipmentBlocker {
  code: string
  message?: string | null
  field?: string | null
  goods_code?: string | null
}

export interface CarrierShipment {
  id?: number
  carrier?: string | null
  tracking_number: string | null
  /** active：有效；cancelled：已取消 */
  status: string
  service_type: string | null
  net_charge: number | string | null
  currency: string | null
  label_document_id: number | null
  etd_document_id?: number | null
  /** 面单文件名 / 校验值（没有时下载用 label_<运单号>.pdf，校验看响应头 X-Content-SHA256） */
  label_file_name?: string | null
  label_sha256?: string | null
  created_at: string | null
  created_by: any
  cancelled_at: string | null
  cancelled_by?: any
}

export interface CarrierShipmentStatus {
  /** 功能是否启用（凭证未配置 = 未启用） */
  enabled: boolean
  carrier: string | null
  can_create: boolean
  blockers: CarrierShipmentBlocker[]
  /** 最近一张运单（可能已取消）；从未建过为 null */
  shipment: CarrierShipment | null
}

/** 承运商返回的错误原文（FedEx errors[].code / message） */
export interface CarrierApiErrorItem {
  code: string | null
  message: string | null
}

export interface CarrierRequestFailure {
  /** 已按业务码翻译好的概要 */
  summary: string
  /** 承运商返回的错误原文 */
  errors: CarrierApiErrorItem[]
  /** 承运商的交易 ID（排查用） */
  transactionId: string | null
  /** 承运商超时：运单可能已生成，重试前要先确认 */
  timeout: boolean
}

export const carrierShipmentUrl = (dnId: number | string) => `/api/warehouse/dn/${dnId}/carrier-shipment`

export const isActiveShipment = (shipment: CarrierShipment | null | undefined): shipment is CarrierShipment =>
  !!shipment && shipment.status === 'active'

/**
 * 接口返回可能是完整状态，也可能只是运单本身（建单 / 取消的返回）；
 * 能拼出完整状态时返回状态，否则返回 null（调用方重新读取）。
 */
export const normalizeCarrierStatus = (data: any): CarrierShipmentStatus | null => {
  if (!data || typeof data !== 'object' || typeof data.enabled !== 'boolean') return null
  return {
    enabled: data.enabled,
    carrier: data.carrier ?? null,
    can_create: !!data.can_create,
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
    shipment: data.shipment && typeof data.shipment === 'object' ? data.shipment : null,
  }
}

/** 有效运单的面单文档（取 PDF 用）；没有面单返回 null */
export const labelDocumentOf = (shipment: CarrierShipment | null | undefined): PdfDocumentRef | null => {
  if (!isActiveShipment(shipment) || !shipment.label_document_id) return null
  return {
    id: Number(shipment.label_document_id),
    sha256: shipment.label_sha256 || null,
    file_name: shipment.label_file_name || `label_${shipment.tracking_number || shipment.label_document_id}.pdf`,
  }
}

/** FedEx 服务类型显示：INTERNATIONAL_ECONOMY → International Economy */
export const formatServiceType = (code: string | null | undefined): string => {
  if (!code) return ''
  return String(code)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * 从错误 details 里取出承运商的错误原文与交易 ID。
 * 兼容 errors / carrier_errors / fedex_errors，transaction_id / transactionId。
 */
export const extractCarrierErrors = (details: any): { errors: CarrierApiErrorItem[]; transactionId: string | null } => {
  if (!details || typeof details !== 'object') return { errors: [], transactionId: null }
  const raw = [details.errors, details.carrier_errors, details.fedex_errors].find((v) => Array.isArray(v)) || []
  const errors: CarrierApiErrorItem[] = (raw as any[])
    .map((e) =>
      e && typeof e === 'object'
        ? { code: e.code != null ? String(e.code) : null, message: e.message != null ? String(e.message) : null }
        : { code: null, message: e != null ? String(e) : null }
    )
    .filter((e) => e.code || e.message)
  const tid = details.transaction_id ?? details.transactionId ?? details.carrier_transaction_id ?? null
  return { errors, transactionId: tid != null && tid !== '' ? String(tid) : null }
}

/** 承运商超时（后端 504） */
export const isCarrierTimeout = (error: HttpRequestError | null | undefined): boolean =>
  !!error && error.status === 504

/** 申告价额提示的模式：manual=手工建单时填写；auto=自动建单会随运单提交；submitted=已随运单提交 */
export type DeclaredValueMode = 'manual' | 'auto' | 'submitted'

export const declaredValueModeOf = (status: CarrierShipmentStatus | null | undefined): DeclaredValueMode => {
  if (!status?.enabled) return 'manual'
  return isActiveShipment(status.shipment) ? 'submitted' : 'auto'
}
