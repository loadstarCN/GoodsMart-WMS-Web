import { defineStore } from 'pinia';
import { isTokenValid } from '~/utils/auth';
import { secureLocalStorage} from '~/utils/storage';

export interface UserLoginPayload {
  account: string;
  password: string;
}

export interface AuthResult {
  authenticated: boolean;
  message?: string;
}

// access token 24 小时、refresh token 7 天（与后端 JWT 有效期对齐）
const ACCESS_COOKIE_MAX_AGE = 24 * 3600;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 3600;

// 仅在 https 部署下打 secure 标记，否则 http:// 环境 cookie 不会被保存
const isSecureContext = () => typeof location !== 'undefined' && location.protocol === 'https:';

const cookieOptions = (maxAge: number) => ({
  secure: isSecureContext(),
  sameSite: 'lax' as const,
  maxAge,
});

// 从 $fetch 抛出的错误中提取后端 message
const extractErrorMessage = (error: any): string => {
  return error?.data?.message || error?.message || 'Request failed';
};

export const useAuthStore = defineStore('auth', {
  state: () => ({
    authenticated: false,
    loading: false,     // 登录中
    refreshing: false,  // 刷新令牌中
    userInfo: secureLocalStorage.get<User>("userInfo"), // 用户数据
  }),
  actions: {
    // 通用凭证更新函数
    updateAuthCredentials(data: any) {
      useCookie('token', cookieOptions(ACCESS_COOKIE_MAX_AGE)).value = data.access_token;
      if (data.expires_in) {
        useCookie('token_exp', cookieOptions(ACCESS_COOKIE_MAX_AGE)).value = (Date.now()/1000 + data.expires_in).toString();
      }

      if (data.refresh_token) {
        useCookie('refresh_token', cookieOptions(REFRESH_COOKIE_MAX_AGE)).value = data.refresh_token;
      }

      if (data.userInfo) {
        this.userInfo = data.userInfo;
        secureLocalStorage.set("userInfo", data.userInfo);
      }

    },

    // 用户认证函数
    async authenticateUser(payload: UserLoginPayload): Promise<AuthResult> {
      if (this.loading) return { authenticated: false };
      this.loading = true;
      try {
        const data = await $fetch<any>(`/api/system/user/login`, {
          method: 'POST',
          body: payload,
        });

        if (data?.access_token) {
          // 假设接口返回用户信息，需根据实际 API 调整
          const userData = {
            id: data?.id,
            user_name: data?.user_name,
            email: data?.email,
            roles: data?.roles,
            avatar: data?.avatar,
            type: data?.type,
            // 其他用户字段...
          };

          this.updateAuthCredentials({ ...data, userInfo: userData });
          this.authenticated = true;
          return { authenticated: true };
        }
        return { authenticated: false, message: data?.message };
      } catch (error) {
        console.error('Login failed:', error);
        return { authenticated: false, message: extractErrorMessage(error) };
      } finally {
        this.loading = false;
      }
    },

    // 用户登出函数：先清本地会话，再尽力通知后端吊销令牌（失败忽略）
    async logUserOut() {
      const accessToken = useCookie('token').value;

      // 清理所有认证相关 Cookie
      const cookiesToClear = [
        'token',
        'refresh_token',
        'token_exp',
      ];

      cookiesToClear.forEach(name => {
        const cookie = useCookie(name);
        cookie.value = null;
      });

      secureLocalStorage.remove("userInfo"); // 彻底移除会话数据

      // 员工信息（公司、可访问仓库）与当前仓库（warehouse_id cookie）也一起清掉：
      // 否则换人登录后页头沿用上一个人的公司，请求带着上一个人的 X-WAREHOUSE-ID 被拒
      useStaffStore().clearStaffInfo();
      useWarehouseStore().reset();

      // 更新认证状态
      this.authenticated = false;
      this.userInfo = null;

      if (accessToken) {
        try {
          await $fetch('/api/system/user/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + accessToken },
          });
        } catch {
          // 令牌可能已过期或已吊销，忽略
        }
      }
    },


    // 刷新令牌函数
    async refreshToken(): Promise<string | null> {
      const refreshToken = useCookie('refresh_token').value;
      this.refreshing = true;
      try {
        // 双重过期校验
        if (!refreshToken || !isTokenValid(refreshToken)) {
          await this.logUserOut();
          return null;
        }
        const data = await $fetch<any>(`/api/system/user/refresh`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + refreshToken }
        });
        if (data?.access_token) {
          this.updateAuthCredentials(data); // 调用通用函数
          this.authenticated = true;
          return data.access_token as string;
        }else{
          await this.logUserOut();
        }
      } catch (error) {
        console.error('Refresh token failed:', error);
        await this.logUserOut();
      }
      finally {
        this.refreshing = false;
      }
      return null;
    }
  },
});
