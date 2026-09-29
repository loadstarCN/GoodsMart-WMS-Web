/**
 * 海外出荷単証（商业发票 CI / 装箱单 PL）相关的类型与工具
 *
 * 通用 httpRequest 只解析 JSON，PDF 必须直接用 authFetch 取二进制（blob）。
 * 服务端代理 server/api/[...].ts 会原样透传 Content-Type 与 X-Content-SHA256。
 */
import { authFetch } from '~/composables/auth/authFetch'
import type { HttpRequestError } from '~/utils/http'
import { useBizError } from '~/utils/bizError'
import { showToast } from '~/utils/toast'

export type CustomsDocType = 'commercial_invoice' | 'packing_list'

export interface CustomsDocumentMeta {
  id: number
  dn_id: number
  doc_type: CustomsDocType
  version: number
  document_number: string | null
  invoice_date: string | null
  issued_at: string | null
  issued_by: any
  status: 'issued' | 'void'
  sha256: string | null
  size_bytes: number | null
  file_name: string | null
  voided_at: string | null
  void_reason: string | null
}

export interface CustomsPackage {
  id?: number
  package_no: number
  gross_weight_kg: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  remark?: string | null
}

export interface CustomsProblem {
  code: string
  level: 'error' | 'warning'
  goods_code?: string | null
  field?: string | null
  message?: string | null
}

export interface CustomsLine {
  goods_id: number | null
  goods_code: string
  goods_name: string | null
  planned_quantity: number | null
  packed_quantity: number | null
  unit_value: number | null
  amount: number | null
  description_en: string | null
  hs_code: string | null
  /** 后端格式化好的 HS（如 9503.00），没有时前端自行格式化 */
  hs_code_formatted?: string | null
  /** 日本输出统计品目番号（9 位；只显示，不印在单证上） */
  jp_export_code?: string | null
  origin_country: string | null
  origin_source?: string | null
}

export interface CustomsTotals {
  quantity: number | null
  goods_value: number | null
  freight: number | null
  /** 运送保险费（没投保为 0；invoice_total = goods_value + freight + insurance） */
  insurance?: number | null
  invoice_total: number | null
  package_count: number | null
  gross_weight_kg: number | null
  net_weight_kg: number | null
}

export interface CustomsView {
  dn_id: number
  is_export: boolean
  locked: boolean
  customs: Record<string, any> | null
  lines: CustomsLine[]
  packages: CustomsPackage[]
  totals: CustomsTotals | null
  exporter: Record<string, any> | null
  problems: CustomsProblem[]
  ready: boolean
  current_documents: CustomsDocumentMeta[]
  /** 当前单证与最新数据（如新存的运单号）不一致，需要重新生成 */
  documents_outdated?: boolean
  /** 后端解析好的发票号 / 收货国 / 收货人（快照优先，没有则退回 DN） */
  invoice_number?: string | null
  recipient_country?: string | null
  consignee?: Record<string, any> | null
}

/** DN 发货后（及之后的状态）单证与箱子只读 */
export const DN_LOCKED_STATUSES = ['delivered', 'completed', 'closed']
/** 可以录箱子的 DN 状态 */
export const DN_PACKAGE_EDITABLE_STATUSES = ['picked', 'packed']

export const customsDocumentFileUrl = (dnId: number | string, docId: number | string) =>
  `/api/warehouse/dn/${dnId}/customs-documents/${docId}/file`

/** HS 编码显示成 9503.00 / 9503.00.1000 形式（只做显示，不改数据） */
export const formatHsCode = (hs: string | null | undefined): string => {
  if (!hs) return ''
  const digits = String(hs).replace(/[.\s-]/g, '')
  if (!/^\d+$/.test(digits) || digits.length < 6) return String(hs)
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}${digits.length > 6 ? '.' + digits.slice(6) : ''}`
}

/** 字节数显示 */
export const formatBytes = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return ''
  const v = Number(n)
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

/** 金额显示（币种代码 + 千分位；JPY 无小数） */
export const formatMoney = (value: number | null | undefined, currency?: string | null): string => {
  if (value === null || value === undefined || value === ('' as any) || isNaN(Number(value))) return '—'
  const cur = (currency || 'JPY').toUpperCase()
  const digits = cur === 'JPY' || cur === 'KRW' ? 0 : 2
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      currencyDisplay: 'code',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(value))
  } catch {
    return `${cur} ${Number(value).toLocaleString()}`
  }
}

/** 含非拉丁（非 ASCII 可打印）字符时返回 true —— 单证上只给警告，不拦截 */
export const hasNonAscii = (text: string | null | undefined): boolean =>
  !!text && /[^\x20-\x7E]/.test(String(text))

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

export interface FetchedPdf {
  blob: Blob
  fileName: string
  sha256: string | null
  /** true=校验通过；false=不一致；null=浏览器不支持校验（非安全上下文等） */
  verified: boolean | null
}

/**
 * 取单证 PDF（authFetch → 二进制）。
 * 失败时抛出 HttpRequestError（含后端业务码）。
 */
export const fetchCustomsPdf = async (
  dnId: number | string,
  doc: Pick<CustomsDocumentMeta, 'id' | 'sha256' | 'file_name'>
): Promise<FetchedPdf> => {
  let res: Response
  try {
    // 不指定 Accept：出错时后端照常返回 JSON 错误体
    res = await authFetch(customsDocumentFileUrl(dnId, doc.id), { method: 'GET' })
  } catch (e) {
    const err: HttpRequestError = { status: -1, message: e instanceof Error ? e.message : 'Unknown error' }
    throw err
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const err: HttpRequestError = {
      status: res.status,
      message: body?.message || `Request failed (${res.status})`,
    }
    if (body?.code !== undefined) err.code = body.code
    if (body?.details !== undefined) err.details = body.details
    throw err
  }

  // 代理（server/api/[...].ts → h3 proxyRequest）原样透传 Content-Type / X-Content-SHA256
  const contentType = (res.headers.get('Content-Type') || '').toLowerCase()
  if (contentType && !contentType.includes('application/pdf')) {
    const body = contentType.includes('json') ? await res.json().catch(() => null) : null
    const err: HttpRequestError = { status: res.status, message: body?.message || `Unexpected content type: ${contentType}` }
    if (body?.code !== undefined) err.code = body.code
    throw err
  }

  const buf = await res.arrayBuffer()
  const headerSha = res.headers.get('X-Content-SHA256')
  const expected = (headerSha || doc.sha256 || '').trim().toLowerCase() || null

  let verified: boolean | null = null
  if (expected && typeof crypto !== 'undefined' && crypto?.subtle) {
    try {
      verified = toHex(await crypto.subtle.digest('SHA-256', buf)) === expected
    } catch {
      verified = null
    }
  }

  return {
    blob: new Blob([buf], { type: 'application/pdf' }),
    fileName: doc.file_name || `document-${doc.id}.pdf`,
    sha256: expected,
    verified,
  }
}

const revokeLater = (url: string, ms = 10 * 60 * 1000) => {
  setTimeout(() => URL.revokeObjectURL(url), ms)
}

/**
 * 用隐藏 iframe 打开 PDF 并调起打印；浏览器不允许时退回到新窗口打开。
 */
export const printPdfBlob = (blob: Blob): void => {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  iframe.src = url
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        window.open(url, '_blank', 'noopener')
      }
    }, 300)
  }
  document.body.appendChild(iframe)
  // 打印对话框关闭后再清理（打印过程中不能移除）
  setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, 10 * 60 * 1000)
}

/**
 * 在新窗口查看 PDF。
 * 为避免弹窗拦截：调用方先同步 window.open('') 拿到窗口，取到 PDF 后再导航。
 */
export const showPdfInWindow = (blob: Blob, win: Window | null): void => {
  const url = URL.createObjectURL(blob)
  if (win && !win.closed) {
    win.location.href = url
  } else {
    window.open(url, '_blank')
  }
  revokeLater(url)
}

/** 以文件名下载 PDF */
export const downloadPdfBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  revokeLater(url, 60 * 1000)
}

/** 从文档列表里挑出当前有效的 CI / PL（同类型取最高版本） */
export const pickCurrentDocument = (
  docs: CustomsDocumentMeta[] | null | undefined,
  type: CustomsDocType
): CustomsDocumentMeta | null => {
  const list = (docs || []).filter((d) => d.doc_type === type && d.status !== 'void')
  if (list.length === 0) return null
  return list.reduce((a, b) => (Number(b.version) > Number(a.version) ? b : a))
}

/** 文档列表接口可能直接返回数组，也可能包一层（items / documents） */
export const normalizeDocumentList = (data: any): CustomsDocumentMeta[] => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.documents)) return data.documents
  return []
}

/**
 * 查看 / 打印 / 下载单证 PDF 的页面动作（统一处理错误提示与校验）
 */
export const useCustomsPdfActions = () => {
  const { t } = useI18n()
  const { bizErrorMessage } = useBizError()
  /** 正在处理的文档 id（按钮转圈用） */
  const busyDocId = ref<number | null>(null)

  const load = async (dnId: number | string, doc: CustomsDocumentMeta): Promise<FetchedPdf | null> => {
    busyDocId.value = doc.id
    try {
      const pdf = await fetchCustomsPdf(dnId, doc)
      if (pdf.verified === false) {
        showToast(t('customs.tips.pdf-checksum-mismatch'), 'error')
        return null
      }
      return pdf
    } catch (e) {
      showToast(bizErrorMessage(e as HttpRequestError), 'error')
      return null
    } finally {
      busyDocId.value = null
    }
  }

  const printDoc = async (dnId: number | string, doc: CustomsDocumentMeta | null) => {
    if (!doc) return
    const pdf = await load(dnId, doc)
    if (pdf) printPdfBlob(pdf.blob)
  }

  const viewDoc = async (dnId: number | string, doc: CustomsDocumentMeta | null) => {
    if (!doc) return
    // 先同步开窗，避免异步取数后被弹窗拦截
    const win = window.open('', '_blank')
    const pdf = await load(dnId, doc)
    if (pdf) {
      showPdfInWindow(pdf.blob, win)
    } else if (win) {
      win.close()
    }
  }

  const downloadDoc = async (dnId: number | string, doc: CustomsDocumentMeta | null) => {
    if (!doc) return
    const pdf = await load(dnId, doc)
    if (pdf) downloadPdfBlob(pdf.blob, pdf.fileName)
  }

  return { busyDocId, printDoc, viewDoc, downloadDoc }
}
