
// 刷新锁：防止并发请求同时触发多次 token 刷新
let _refreshPromise: Promise<string> | null = null

// 核心请求封装
export const authFetch = async (input: RequestInfo, init?: RequestInit) => {
  const token = useCookie('token')
  const refreshToken = useCookie('refresh_token')
  const warehouse_id = useCookie('warehouse_id')
  const authStore = useAuthStore()

  // Token刷新逻辑（带锁，多个并发请求只触发一次刷新）
  const refreshAuthToken = async (): Promise<string> => {
    if (_refreshPromise) return _refreshPromise

    _refreshPromise = (async () => {
      if (!refreshToken.value || !isTokenValid(refreshToken.value)) {
        authStore.logUserOut()
        throw new Error('SESSION_EXPIRED')
      }
      try {
        const response = await fetch('/api/system/user/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${refreshToken.value}` },
        })
        if (!response.ok) throw new Error('REFRESH_FAILED')
        const data = await response.json()
        authStore.updateAuthCredentials(data)
        return data.access_token as string
      } catch (error) {
        authStore.logUserOut()
        throw new Error('AUTH_REQUIRED')
      } finally {
        _refreshPromise = null
      }
    })()

    return _refreshPromise
  }

  // 预处理请求头
  const headers = new Headers(init?.headers)
  if (warehouse_id.value) headers.set('X-WAREHOUSE-ID', warehouse_id.value)
  
  // Token有效性检查
  if (!token.value || !isTokenValid(token.value)) {
    token.value = await refreshAuthToken()
  }
  headers.set('Authorization', `Bearer ${token.value}`)


  // 发起请求
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin' // 根据安全策略调整
  })

  // 401处理
  if (response.status === 401) {
    authStore.logUserOut()
  }

  return response
}