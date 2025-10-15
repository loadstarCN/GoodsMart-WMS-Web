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

// 定时刷新任务（在 app.vue 中初始化）
export const startTokenRefreshMonitor = () => {
  setInterval(async () => {
    const tokenExp = useCookie('token_exp').value;
    const authStore = useAuthStore();
    
    if (tokenExp && (Number(tokenExp) - Date.now()/1000 < 300)) {
      await authStore.refreshToken();
    }
  }, 60_000); // 每分钟检查一次
};