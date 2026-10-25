/**
 * 运单的文件方式（waybill_method = file，后端 doc/shipping-flow.md §6.1）与运单服务选项（§6.4）
 *
 * 没有 API 合同也能出运单：按承运商软件的导入格式导出 CSV → 在承运商软件里打单 → 把带运单号的 CSV 导回，
 * 按导出时写进「お客様管理番号」类列的 DN{dn.id} 匹配出库单。
 * - GET  /carrier/file-presets → 预设清单（承运商编辑页选格式；account_fields 是账号项，columns 是导出的列）
 * - POST /dn/carrier-files/export {carrier_id, dn_ids, warehouse_id?} → 文件下载（文件名在 Content-Disposition）；
 *   有问题的行整批不导出：409 16137，details.rows = [{dn_id, order_number, problems: [{column, code, message}]}]
 * - POST /dn/carrier-files/import（multipart：file、carrier_id、dry_run、warehouse_id?）→ 逐行结果；
 *   dry_run = true 只预览，确认后以 dry_run = false 提交（只写 matched 的行）
 * - 文件方式用不了：16138。409 = 承运商不是文件方式 / 没有可用的模板 / 模板不能导入（field carrier_id）、必填账号项没填
 *   （field file_account.<key>）；400 = 请求不合法（carrier_id / dn_ids / warehouse_id / dry_run）或导入文件没有 / 为空 /
 *   超过 5 MB / 读不了（field file）。文案见 utils/bizError.ts
 * - POST /dn/<id>/carrier-shipment/discard-export → 作废导出记录（只改本地）；没有已导出的记录 409 16075
 * - GET  /dn/carrier-files/batches?carrier_id=&warehouse_id= → 最近的导出 / 导入批次
 * - GET / PUT /dn/<id>/shipping-options {options} → {options, values, schema, defaults, locked, locked_reason,
 *   locked_message}；选项不合法 400 16139（field = options.<key>）；建运单 / 导出后锁定：409 16076（details.reason
 *   SHIPPING_OPTIONS_LOCKED），已发货 409 16065
 */
import { httpRequest, type HttpRequestError } from '~/utils/http'
import { downloadFile } from '~/utils/download'

/** 后端给的多语言文字：{en-US, zh-CN, ja-JP}，也可能直接是字符串 */
export type LocalizedText = Record<string, string | null | undefined> | string | null | undefined

/**
 * 按界面语言（iso：en-US / zh-CN / ja-JP）取文字：同 iso → 同语言（前两位）→ en-US → 第一个有值的
 */
export const localizedText = (text: LocalizedText, iso?: string | null): string => {
  if (text === null || text === undefined) return ''
  if (typeof text === 'string') return text
  if (typeof text !== 'object') return String(text)
  const lang = String(iso || '').slice(0, 2).toLowerCase()
  const entries = Object.entries(text).filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
  const exact = entries.find(([k]) => k === iso)
  if (exact) return String(exact[1])
  const sameLang = entries.find(([k]) => k.slice(0, 2).toLowerCase() === lang)
  if (sameLang) return String(sameLang[1])
  const en = entries.find(([k]) => k === 'en-US' || k.slice(0, 2).toLowerCase() === 'en')
  if (en) return String(en[1])
  return entries.length ? String(entries[0]![1]) : ''
}

// ------------------ 运单服务选项（配送日、时间带、代收货款……） ----------------------
export type ServiceOptionKind = 'select' | 'date' | 'money' | 'text'

export interface ServiceOptionValue {
  value: string
  label: LocalizedText
}

export interface ServiceOption {
  key: string
  kind: ServiceOptionKind
  label: LocalizedText
  /** select 的可选值 */
  values?: ServiceOptionValue[]
  /** 没设时用的值（导出 / 建单时） */
  default?: string | null
  help?: LocalizedText
  /** text 的最大长度 */
  max_length?: number | null
}

/** 运单一步的 summary.options：当前值、按当前承运商声明的选项、默认值、是否已锁定（已建运单 / 已导出 / 已发货）及原因 */
export interface ShippingOptionsState {
  values: Record<string, any>
  schema: ServiceOption[]
  /** 各选项的默认值（声明了 default 的），导出 / 建单时没设的用它 */
  defaults: Record<string, any>
  locked: boolean
  /** 锁定原因码：WAYBILL_EXISTS（已建运单 / 已导出）/ DN_SHIPPED（已发货）；没锁为 null */
  locked_reason: string | null
  /** 锁定原因的后端原文（英文） */
  locked_message: string | null
}

const OPTION_KINDS: ServiceOptionKind[] = ['select', 'date', 'money', 'text']

export const normalizeServiceOptions = (data: unknown): ServiceOption[] =>
  (Array.isArray(data) ? data : [])
    .filter((o: any) => o && typeof o === 'object' && o.key)
    .map((o: any) => ({
      key: String(o.key),
      kind: (OPTION_KINDS as string[]).includes(String(o.kind)) ? (o.kind as ServiceOptionKind) : 'text',
      label: o.label ?? o.key,
      values: Array.isArray(o.values)
        ? o.values.filter((v: any) => v && typeof v === 'object' && v.value !== undefined && v.value !== null)
          .map((v: any) => ({ value: String(v.value), label: v.label ?? v.value }))
        : undefined,
      default: o.default === null || o.default === undefined || o.default === '' ? null : String(o.default),
      help: o.help ?? null,
      max_length: o.max_length === null || o.max_length === undefined || isNaN(Number(o.max_length)) ? null : Number(o.max_length),
    }))

/** summary.options → 状态；没有或不是对象时 null（这家承运商没有选项） */
export const normalizeShippingOptions = (data: any): ShippingOptionsState | null => {
  if (!data || typeof data !== 'object') return null
  const values = data.values ?? data.options
  return {
    values: values && typeof values === 'object' ? { ...values } : {},
    schema: normalizeServiceOptions(data.schema),
    defaults: data.defaults && typeof data.defaults === 'object' ? { ...data.defaults } : {},
    locked: !!data.locked,
    locked_reason: data.locked_reason ? String(data.locked_reason) : null,
    locked_message: data.locked_message ? String(data.locked_message) : null,
  }
}

export const shippingOptionsUrl = (dnId: number | string) => `/api/warehouse/dn/${dnId}/shipping-options`

// ------------------ 预设 ----------------------
export interface FileAccountField {
  key: string
  label: LocalizedText
  required: boolean
  help?: LocalizedText
}

export interface FilePresetColumn {
  header: string
  required: boolean
  max_length: number | null
}

export interface CarrierFilePreset {
  /** 预设代码，如 jp.yamato_b2cloud */
  code: string
  name: LocalizedText
  country: string | null
  version: string | null
  notes: LocalizedText
  /** false：还没在承运商软件里实测导入过 */
  verified: boolean
  tracking_url_template: string | null
  service_options: ServiceOption[]
  account_fields: FileAccountField[]
  columns: FilePresetColumn[]
}

export const CARRIER_FILE_PRESETS_URL = '/api/warehouse/carrier/file-presets'

const toNumberOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v)

export const normalizeFilePresets = (data: unknown): CarrierFilePreset[] =>
  (Array.isArray(data) ? data : [])
    .filter((p: any) => p && typeof p === 'object' && p.code)
    .map((p: any) => ({
      code: String(p.code),
      name: p.name ?? p.code,
      country: p.country ? String(p.country).toUpperCase() : null,
      version: p.version === null || p.version === undefined || p.version === '' ? null : String(p.version),
      notes: p.notes ?? null,
      verified: p.verified === true,
      tracking_url_template: p.tracking_url_template ? String(p.tracking_url_template) : null,
      service_options: normalizeServiceOptions(p.service_options),
      account_fields: (Array.isArray(p.account_fields) ? p.account_fields : [])
        .filter((f: any) => f && typeof f === 'object' && f.key)
        .map((f: any) => ({ key: String(f.key), label: f.label ?? f.key, required: !!f.required, help: f.help ?? null })),
      columns: (Array.isArray(p.columns) ? p.columns : [])
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({ header: String(c.header ?? ''), required: !!c.required, max_length: toNumberOrNull(c.max_length) })),
    }))

/** 预设清单在一次会话里不变：读一次，之后共用（失败时下次再读）。旧后端没有这个接口（404）→ null */
let presetsPromise: Promise<CarrierFilePreset[] | null> | null = null
export const loadFilePresets = (): Promise<CarrierFilePreset[] | null> => {
  if (!presetsPromise) {
    presetsPromise = (async () => {
      let result: CarrierFilePreset[] | null = null
      let failed = false
      await httpRequest<any>(CARRIER_FILE_PRESETS_URL, {
        method: 'GET',
        onSuccess: (data) => {
          result = normalizeFilePresets(data)
        },
        onError: () => {
          failed = true
        },
      })
      if (failed) presetsPromise = null
      return result
    })()
  }
  return presetsPromise
}

// ------------------ 导出 ----------------------
export const CARRIER_FILES_EXPORT_URL = '/api/warehouse/dn/carrier-files/export'
export const CARRIER_FILES_IMPORT_URL = '/api/warehouse/dn/carrier-files/import'
export const CARRIER_FILES_BATCHES_URL = '/api/warehouse/dn/carrier-files/batches'
export const discardExportUrl = (dnId: number | string) => `/api/warehouse/dn/${dnId}/carrier-shipment/discard-export`

/** 文件业务码 */
export const CARRIER_FILE_BIZ_CODES = {
  /** 有行不能导出（逐行问题在 details.rows） */
  EXPORT_PROBLEMS: 16137,
  /** 文件方式用不了：409 承运商不是文件方式 / 模板不全 / 账号项没填；400 请求或导入文件不合法（见文件头说明） */
  FILE_UNAVAILABLE: 16138,
  /** 运单服务选项不合法（field = options.<key>） */
  OPTIONS_INVALID: 16139,
  /** 服务选项已锁定（details.reason = SHIPPING_OPTIONS_LOCKED：已建运单 / 已导出） */
  OPTIONS_LOCKED: 16076,
  /** DN 已发货（服务选项不能再改） */
  DN_SHIPPED: 16065,
  /** 作废导出时没有已导出的文件运单（别人已导回 / 作废） */
  NOTHING_TO_DISCARD: 16075,
} as const

export interface ExportProblem {
  column: string | null
  /** REQUIRED（必填为空）/ TOO_LONG（超长）/ UNENCODABLE（编码不了的字符）/ CHARACTER_NOT_ALLOWED（承运商软件不收的字） */
  code: string | null
  message: string | null
  /** 1 起的列号 */
  column_index?: number | null
  /** UNENCODABLE / CHARACTER_NOT_ALLOWED：有问题的字 */
  characters?: string[]
  /** TOO_LONG：实际长度、上限、单位（chars / sjis_bytes） */
  length?: number | null
  max_length?: number | null
  length_unit?: string | null
  /** 模板逐列的问题：这一列渲染出来的文字（改的时候对照用） */
  value?: string | null
}

export interface ExportProblemRow {
  dn_id: number | null
  order_number: string | null
  problems: ExportProblem[]
}

/**
 * 409 16137 的 details.rows → 逐行问题（没有时空数组）。problems[].code：DN 本身的（column 为空或 options.<key>）
 * DN_NOT_FOUND / OTHER_WAREHOUSE / NOT_PACKED / DN_SHIPPED / DN_CLOSED / NO_OPEN_TASK / CARRIER_NOT_SET / OTHER_CARRIER /
 * WAYBILL_EXISTS / TRACKING_NUMBER_EXISTS / OPTION_INVALID；模板逐列的（column 为列名，带 column_index）REQUIRED /
 * TOO_LONG / UNENCODABLE / CHARACTER_NOT_ALLOWED
 */
export const exportProblemRows = (error: HttpRequestError | null | undefined): ExportProblemRow[] => {
  const rows = error?.details?.rows
  return (Array.isArray(rows) ? rows : [])
    .filter((r: any) => r && typeof r === 'object')
    .map((r: any) => ({
      dn_id: toNumberOrNull(r.dn_id),
      order_number: r.order_number ? String(r.order_number) : null,
      problems: (Array.isArray(r.problems) ? r.problems : [])
        .filter((p: any) => p && typeof p === 'object')
        .map((p: any) => ({
          column: p.column === null || p.column === undefined ? null : String(p.column),
          code: p.code ? String(p.code) : null,
          message: p.message ? String(p.message) : null,
          column_index: toNumberOrNull(p.column_index),
          characters: (Array.isArray(p.characters) ? p.characters : []).map((c: unknown) => String(c)),
          length: toNumberOrNull(p.length),
          max_length: toNumberOrNull(p.max_length),
          length_unit: p.length_unit ? String(p.length_unit) : null,
          value: p.value === null || p.value === undefined || p.value === '' ? null : String(p.value),
        })),
    }))
}

export interface ExportRequest {
  carrier_id: number
  dn_ids: number[]
  warehouse_id?: number | null
}

/**
 * 导出承运商文件并下载。成功返回文件名；失败抛出 HttpRequestError（16137 时 details.rows 是逐行问题）。
 * 取文件、文件名、出错时的业务码见 utils/download.ts。
 */
export const exportCarrierFile = async (req: ExportRequest): Promise<string> => {
  const body: Record<string, any> = { carrier_id: req.carrier_id, dn_ids: req.dn_ids }
  if (req.warehouse_id !== null && req.warehouse_id !== undefined) body.warehouse_id = req.warehouse_id
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  return downloadFile(CARRIER_FILES_EXPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, `carrier-${req.carrier_id}-${stamp}.csv`)
}

// ------------------ 导入 ----------------------
export type ImportRowResult = 'matched' | 'not_found' | 'already_has_number' | 'same_number' | 'invalid'
export const IMPORT_RESULTS: ImportRowResult[] = ['matched', 'not_found', 'already_has_number', 'same_number', 'invalid']

export interface ImportRow {
  line: number | null
  reference: string | null
  dn_id: number | null
  order_number: string | null
  tracking_numbers: string[]
  result: ImportRowResult
  /**
   * 不是 matched 时的原因码（界面按它出本地化文字，没有对应文字时用 message）：
   * not_found → DN_NOT_FOUND / NOT_WMS_REFERENCE / NO_REFERENCE；invalid → NO_TRACKING_NUMBER / DN_CLOSED / OTHER_CARRIER /
   * NUMBER_OWNED_BY_OTHER_DN / API_SHIPMENT_UNRESOLVED / EXPORTED_FOR_OTHER_CARRIER / SHIPPED_WITHOUT_FILE_WAYBILL /
   * NO_OPEN_TASK；same_number → ALREADY_IMPORTED / ALREADY_SAVED；already_has_number → HAS_OTHER_NUMBER
   */
  reason_code: string | null
  /** 后端的英文说明（兜底） */
  message: string | null
  /** 拼文字用：DN 已有的 / 已属于别的 DN 的运单号 */
  existing_tracking_number: string | null
  /** 拼文字用：DN 的承运商 / 导出时的承运商（OTHER_CARRIER / EXPORTED_FOR_OTHER_CARRIER） */
  other_carrier: string | null
  /** 拼文字用：号码已属于的 DN（NUMBER_OWNED_BY_OTHER_DN） */
  other_dn_id: number | null
  /** 拼文字用：插件运单的状态（API_SHIPMENT_UNRESOLVED） */
  shipment_status: string | null
}

export type ImportSummary = Record<ImportRowResult, number>

export interface ImportResult {
  dry_run: boolean
  rows: ImportRow[]
  summary: ImportSummary
  batch_id: number | null
}

const IMPORT_RESULT_COLORS: Record<ImportRowResult, string> = {
  matched: 'success',
  not_found: 'danger',
  already_has_number: 'warning',
  same_number: 'secondary',
  invalid: 'danger',
}
export const importResultColor = (result: string): string => IMPORT_RESULT_COLORS[result as ImportRowResult] || 'light'

export const normalizeImportResult = (data: any): ImportResult => {
  const rows: ImportRow[] = (Array.isArray(data?.rows) ? data.rows : [])
    .filter((r: any) => r && typeof r === 'object')
    .map((r: any) => ({
      line: toNumberOrNull(r.line),
      reference: r.reference === null || r.reference === undefined || r.reference === '' ? null : String(r.reference),
      dn_id: toNumberOrNull(r.dn_id),
      order_number: r.order_number ? String(r.order_number) : null,
      tracking_numbers: (Array.isArray(r.tracking_numbers) ? r.tracking_numbers : [])
        .filter((x: unknown) => x !== null && x !== undefined && x !== '').map((x: unknown) => String(x)),
      result: ((IMPORT_RESULTS as string[]).includes(String(r.result)) ? r.result : 'invalid') as ImportRowResult,
      reason_code: r.reason_code ? String(r.reason_code) : null,
      message: r.message ? String(r.message) : null,
      existing_tracking_number: r.existing_tracking_number ? String(r.existing_tracking_number) : null,
      other_carrier: r.other_carrier ? String(r.other_carrier) : null,
      other_dn_id: toNumberOrNull(r.other_dn_id),
      shipment_status: r.shipment_status ? String(r.shipment_status) : null,
    }))
  const summary = {} as ImportSummary
  for (const key of IMPORT_RESULTS) {
    const given = toNumberOrNull(data?.summary?.[key])
    summary[key] = given ?? rows.filter((r) => r.result === key).length
  }
  return {
    dry_run: data?.dry_run === true || data?.dry_run === 'true',
    rows,
    summary,
    batch_id: toNumberOrNull(data?.batch_id),
  }
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * 导入预览一行的说明：有 reason_code 且有对应文字时按界面语言拼（shipping.file.import-reasons.<code>），
 * 否则用后端的英文 message（旧后端没有 reason_code）
 */
export const importRowMessage = (row: ImportRow, t: Translate, te: (key: string) => boolean): string => {
  const key = row.reason_code ? `shipping.file.import-reasons.${row.reason_code}` : ''
  if (!key || !te(key)) return row.message || ''
  const number = row.existing_tracking_number || row.tracking_numbers[0] || '—'
  return t(key, {
    number,
    reference: row.reference || '—',
    carrier: row.other_carrier || t('shipping.file.import-reasons.another-carrier'),
    dn: row.other_dn_id ?? '—',
    status: row.shipment_status || '—',
  })
}

export interface ImportRequest {
  file: File
  carrier_id: number
  dry_run: boolean
  warehouse_id?: number | null
}

/** 上传导入文件；成功返回逐行结果，失败调用 onError（16138 文件不对 / 承运商不是文件方式） */
export const importCarrierFile = async (
  req: ImportRequest,
  onError: (error: HttpRequestError) => void,
): Promise<ImportResult | null> => {
  const body = new FormData()
  body.append('file', req.file)
  body.append('carrier_id', String(req.carrier_id))
  body.append('dry_run', req.dry_run ? 'true' : 'false')
  if (req.warehouse_id !== null && req.warehouse_id !== undefined) body.append('warehouse_id', String(req.warehouse_id))
  let result: ImportResult | null = null
  await httpRequest<any>(CARRIER_FILES_IMPORT_URL, {
    method: 'POST',
    body,
    onSuccess: (data) => {
      result = normalizeImportResult(data)
    },
    onError,
  })
  return result
}

/** 选承运商用（列表页的批量导入：文件方式的承运商） */
export interface FileCarrierOption {
  id: number
  name: string
}

// ------------------ 批次 ----------------------
export interface CarrierFileBatch {
  id: number
  kind: 'export' | 'import'
  file_name: string | null
  row_count: number | null
  summary: Record<string, any> | null
  created_at: string | null
  created_by: any
}

export const normalizeFileBatches = (data: unknown): CarrierFileBatch[] => {
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray((data as any).items) ? (data as any).items : [])
  return list
    .filter((b: any) => b && typeof b === 'object' && b.id !== undefined)
    .map((b: any) => ({
      id: Number(b.id),
      kind: b.kind === 'import' ? 'import' : 'export',
      file_name: b.file_name ? String(b.file_name) : null,
      row_count: toNumberOrNull(b.row_count),
      summary: b.summary && typeof b.summary === 'object' ? b.summary : null,
      created_at: b.created_at ? String(b.created_at) : null,
      // 后端：created_by = 用户 id，created_by_user = {id, user_name}（显示用户名）
      created_by: b.created_by_user ?? b.created_by ?? null,
    }))
}

// ------------------ 运单一步：导出记录 ----------------------
export interface FileExportInfo {
  /** 导出时刻 */
  exported_at: string | null
  batch_id: number | null
  file_name: string | null
  /** 第几次导出（重新导出会加一）；旧后端没有 */
  export_count: number | null
  exported_by: any
}

/**
 * 运单一步的导出信息（已导出、等导回运单号）：summary.export {exported_at, batch_id, file_name, export_count, exported_by}
 * （后端只在 file 运单 status = exported 时给，否则 null）；没有时看 summary.shipment（status = exported 的 file 运单：
 * file_batch_id、file.exported_at）
 */
export const fileExportInfoOf = (summary: Record<string, any> | null | undefined): FileExportInfo | null => {
  const s = summary || {}
  const exp = s.export && typeof s.export === 'object' ? s.export : null
  if (exp) {
    return {
      exported_at: exp.exported_at || null,
      batch_id: toNumberOrNull(exp.batch_id),
      file_name: exp.file_name ? String(exp.file_name) : null,
      export_count: toNumberOrNull(exp.export_count),
      exported_by: exp.exported_by ?? null,
    }
  }
  const shipment = s.shipment && typeof s.shipment === 'object' ? s.shipment : null
  if (!shipment || shipment.status !== 'exported') return null
  return {
    exported_at: shipment.file?.exported_at || shipment.updated_at || shipment.created_at || null,
    batch_id: toNumberOrNull(shipment.file_batch_id),
    file_name: null,
    export_count: toNumberOrNull(shipment.file?.export_count),
    exported_by: shipment.created_by_user ?? null,
  }
}

/** 导出后的文件运单（status = exported，没有运单号，等导回）：不是「已取消」 */
export const isExportedShipment = (shipment: { status?: string | null } | null | undefined): boolean =>
  !!shipment && shipment.status === 'exported'
