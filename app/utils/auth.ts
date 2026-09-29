interface JwtPayload {
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    // 强化 JWT 格式校验
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    // 明确声明 base64Payload 类型
    const base64Payload: string = parts[1];

    // 处理 base64url 编码
    const paddedPayload = base64Payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64Payload.length + (4 - (base64Payload.length % 4)) % 4, '=');

    // 安全解码
    const decoded = atob(paddedPayload);

    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
};

// Token 有效性判断方法
export const isTokenValid = (token: string) => {
  try {
    const { exp } = decodeJwtPayload(token) || {};
    return exp && exp > Date.now() / 1000;
  } catch {
    return false;
  }
};

// 刷新锁：多个并发请求同时发现 token 过期时，只触发一次刷新
// authFetch / useAuthFetch / 定时监控统一走这里
let _refreshPromise: Promise<string> | null = null

export const refreshAccessToken = (): Promise<string> => {
  if (_refreshPromise) return _refreshPromise

  const authStore = useAuthStore()
  const promise: Promise<string> = authStore.refreshToken()
    .then((token: string | null) => {
      if (!token) throw new Error('AUTH_REQUIRED')
      return token
    })
    .finally(() => {
      _refreshPromise = null
    })

  _refreshPromise = promise
  return promise
}

// 会话失效统一处理：清本地并跳转登录页
export const handleSessionExpired = async () => {
  const authStore = useAuthStore()
  await authStore.logUserOut()
  const route = useRoute()
  if (route.path !== '/auth/login') {
    await navigateTo('/auth/login')
  }
}

// 定时刷新任务（在 app.vue 中初始化，返回清理函数）
export const startTokenRefreshMonitor = () => {
  const handle = setInterval(async () => {
    const tokenExp = useCookie('token_exp').value;

    if (tokenExp && (Number(tokenExp) - Date.now()/1000 < 300)) {
      await refreshAccessToken().catch(() => null);
    }
  }, 60_000); // 每分钟检查一次

  return () => clearInterval(handle);
};
