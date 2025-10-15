import { authFetch } from "~/composables/auth/authFetch"

// 通用HTTP请求封装（支持TypeScript）
interface RequestConfig<T = any> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: Record<string, any>
  body?: T
  headers?: HeadersInit & { 'Content-Type'?: string }
  onSuccess?: (data: any) => void
  onError?: (error: { status: number; message: string }) => void  
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
      const error = {
        status: response.status,
        message: errorBody?.message || '请求失败'
      }
      onError?.(error)
      return null
    }

    const data = await response.json()
    onSuccess?.(data)
    return data as T
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    onError?.({ status: -1, message: errorMsg })
    return null
  }
  finally {
    onFinally?.()
  }
}