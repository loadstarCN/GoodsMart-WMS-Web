// 后端 API 反向代理：只放行业务命名空间，拒绝透传 Swagger 文档
const ALLOWED_PREFIXES = ['/system/', '/warehouse/', '/tasks/']
const BLOCKED_PATTERNS = [/^\/system\/doc/, /^\/warehouse\/doc/, /^\/tasks\/doc/, /swagger\.json/]

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const path = event.path.replace(/^\/api/, '') // strip /api prefix
  const pathname = path.split('?')[0] || ''

  const allowed = ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const blocked = BLOCKED_PATTERNS.some((pattern) => pattern.test(pathname))
  if (!allowed || blocked) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  return proxyRequest(event, `${config.apiBase}${path}`)
})
