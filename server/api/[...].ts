export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const path = event.path.replace(/^\/api/, '') // 保持路径一致性
  
  // 生产环境走代理
  if (process.env.NODE_ENV === 'production') {
    return proxyRequest(event, 
      `${config.public.apiBase}${path}`, 
      {
        headers: {
          'X-Forwarded-Host': 'api.wms.goodsmart.com.cn' 
        }
      }
    )
  }
  
  // 开发环境直接响应（由nitro.devProxy处理）
  return sendProxy(event, `${config.public.apiBase}${path}`)
})