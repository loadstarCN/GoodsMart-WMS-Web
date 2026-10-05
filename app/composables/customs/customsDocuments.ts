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

/** 含非 ASCII 可打印字符时返回 true（商品英文品名：后端 is_ascii_text 只认 ASCII 可打印字符） */
export const hasNonAscii = (text: string | null | undefined): boolean =>
  !!text && /[^\x20-\x7E]/.test(String(text))

/**
 * 拉丁字符：与后端 warehouse/dn/customs_services.py 的 _is_latin_char 一致——
 * U+0000–U+024F（ASCII 含换行等控制字符、Latin-1 补充、Latin 扩展 A·B）、U+1E00–U+1EFF（Latin 扩展附加）、
 * U+2000–U+206F（常用标点），以及 €、™
 */
const isLatinChar = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0
  return code < 0x250 || (code >= 0x1e00 && code <= 0x1eff) || (code >= 0x2000 && code <= 0x206f) || ch === '€' || ch === '™'
}

/**
 * 含非拉丁字符时返回 true（公司 / 仓库出口资料：与后端 has_non_latin 一致，Müller、é、换行都不算）——只给警告，不拦截
 */
export const hasNonLatin = (text: string | null | undefined): boolean => {
  if (!text) return false
  // for...of 按码点遍历（与 Python 逐字符一致，代理对不会被拆开）
  for (const ch of String(text)) {
    if (!isLatinChar(ch)) return true
  }
  return false
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

/** 取 PDF 所需的最少信息（单证 meta，或只知道 id 的面单等 dn_documents 文档） */
export type PdfDocumentRef = Pick<CustomsDocumentMeta, 'id' | 'sha256' | 'file_name'>

export interface FetchedPdf {
  blob: Blob
  fileName: string
  sha256: string | null
  /** true=校验通过；false=不一致；null=浏览器不支持校验（非安全上下文等） */
  verified: boolean | null
}

/**
 * 取单证 / 面单文件（authFetch → 二进制）。
 * pdf=true（默认）只接受 application/pdf；pdf=false 接受任意文件（热敏面单的 ZPL / EPL 指令文件等），JSON 视为错误体。
 * 失败时抛出 HttpRequestError（含后端业务码）。
 */
export const fetchDocumentFile = async (
  dnId: number | string,
  doc: PdfDocumentRef,
  pdf = true
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
  if (contentType && (pdf ? !contentType.includes('application/pdf') : contentType.includes('json'))) {
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
    blob: new Blob([buf], { type: pdf ? 'application/pdf' : (contentType || 'application/octet-stream') }),
    fileName: doc.file_name || `document-${doc.id}.pdf`,
    sha256: expected,
    verified,
  }
}

/** 取单证 PDF */
export const fetchCustomsPdf = (dnId: number | string, doc: PdfDocumentRef): Promise<FetchedPdf> =>
  fetchDocumentFile(dnId, doc, true)

const revokeLater = (url: string, ms = 10 * 60 * 1000) => {
  setTimeout(() => URL.revokeObjectURL(url), ms)
}

/**
 * 用隐藏 iframe 打开 PDF 并调起打印。
 * 浏览器不允许在 iframe 里打印（print() 抛错、iframe 没加载出来）时改为直接下载，并调用 onFallback 让调用方提示用户——
 * 这里已在异步回调里，再 window.open 会被弹窗拦截（noopener 时返回值还恒为 null，无从判断），所以不再开新窗口。
 */
export const printPdfBlob = (blob: Blob, fileName: string, onFallback?: () => void): void => {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  let settled = false
  const fallback = () => {
    if (settled) return
    settled = true
    downloadPdfBlob(blob, fileName)
    onFallback?.()
  }
  iframe.onload = () => {
    setTimeout(() => {
      if (settled) return
      try {
        const frameWindow = iframe.contentWindow
        if (!frameWindow) throw new Error('iframe has no window')
        frameWindow.focus()
        frameWindow.print()
        settled = true
      } catch {
        fallback()
      }
    }, 300)
  }
  iframe.onerror = fallback
  iframe.src = url
  document.body.appendChild(iframe)
  // iframe 一直没加载出来（浏览器不在页面内显示 PDF 等）：同样改为下载
  setTimeout(() => {
    if (!settled) fallback()
  }, 15 * 1000)
  // 打印对话框关闭后再清理（打印过程中不能移除）
  setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, 10 * 60 * 1000)
}

/**
 * 在新窗口查看 PDF；打开不了时改为直接下载。返回 'window'（已在新窗口打开）或 'downloaded'（已改为下载）。
 * 为避免弹窗拦截：调用方先同步 window.open('') 拿到窗口，取到 PDF 后再导航；
 * 预开的窗口被拦截（null）或已被关掉时再试一次 window.open（不带 noopener，返回值才可判断），仍失败就下载。
 */
export const showPdfInWindow = (blob: Blob, win: Window | null, fileName: string): 'window' | 'downloaded' => {
  const url = URL.createObjectURL(blob)
  let opened = false
  if (win && !win.closed) {
    try {
      win.location.href = url
      opened = true
    } catch {
      opened = false
    }
  }
  if (!opened) {
    let retry: Window | null = null
    try {
      retry = window.open(url, '_blank')
    } catch {
      retry = null
    }
    opened = !!retry
  }
  if (!opened) {
    URL.revokeObjectURL(url)
    downloadPdfBlob(blob, fileName)
    return 'downloaded'
  }
  revokeLater(url)
  return 'window'
}

/** 以文件名下载（PDF，或热敏面单等其他文件） */
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

/**
 * 文档是不是 PDF（按文件名扩展名，与后端 DNDocument.content_type 一致）：
 * 历史版本里可能有热敏面单的 ZPL / EPL 指令文件，要用 downloadRawDoc 下载，不能按 PDF 查看 / 打印。
 * 没有文件名时按 PDF（CI / PL 都是 PDF）。
 */
export const isPdfDocument = (doc: { file_name?: string | null } | null | undefined): boolean => {
  const name = String(doc?.file_name || '').trim().toLowerCase()
  if (!name || !name.includes('.')) return true
  return name.endsWith('.pdf')
}

/**
 * 签发人 / 建单人显示：后端目前只返回用户 id（issued_by / created_by 是整数，没有用户名），显示为「用户 #id」；
 * 以后后端给出对象（user_name / email）时显示名字。
 */
export const formatUserRef = (u: any, t: (...args: any[]) => string): string => {
  if (u === null || u === undefined || u === '') return ''
  if (typeof u === 'object') {
    const name = u.user_name || u.email
    if (name) return String(name)
    return u.id !== null && u.id !== undefined ? t('common.users.user-ref', { id: u.id }) : ''
  }
  return t('common.users.user-ref', { id: u })
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
 * 查看 / 打印 / 下载单证（及面单）PDF 的页面动作（统一处理错误提示与校验）
 */
export const useCustomsPdfActions = () => {
  const { t } = useI18n()
  const { bizErrorMessage } = useBizError()
  /** 正在处理的文档 id（按钮转圈用） */
  const busyDocId = ref<number | null>(null)

  const load = async (dnId: number | string, doc: PdfDocumentRef, pdfOnly = true): Promise<FetchedPdf | null> => {
    busyDocId.value = doc.id
    try {
      const pdf = await fetchDocumentFile(dnId, doc, pdfOnly)
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

  const printDoc = async (dnId: number | string, doc: PdfDocumentRef | null) => {
    if (!doc) return
    const pdf = await load(dnId, doc)
    // 浏览器不能直接打印时已改为下载：提示用户打开下载的文件再打印
    if (pdf) printPdfBlob(pdf.blob, pdf.fileName, () => showToast(t('customs.tips.print-fallback-downloaded'), 'warning'))
  }

  const viewDoc = async (dnId: number | string, doc: PdfDocumentRef | null) => {
    if (!doc) return
    // 先同步开窗，避免异步取数后被弹窗拦截（被拦截时为 null，取到文件后再试，仍不行就下载）
    let win: Window | null = null
    try {
      win = window.open('', '_blank')
    } catch {
      win = null
    }
    const pdf = await load(dnId, doc)
    if (pdf) {
      if (showPdfInWindow(pdf.blob, win, pdf.fileName) === 'downloaded') {
        showToast(t('customs.tips.popup-blocked-downloaded'), 'warning')
      }
    } else if (win && !win.closed) {
      win.close()
    }
  }

  const downloadDoc = async (dnId: number | string, doc: PdfDocumentRef | null) => {
    if (!doc) return
    const pdf = await load(dnId, doc)
    if (pdf) downloadPdfBlob(pdf.blob, pdf.fileName)
  }

  /** 下载任意格式的文件（热敏面单的 ZPL / EPL 等，不做 PDF 类型检查） */
  const downloadRawDoc = async (dnId: number | string, doc: PdfDocumentRef | null) => {
    if (!doc) return
    const file = await load(dnId, doc, false)
    if (file) downloadPdfBlob(file.blob, file.fileName)
  }

  return { busyDocId, printDoc, viewDoc, downloadDoc, downloadRawDoc, fetchFile: load }
}
