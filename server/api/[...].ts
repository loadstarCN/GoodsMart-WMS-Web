export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const path = event.path.replace(/^\/api/, '') // strip /api prefix

  return proxyRequest(event,
    `${config.public.apiBase}${path}`,
    {
      headers: {
        'X-Forwarded-Host': 'api.wms.goodsmart.com.cn'
      }
    }
  )
})
