import { defineStore } from 'pinia';
import { isTokenValid } from '~/utils/auth';
import { secureLocalStorage} from '~/utils/storage';

export interface UserLoginPayload {
  account: string;
  password: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    authenticated: false,
    loading: false,
    userInfo: secureLocalStorage.get<User>("userInfo"), // 用户数据
  }),
  actions: {
    // 通用凭证更新函数
    updateAuthCredentials(data: any) {
      useCookie('token').value = data.access_token;
      // useCookie('token_exp').value = (Date.now()/1000 + data.expires_in).toString();
      
      if (data.refresh_token) {
        useCookie('refresh_token').value = data.refresh_token;
        // useCookie('refresh_token_exp').value = (Date.now()/1000 + data.refresh_expires_in).toString();
      }

      if (data.userInfo) {
        this.userInfo = data.userInfo;
        secureLocalStorage.set("userInfo", data.userInfo);
      }

    },

    // 用户认证函数
    async authenticateUser(payload: UserLoginPayload) {
      if (this.loading) return;
      this.loading = true;
      try {
        const { data,error } = await useFetch(`/api/system/user/login`, {
          method: 'POST',
          body: payload,
          watch: false, // 不再响应变化
        });
        if (error.value) {
          throw new Error(`API Error: ${error.value.message}`);
        }

        if (data.value?.access_token) {
          // 假设接口返回用户信息，需根据实际 API 调整
          const userData = {
            id: data.value?.id,
            user_name: data.value?.user_name,
            email: data.value?.email,
            roles: data.value?.roles,
            avatar: data.value?.avatar,
            type: data.value?.type,
            // 其他用户字段...
          };

          this.updateAuthCredentials({ ...data.value, userInfo: userData });
          this.authenticated = true;
          return { authenticated: true };
        }
      } catch (error) {
        console.error('Login failed:', error);
      } finally {
        this.loading = false;
      }
      return { authenticated: false };
    },

    // 用户登出函数
    logUserOut() {
      // 清理所有认证相关 Cookie
      const cookiesToClear = [
        'token',
        'refresh_token',
      ];
    
      cookiesToClear.forEach(name => {
        const cookie = useCookie(name);
        cookie.value = null;
      });

      secureLocalStorage.remove("userInfo"); // 彻底移除会话数据
    
      // 更新认证状态
      this.authenticated = false;
      this.userInfo = null;
      
    },
   

    // 刷新令牌函数
    async refreshToken() {
      const refreshToken = useCookie('refresh_token').value;
      this.loading = true;
      try {
        // 双重过期校验
        if (!refreshToken || !isTokenValid(refreshToken)) {
          this.logUserOut();
          return null;
        }
        const { data } = await useFetch(`/api/system/user/refresh`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + refreshToken }
        });  
        if (data.value?.access_token) {
          this.updateAuthCredentials(data.value); // 调用通用函数
          this.authenticated = true;
          return data.value.access_token;
        }else{
          this.logUserOut();
        }
      } catch (error) {
        console.error('Refresh token failed:', error);
        this.logUserOut();
      }
      finally {
        this.loading = false;
      }
      return null;
    }
  },
});