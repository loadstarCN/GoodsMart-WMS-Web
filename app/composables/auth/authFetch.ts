
// 核心请求封装（刷新锁见 utils/auth.ts::refreshAccessToken）
export const authFetch = async (input: RequestInfo, init?: RequestInit) => {
  const token = useCookie('token')
  const warehouse_id = useCookie('warehouse_id')

  // 预处理请求头
  const headers = new Headers(init?.headers)
  // 调用方显式指定了仓库（如新建表单里选的仓库）时以它为准，否则用页头当前仓库
  if (warehouse_id.value && !headers.has('X-WAREHOUSE-ID')) headers.set('X-WAREHOUSE-ID', warehouse_id.value)

  // Token有效性检查
  if (!token.value || !isTokenValid(token.value)) {
    try {
      token.value = await refreshAccessToken()
    } catch (error) {
      await handleSessionExpired()
      throw error
    }
  }
  headers.set('Authorization', `Bearer ${token.value}`)


  // 发起请求
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin' // 根据安全策略调整
  })

  // 401处理：统一清会话并跳转登录
  if (response.status === 401) {
    await handleSessionExpired()
  }

  return response
}
