export const useAuthFetch = (url: string, opts?: any) => {
  const token = useCookie('token')
  const refreshToken = useCookie('refresh_token')
  const warehouse_id = useCookie('warehouse_id')
  const authStore = useAuthStore()

  return useFetch(url, {
    ...opts,
    async onRequest({ options }) {
      let currentToken = token.value;
      let currentWarehouse = warehouse_id.value;

      // Token 有效性检查逻辑
      const checkAndRefreshToken = async () => {
        if (!currentToken || !isTokenValid(currentToken)) {
          if (refreshToken.value && isTokenValid(refreshToken.value)) {
            await authStore.refreshToken()
            currentToken = token.value
            if (!currentToken) {
              authStore.logUserOut()
              throw new Error('Session expired')
            }
          } else {
            authStore.logUserOut()
            throw new Error('Authentication required')
          }
        }
      }

      await checkAndRefreshToken()

      // 设置最新 token 到请求头
      
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${currentToken}`
      }
      // 添加仓库 ID 到请求头
      // 仅在有仓库 ID 时添加到请求头
      // 这可以帮助后端识别当前请求的仓库
      if (currentWarehouse) {
        options.headers = {
          ...options.headers,
          'X-WAREHOUSE-ID': currentWarehouse
        }
      }
    },
    async onResponseError({ response }) {
      // 仅在明确收到 401 时执行登出
      if (response?.status === 401) {
        authStore.logUserOut()
      }
    },
    async onRequestError() {
      /* 保留请求错误处理（不包含登出逻辑） */
    }
  })
}