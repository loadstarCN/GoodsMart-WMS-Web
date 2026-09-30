/**
 * 承运商运单（FedEx 自动建单）相关的类型与工具
 *
 * GET  /warehouse/dn/<dn_id>/carrier-shipment          状态（是否启用、能否建单、blockers、当前运单）
 * POST /warehouse/dn/<dn_id>/carrier-shipment          建单（body.label_format；运单号自动保存到配送任务）
 * POST /warehouse/dn/<dn_id>/carrier-shipment/cancel   取消运单（DN 未发货时）
 * 面单文件与单证共用 GET /warehouse/dn/<dn_id>/customs-documents/<doc_id>/file
 * （A4 与热敏标签机默认都是 PDF，走浏览器 → 打印机驱动；热敏为 4×6 英寸 / 100×150mm。
 *   后端配置成 ZPLII / EPL2 时才是指令文件，要用标签机的打印程序打开）
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
  /** 建单时选的面单打印方式（A4 / THERMAL） */
  label_format?: string | null
  /** 面单文件格式（PDF / ZPLII / EPL2 …） */
  image_type?: string | null
  etd_document_id?: number | null
  /** 面单文件名 / 校验值（没有时下载用 label_<运单号>.<扩展名>，校验看响应头 X-Content-SHA256） */
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

// ------------------ 面单打印方式 ----------------------
/** A4 = 普通打印机；THERMAL = 热敏标签机（当普通打印机用，4×6 英寸 PDF）。文件格式看 image_type */
export type LabelFormat = 'A4' | 'THERMAL'
export const LABEL_FORMATS: LabelFormat[] = ['A4', 'THERMAL']
const LABEL_FORMAT_STORAGE_KEY = 'wms.carrierShipment.labelFormat'

/** 上次选的面单打印方式（取不到或不认识 → A4） */
export const loadLabelFormat = (): LabelFormat => {
  try {
    const saved = localStorage.getItem(LABEL_FORMAT_STORAGE_KEY)
    if (saved && (LABEL_FORMATS as string[]).includes(saved)) return saved as LabelFormat
  } catch {
    // 无痕模式等取不到 localStorage 时用默认值
  }
  return 'A4'
}

export const saveLabelFormat = (format: LabelFormat): void => {
  try {
    localStorage.setItem(LABEL_FORMAT_STORAGE_KEY, format)
  } catch {
    // 存不了就只在本次画面有效
  }
}

const LABEL_FILE_EXTENSIONS: Record<string, string> = {
  PDF: 'pdf',
  ZPLII: 'zpl',
  ZPL: 'zpl',
  EPL2: 'epl',
  EPL: 'epl',
  PNG: 'png',
}

/** 面单文件格式：后端没给时按 PDF（A4、热敏默认都是 PDF） */
export const labelImageTypeOf = (shipment: CarrierShipment | null | undefined): string =>
  String(shipment?.image_type || '').trim().toUpperCase() || 'PDF'

export const isThermalLabel = (shipment: CarrierShipment | null | undefined): boolean =>
  String(shipment?.label_format || '').toUpperCase() === 'THERMAL'

export const isPdfLabel = (shipment: CarrierShipment | null | undefined): boolean => labelImageTypeOf(shipment) === 'PDF'

export const labelFileExtension = (imageType: string): string =>
  LABEL_FILE_EXTENSIONS[String(imageType).toUpperCase()] || String(imageType).toLowerCase() || 'bin'

/** 有效运单的面单文档（取文件用）；没有面单返回 null */
export const labelDocumentOf = (shipment: CarrierShipment | null | undefined): PdfDocumentRef | null => {
  if (!isActiveShipment(shipment) || !shipment.label_document_id) return null
  const ext = labelFileExtension(labelImageTypeOf(shipment))
  return {
    id: Number(shipment.label_document_id),
    sha256: shipment.label_sha256 || null,
    file_name: shipment.label_file_name || `label_${shipment.tracking_number || shipment.label_document_id}.${ext}`,
  }
}

/**
 * 标签机直接打印指令文件（ZPLII / EPL2）的扩展点：只在后端把热敏面单配置成 ZPL / EPL 时用得到
 * （默认热敏面单是 PDF，走浏览器打印）。现在不接（available = false）：界面只提供下载指令文件，
 * 并提示用标签机的打印程序打开。
 * 接入时（如本机打印服务、厂商浏览器插件）在这里实现 send，并把 available 置为 true。
 */
export const labelPrinterBridge: {
  available: boolean
  send: (file: Blob, imageType: string) => Promise<void>
} = {
  available: false,
  send: async () => {
    throw new Error('Label printer is not configured')
  },
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
