/**
 * 承运商运单（FedEx 自动建单）相关的类型与工具
 *
 * GET  /warehouse/dn/<dn_id>/carrier-shipment          状态（是否启用、能否建单、blockers、最近一张运单）
 * POST /warehouse/dn/<dn_id>/carrier-shipment          建单（body.label_format）→ 201 状态 + alerts；
 *                                                      运单号存到配送任务，CI / PL 自动带运单号重新签发
 * POST /warehouse/dn/<dn_id>/carrier-shipment/cancel   body {tracking_number}：取消运单（DN 未发货时）→ 200 状态
 * POST /warehouse/dn/<dn_id>/carrier-shipment/dismiss  body {confirm: true, unresolved_id}：操作员已在 FedEx Ship Manager 核对
 *                                                      「FedEx 上没有这张运单或已手工取消」后，解除结果不明的运单 → 200 状态
 *   取消 / 解除都带上确认框里展示的目标（运单号 / 结果不明记录的 id）：与服务端当前记录不符 → 409 16093（details.expected / actual），
 *   免得解除 / 取消的是别人刚建的、没人核对过的另一张运单
 * 失败：409 16072（details.blockers）/ 502 16073（FedEx 报错，details.errors / transaction_id / action）/
 *       504 16074（超时，details.maybe_processed / unresolved）/ 409 16075（没有有效运单 / 没有可解除的运单）/
 *       400 16077（label_format 不合法）/ 409 16079（有结果不明的运单，details.unresolved）/ 409 16093（目标已变）
 * 运单记录可能处于 cancelling：reason cancel_in_progress = 正在取消（按「进行中」处理，定时刷新）；
 *   其它 reason（timeout / save_failed / interrupted / stale …）= 取消结果不明（can_dismiss / can_cancel：重试取消或核对后确认作废）
 * can_cancel：可以（重试）取消——有效运单、取消结果不明的运单、带运单号的结果不明记录（如 compensation_failed）
 * 取消结果不明：502 16073 / 504 16074（details.maybe_processed = true、unresolved）→ 重新读取，提示核对 / 重试
 * 建单后 WMS 保存失败：502 16095（details.tracking_number / compensation{attempted, cancelled, …} / unresolved）
 * 确认作废带运单号的记录：先请 FedEx 取消，FedEx 没确认 → 409 16094（details.tracking_number）
 * 结果不明（unresolved）：FedEx 超时、补偿失败、响应异常等，运单可能已在 FedEx 生成；有它时 can_create = false，
 * 要先到 FedEx Ship Manager 核对（有就取消），再在这里解除（can_dismiss）后才能重新建单。
 * 申告价额高于已打包货值时后端自动压到货值：warnings 里 DECLARED_VALUE_CAPPED（GET 预告 / POST 实际），
 * 运单上的 declared_value 是实际提交值。有有效自动运单时改配送任务的运单号 → 409 16078。
 * 面单文件与单证共用 GET /warehouse/dn/<dn_id>/customs-documents/<doc_id>/file（doc_type = shipping_label）
 * （A4 与热敏标签机默认都是 PDF，走浏览器 → 打印机驱动：A4 = Letter 页上半页面单（A4 纸、实际大小 100%），
 *   热敏 = 4×6 英寸页面（100×150mm 纸）。后端配置成 ZPLII / EPL2 时才是指令文件，要用标签机的打印程序打开）
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
  /** active：有效；cancelling：取消中；cancelled：已取消 */
  status: string
  service_type: string | null
  net_charge: number | string | null
  currency: string | null
  label_document_id: number | null
  /** 多箱时每箱的运单号（第一个是主运单号） */
  package_tracking_numbers?: string[] | null
  package_count?: number | null
  ship_date?: string | null
  /** 随运单提交的申告价额（按箱分摊前的合计） */
  declared_value?: number | null
  transaction_id?: string | null
  /** 建单时选的面单打印方式（A4 / THERMAL） */
  label_format?: string | null
  /** 面单文件格式（PDF / ZPLII / EPL2 …） */
  image_type?: string | null
  etd_document_id?: number | null
  label_stock_type?: string | null
  /** 面单文件名 / 校验值（没有时下载用 label_<运单号>.<扩展名>，校验看响应头 X-Content-SHA256） */
  label_file_name?: string | null
  label_content_type?: string | null
  label_sha256?: string | null
  /** 面单 PDF 的组成（每箱面单、国际件的 AWB 副本 AUXILIARY 等） */
  label_parts?: CarrierLabelPart[] | null
  created_at: string | null
  created_by: any
  cancelled_at: string | null
  cancelled_by?: any
}

export interface CarrierLabelPart {
  source?: string | null
  package_sequence?: number | null
  tracking_number?: string | null
  /** LABEL / AUXILIARY … */
  content_type?: string | null
  doc_type?: string | null
  copies?: number | null
  pages?: number | null
  archived?: boolean | null
  note?: string | null
}

/** 状态接口附带的提醒（按 code 做文案，未知 code 显示 message） */
export interface CarrierWarning {
  code: string | null
  message: string | null
  /** DECLARED_VALUE_CAPPED：报关快照的申告价额 / 实际随运单提交的值（null = 不提交） */
  requested?: number | null
  applied?: number | null
}

/**
 * 结果不明的自动运单（FedEx 超时 / 补偿失败 / 响应异常等）。
 * pending = 建单进行中（别人或另一个画面正在建）；cancelling = 取消进行中；unknown = 已结束但不知道 FedEx 上有没有生成
 */
export interface CarrierUnresolvedShipment {
  id: number | null
  status: string
  /** in_progress / timeout / compensation_failed / bad_response / stale … */
  reason: string | null
  /** 已知的运单号（FedEx 返回过、但没能确认保存时） */
  tracking_number: string | null
  /** FedEx 交易 ID（在 FedEx 侧查找用） */
  transaction_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CarrierShipmentStatus {
  /** 功能是否启用（凭证未配置 = 未启用） */
  enabled: boolean
  carrier: string | null
  can_create: boolean
  blockers: CarrierShipmentBlocker[]
  /** 最近一张运单（有效的优先，可能已取消）；从未建过为 null */
  shipment: CarrierShipment | null
  /** 开了电子贸易单证（ETD）：建单时 CI 电子提交给 FedEx */
  etd_enabled?: boolean
  /** 报关快照的运送申告价额：有值时自动建单按箱分摊随运单提交 */
  declared_value_carriage?: number | null
  delivery_task_id?: number | null
  /** 后端配置的默认面单打印方式 */
  default_label_format?: string | null
  /** 各打印方式对应的文件格式 / 纸张类型 */
  label_formats?: Record<string, { image_type?: string | null; stock_type?: string | null }> | null
  warnings?: CarrierWarning[]
  /** 结果不明的运单（没有为 null）；有它时 can_create = false */
  unresolved?: CarrierUnresolvedShipment | null
  /** 可以解除结果不明的运单（操作员核对 FedEx 后） */
  can_dismiss?: boolean
  /** 可以（重试）取消运单；旧后端没有该字段（undefined）时按「有有效运单」判断 */
  can_cancel?: boolean
}

/** 建单成功时 FedEx 返回的提示（如 CUSTOMVALUE.GREATER.THAN.DECLAREDVALUE） */
export interface CarrierAlert {
  code: string | null
  alert_type: string | null
  message: string | null
}

/** 承运商对接的业务码 */
export const CARRIER_BIZ_CODES = {
  /** 409：建单前置条件不满足（details.blockers） */
  BLOCKED: 16072,
  /** 502：FedEx 报错 */
  CARRIER_ERROR: 16073,
  /** 504：FedEx 超时 */
  CARRIER_TIMEOUT: 16074,
  /** 409：没有有效运单（取消时） */
  NO_ACTIVE_SHIPMENT: 16075,
  /** 409：有自动运单时不能改箱子 / 报关数据 */
  PACKAGES_LOCKED: 16076,
  /** 409：有有效自动运单时不能改运单号 / 承运商，不能新建 / 删除配送任务 */
  SHIPMENT_LOCKED: 16078,
  /** 409：有结果不明的自动运单（details.unresolved） */
  UNRESOLVED: 16079,
  /** 409：CI 上已印的运单号与完成发货时填的不同（details.document_tracking_number / tracking_number） */
  DOCUMENT_TRACKING_MISMATCH: 16080,
  /** 409：取消 / 解除的目标与服务端当前记录不符（details.expected / actual） */
  TARGET_MISMATCH: 16093,
  /** 409：确认作废带运单号的记录时 FedEx 没确认已取消（details.tracking_number） */
  DISMISS_NOT_CONFIRMED: 16094,
  /** 502：FedEx 已建运单但 WMS 保存失败（details.compensation / unresolved） */
  SAVE_FAILED: 16095,
} as const

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
  /** FedEx 侧的动作（create / etd_upload / cancel） */
  action: string | null
  /** FedEx 拒绝权限（API 项目没开通相应接口） */
  permissionDenied: boolean
}

/** 提醒列表（warnings）：只留有 code 或 message 的项 */
const toNumberOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v)

export const extractCarrierWarnings = (data: any): CarrierWarning[] =>
  (Array.isArray(data?.warnings) ? data.warnings : [])
    .map((w: any) =>
      w && typeof w === 'object'
        ? {
            code: w.code != null ? String(w.code) : null,
            message: w.message != null ? String(w.message) : null,
            requested: toNumberOrNull(w.requested),
            applied: toNumberOrNull(w.applied),
          }
        : { code: null, message: w != null ? String(w) : null }
    )
    .filter((w: CarrierWarning) => w.code || w.message)

export const carrierShipmentUrl = (dnId: number | string) => `/api/warehouse/dn/${dnId}/carrier-shipment`

const toStringOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

/** 结果不明的运单：不是对象（或没有 status）时返回 null */
export const normalizeUnresolved = (data: any): CarrierUnresolvedShipment | null => {
  if (!data || typeof data !== 'object' || !data.status) return null
  return {
    id: toNumberOrNull(data.id),
    status: String(data.status),
    reason: toStringOrNull(data.reason),
    tracking_number: toStringOrNull(data.tracking_number),
    transaction_id: toStringOrNull(data.transaction_id ?? data.transactionId),
    created_at: toStringOrNull(data.created_at),
    updated_at: toStringOrNull(data.updated_at),
  }
}

/** 建单失败（504 16074 / 409 16079）的 details 里带的结果不明运单 */
export const unresolvedFromError = (error: HttpRequestError | null | undefined): CarrierUnresolvedShipment | null =>
  normalizeUnresolved(error?.details?.unresolved)

/** 记录状态是「进行中」：建单中（pending）/ 取消中（cancelling） */
export const isInProgressRecordStatus = (value: string | null | undefined): boolean =>
  value === 'pending' || value === 'cancelling'

/**
 * 结果不明的运单是否「进行中」：pending / cancelling 且后端不允许解除（别人正在建 / 取消，等它结束）。
 * 进行中但后端允许解除（如卡住太久 stale）按结果不明处理，否则会一直卡着没法操作。
 */
export const isUnresolvedInProgress = (status: CarrierShipmentStatus | null | undefined): boolean =>
  !!status?.unresolved && isInProgressRecordStatus(status.unresolved.status) && !status.can_dismiss

/** 运单正在取消（cancelling）：按进行中处理，不能再取消 / 建单 */
export const isCancellingShipment = (shipment: CarrierShipment | null | undefined): shipment is CarrierShipment =>
  !!shipment && shipment.status === 'cancelling'

/**
 * 单证概要用的运单状态：
 * - unresolved：有结果不明的运单（FedEx 上可能已生成）
 * - cancel-unresolved：运单取消结果不明（cancelling 且没有在进行，FedEx 上可能还有效）
 * - creating / cancelling：建单中 / 取消中（结果不明记录进行中，或运单本身在取消中）
 * - active：有效运单；none：没有
 */
export type CarrierSummaryState = 'unresolved' | 'cancel-unresolved' | 'creating' | 'cancelling' | 'active' | 'none'
export const carrierSummaryState = (status: CarrierShipmentStatus | null | undefined): CarrierSummaryState => {
  if (!status) return 'none'
  const unresolved = status.unresolved
  if (unresolved) {
    if (isUnresolvedInProgress(status)) return unresolved.status === 'cancelling' ? 'cancelling' : 'creating'
    return unresolved.status === 'cancelling' ? 'cancel-unresolved' : 'unresolved'
  }
  if (isCancellingShipment(status.shipment)) return 'cancelling'
  if (isActiveShipment(status.shipment)) return 'active'
  return 'none'
}

/**
 * 建单失败后要立刻重新读取状态的情况：超时 / 有结果不明运单 / 网关错误 / 网络断开
 * （运单可能已在 FedEx 生成，按钮状态要以后端最新的 unresolved / can_create 为准）。
 * httpRequest 网络异常时 status = -1。
 */
export const shouldReloadAfterCreateFailure = (error: HttpRequestError | null | undefined): boolean =>
  !error ||
  error.code === CARRIER_BIZ_CODES.CARRIER_TIMEOUT ||
  error.code === CARRIER_BIZ_CODES.UNRESOLVED ||
  !error.status ||
  error.status < 0 ||
  error.status >= 500

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
    etd_enabled: !!data.etd_enabled,
    declared_value_carriage: data.declared_value_carriage ?? null,
    delivery_task_id: data.delivery_task_id ?? null,
    default_label_format: data.default_label_format ?? null,
    label_formats: data.label_formats && typeof data.label_formats === 'object' ? data.label_formats : null,
    warnings: extractCarrierWarnings(data),
    unresolved: normalizeUnresolved(data.unresolved),
    can_dismiss: !!data.can_dismiss,
    can_cancel: data.can_cancel === undefined || data.can_cancel === null ? undefined : !!data.can_cancel,
  }
}

/** 建单返回的 FedEx 提示 */
export const extractCarrierAlerts = (data: any): CarrierAlert[] =>
  (Array.isArray(data?.alerts) ? data.alerts : [])
    .filter((a: any) => a && typeof a === 'object' && (a.code || a.message))
    .map((a: any) => ({
      code: a.code != null ? String(a.code) : null,
      alert_type: a.alert_type != null ? String(a.alert_type) : null,
      message: a.message != null ? String(a.message) : null,
    }))

// ------------------ 面单打印方式 ----------------------
/** A4 = 普通打印机；THERMAL = 热敏标签机（当普通打印机用，4×6 英寸 PDF）。文件格式看 image_type */
export type LabelFormat = 'A4' | 'THERMAL'
export const LABEL_FORMATS: LabelFormat[] = ['A4', 'THERMAL']
const LABEL_FORMAT_STORAGE_KEY = 'wms.carrierShipment.labelFormat'

/** 认识的打印方式（大小写不敏感），否则 null */
export const toLabelFormat = (value: unknown): LabelFormat | null => {
  const v = String(value ?? '').trim().toUpperCase()
  return (LABEL_FORMATS as string[]).includes(v) ? (v as LabelFormat) : null
}

/** 上次选的面单打印方式；没选过 / 取不到 / 不认识 → null（调用方再用后端默认，最后 A4） */
export const loadLabelFormat = (): LabelFormat | null => {
  try {
    return toLabelFormat(localStorage.getItem(LABEL_FORMAT_STORAGE_KEY))
  } catch {
    // 无痕模式等取不到 localStorage
    return null
  }
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

/** PNG 面单后端也存成 PDF */
const isPdfImageType = (imageType: string | null | undefined): boolean =>
  ['PDF', 'PNG'].includes(String(imageType || 'PDF').toUpperCase())

export const isPdfLabel = (shipment: CarrierShipment | null | undefined): boolean => isPdfImageType(labelImageTypeOf(shipment))

/** 某个打印方式建单后会得到的文件格式（按状态里的 label_formats，没有时按 PDF） */
export const labelFormatImageType = (status: CarrierShipmentStatus | null | undefined, format: string): string =>
  String(status?.label_formats?.[format]?.image_type || 'PDF').toUpperCase()

/**
 * PDF 面单的打印提示：热敏 = 选标签机、100×150mm、实际大小；A4 = A4 纸、实际大小（100%），运单副本页一起打印。
 * 条码按原尺寸打印最稳，不建议缩放。
 * 指令文件（ZPL / EPL）返回 null（另有提示）。
 */
export const labelPrintHintKey = (format: string | null | undefined, imageType: string | null | undefined): string | null => {
  if (!isPdfImageType(imageType)) return null
  return String(format || '').toUpperCase() === 'THERMAL' ? 'customs.carrier.tips.thermal-print' : 'customs.carrier.tips.a4-print'
}

/** 面单 PDF 里是否含国际件的 AWB 副本页（AUXILIARY） */
export const hasAuxiliaryLabel = (shipment: CarrierShipment | null | undefined): boolean =>
  (shipment?.label_parts || []).some((p) => String(p?.content_type || '').toUpperCase() === 'AUXILIARY')

export const labelFileExtension = (imageType: string): string =>
  LABEL_FILE_EXTENSIONS[String(imageType).toUpperCase()] || String(imageType).toLowerCase() || 'bin'

/** 有效运单的面单文档（取文件用）；没有面单返回 null */
export const labelDocumentOf = (shipment: CarrierShipment | null | undefined): PdfDocumentRef | null => {
  if (!isActiveShipment(shipment) || !shipment.label_document_id) return null
  const ext = isPdfLabel(shipment) ? 'pdf' : labelFileExtension(labelImageTypeOf(shipment))
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
 * 从错误 details 里取出承运商的错误原文、交易 ID、动作等。
 * 兼容 errors / carrier_errors / fedex_errors，transaction_id / transactionId。
 */
export const extractCarrierErrors = (details: any): {
  errors: CarrierApiErrorItem[]
  transactionId: string | null
  action: string | null
  permissionDenied: boolean
  /** 超时时 FedEx 侧可能已经处理（默认按可能已处理） */
  maybeProcessed: boolean
} => {
  if (!details || typeof details !== 'object') {
    return { errors: [], transactionId: null, action: null, permissionDenied: false, maybeProcessed: true }
  }
  const raw = [details.errors, details.carrier_errors, details.fedex_errors].find((v) => Array.isArray(v)) || []
  const errors: CarrierApiErrorItem[] = (raw as any[])
    .map((e) =>
      e && typeof e === 'object'
        ? { code: e.code != null ? String(e.code) : null, message: e.message != null ? String(e.message) : null }
        : { code: null, message: e != null ? String(e) : null }
    )
    .filter((e) => e.code || e.message)
  const tid = details.transaction_id ?? details.transactionId ?? details.carrier_transaction_id ?? null
  return {
    errors,
    transactionId: tid != null && tid !== '' ? String(tid) : null,
    action: details.action ? String(details.action) : null,
    permissionDenied: !!details.permission_denied,
    maybeProcessed: details.maybe_processed !== false,
  }
}

/** 承运商超时（后端 504 / 16074） */
export const isCarrierTimeout = (error: HttpRequestError | null | undefined): boolean =>
  !!error && (error.status === 504 || error.code === CARRIER_BIZ_CODES.CARRIER_TIMEOUT)

/**
 * 随 FedEx 运单提交（或自动建单时将提交）的申告价额与报关快照不同时，返回实际值（null = 不提交申告价额）；
 * 相同或无从判断时返回 undefined（照快照显示）。
 */
export const carrierDeclaredValueOverride = (status: CarrierShipmentStatus | null | undefined): number | null | undefined => {
  if (!status?.enabled) return undefined
  const snapshot = toNumberOrNull(status.declared_value_carriage)
  const shipment = status.shipment
  if (isActiveShipment(shipment)) {
    if (shipment.declared_value === undefined) return undefined
    const applied = toNumberOrNull(shipment.declared_value)
    return applied !== snapshot ? applied : undefined
  }
  const capped = (status.warnings || []).find((w) => w.code === 'DECLARED_VALUE_CAPPED')
  return capped ? (capped.applied ?? null) : undefined
}

/** 申告价额提示的模式：manual=手工建单时填写；auto=自动建单会随运单提交；submitted=已随运单提交 */
export type DeclaredValueMode = 'manual' | 'auto' | 'submitted'

export const declaredValueModeOf = (status: CarrierShipmentStatus | null | undefined): DeclaredValueMode => {
  if (!status?.enabled) return 'manual'
  return isActiveShipment(status.shipment) ? 'submitted' : 'auto'
}
