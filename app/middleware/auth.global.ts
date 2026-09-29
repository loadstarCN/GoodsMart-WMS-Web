import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore();
  const { authenticated } = storeToRefs(authStore);
  const token = useCookie('token');
  const path = to?.path || '';

  // 公开页面（无需登录即可访问）
  const publicPaths = ['/auth/login', '/auth/forgot-password'];
  const isPublicPage = publicPaths.includes(path);

  // 有 token 但本地用户信息缺失/解密失败：会话不完整，清掉 token 回登录页，避免反复跳转
  if (token.value && !authStore.userInfo) {
    await authStore.logUserOut();
    if (!isPublicPage) {
      return navigateTo('/auth/login');
    }
    return;
  }

  if (token.value) {
    authenticated.value = true;
  }

  // if token exists and url is /login redirect to homepage
  if (token.value && path === '/auth/login') {
    // Admin users (type='user') go to admin console, staff go to WMS
    if (authStore.userInfo?.type === 'user') {
      return navigateTo('/admin/');
    }
    return navigateTo('/');
  }

  // Admin users should not access WMS pages (non-admin routes)
  // 修改密码页对平台管理员同样开放
  const adminAllowedPaths = ['/authentication/reset-password'];
  if (token.value && authStore.userInfo?.type === 'user') {
    if (!path.startsWith('/admin') && path !== '/auth/login' && !adminAllowedPaths.includes(path)) {
      return navigateTo('/admin/');
    }
  }

  // Staff users should not access admin pages
  if (token.value && authStore.userInfo?.type === 'staff') {
    if (path.startsWith('/admin')) {
      return navigateTo('/');
    }
  }

  // if token doesn't exist redirect to log in
  if (!token.value && !isPublicPage) {
    return navigateTo('/auth/login');
  }
});
