export const useAuthFetch = (url: string, opts?: any) => {
  const token = useCookie('token')
  const warehouse_id = useCookie('warehouse_id')

  return useFetch(url, {
    ...opts,
    async onRequest({ options }: { options: Record<string, any> }) {
      let currentToken = token.value;
      let currentWarehouse = warehouse_id.value;

      // Token 有效性检查逻辑（与 authFetch 共用刷新锁）
      if (!currentToken || !isTokenValid(currentToken)) {
        try {
          currentToken = await refreshAccessToken()
        } catch (error) {
          await handleSessionExpired()
          throw error
        }
      }

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
    async onResponseError({ response }: { response?: { status?: number } }) {
      // 仅在明确收到 401 时执行登出并跳转登录
      if (response?.status === 401) {
        await handleSessionExpired()
      }
    },
    async onRequestError() {
      /* 保留请求错误处理（不包含登出逻辑） */
    }
  })
}
