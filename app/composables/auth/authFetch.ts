
// 核心请求封装
export const authFetch = async (input: RequestInfo, init?: RequestInit) => {
  const token = useCookie('token')
  const refreshToken = useCookie('refresh_token')
  const warehouse_id = useCookie('warehouse_id')
  const authStore = useAuthStore()

  // Token刷新逻辑
  const refreshAuthToken = async () => {
    if (!refreshToken.value || !isTokenValid(refreshToken.value)) {
      authStore.logUserOut()
      throw new Error('SESSION_EXPIRED')
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      })

      if (!response.ok) throw new Error('REFRESH_FAILED')
      
      const { access_token, refresh_token } = await response.json()
      await authStore.refreshToken()
      return access_token
    } catch (error) {
      authStore.logUserOut()
      throw new Error('AUTH_REQUIRED')
    }
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