import { authFetch } from "~/composables/auth/authFetch"

// 通用HTTP请求封装（支持TypeScript）

// 请求失败时回调的错误对象：code/details/field 为后端业务错误的原样字段（可能不存在）
export interface HttpRequestError {
  status: number
  message: string
  code?: number
  details?: any
  field?: string
}

/**
 * 指定本次请求的仓库（X-WAREHOUSE-ID 请求头）：新建表单里选了仓库时用所选仓库，不用页头的当前仓库
 * （后端只从 query / 请求头取仓库；页头选「全部仓库」时表单里选的仓库不会自动带上）。没选时不指定。
 */
export const warehouseHeaders = (warehouseId: number | string | null | undefined): Record<string, string> =>
  warehouseId === null || warehouseId === undefined || warehouseId === '' ? {} : { 'X-WAREHOUSE-ID': String(warehouseId) }

interface RequestConfig<T = any> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: Record<string, any>
  body?: T
  headers?: HeadersInit & { 'Content-Type'?: string }
  onSuccess?: (data: any) => void
  onError?: (error: HttpRequestError) => void
  onFinally?: () => void;  // 错误提示的缺失项

}

export const httpRequest = async <T = any, K = any>(
  endpoint: string,
  config: RequestConfig<K> = {}
): Promise<T | null> => {
  const {
    method = 'GET',
    params,
    body,
    headers = {},
    onSuccess,
    onError,
    onFinally
  } = config

  try {
    // 参数序列化（支持嵌套对象转换）
    const queryParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(key, v))
          } else if (typeof value === 'object') {
            queryParams.append(key, JSON.stringify(value))
          } else {
            queryParams.append(key, value.toString())
          }
        }
      })
    }

    // 请求配置
    const requestConfig: RequestInit = {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), // 默认值
        ...headers // 用户自定义值可覆盖默认
      }
    }

    // Body处理（GET/HEAD方法不携带body）
    // 增加FormData类型检测
    if (method !== 'GET' && body) {
      requestConfig.body = body instanceof FormData 
        ? body // 保留原始二进制结构
        : (typeof body === 'string' ? body : JSON.stringify(body))
    }

    // URL构建
    const url = `${endpoint}${params ? `?${queryParams}` : ''}`

    const response = await authFetch(url, requestConfig)

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      const error: HttpRequestError = {
        status: response.status,
        message: errorBody?.message || `Request failed (${response.status})`
      }
      if (errorBody && typeof errorBody === 'object') {
        if (errorBody.code !== undefined) error.code = errorBody.code
        if (errorBody.details !== undefined) error.details = errorBody.details
        if (errorBody.field !== undefined) error.field = errorBody.field
      }
      onError?.(error)
      return null
    }

    const data = await response.json()
    onSuccess?.(data)
    return data as T
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    onError?.({ status: -1, message: errorMsg })
    return null
  }
  finally {
    onFinally?.()
  }
}