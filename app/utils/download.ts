/**
 * 从后端下载文件（承运商文件导出、商品导入模板……）：通用 httpRequest 只解析 JSON，文件要直接用 authFetch 取二进制。
 * 文件名取 Content-Disposition；后端出错时照常返回 JSON（业务码 code / details / field），整理成 HttpRequestError 抛出。
 */
import type { HttpRequestError } from '~/utils/http'
import { authFetch } from '~/composables/auth/authFetch'

/** Content-Disposition 里的文件名（filename*=UTF-8''… 优先，其次 filename="…"）；没有时 null */
export const fileNameFromDisposition = (header: string | null | undefined): string | null => {
  if (!header) return null
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (star && star[2]) {
    try {
      return decodeURIComponent(star[2].trim().replace(/^"|"$/g, ''))
    } catch {
      // 编码不对时退回 filename=
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
  if (plain) return (plain[2] ?? plain[1] ?? '').trim().replace(/^"|"$/g, '') || null
  return null
}

/** 以文件名保存（浏览器下载） */
export const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
}

/**
 * 请求文件并下载。成功返回文件名（Content-Disposition 里的，没有时用 fallbackName）；
 * 失败抛出 HttpRequestError：网络错误 status = -1；后端返回 JSON（出错，或 200 却不是文件）时带 code / details / field
 */
export const downloadFile = async (url: string, init: RequestInit, fallbackName: string): Promise<string> => {
  let res: Response
  try {
    res = await authFetch(url, init)
  } catch (e) {
    const err: HttpRequestError = { status: -1, message: e instanceof Error ? e.message : 'Unknown error' }
    throw err
  }
  const contentType = (res.headers.get('Content-Type') || '').toLowerCase()
  if (!res.ok || contentType.includes('application/json')) {
    const data = await res.json().catch(() => null)
    const err: HttpRequestError = {
      status: res.ok ? 500 : res.status,
      message: data?.message || `Request failed (${res.status})`,
    }
    if (data && typeof data === 'object') {
      if (data.code !== undefined) err.code = data.code
      if (data.details !== undefined) err.details = data.details
      if (data.field !== undefined) err.field = data.field
    }
    throw err
  }
  const blob = await res.blob()
  const fileName = fileNameFromDisposition(res.headers.get('Content-Disposition')) || fallbackName
  saveBlob(blob, fileName)
  return fileName
}
