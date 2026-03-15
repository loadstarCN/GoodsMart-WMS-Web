import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore();
  const { authenticated } = storeToRefs(authStore);
  const token = useCookie('token');
  const path = to?.path || '';

  if (token.value) {
    authenticated.value = true;
  }

  // 公开页面（无需登录即可访问）
  const publicPaths = ['/auth/login', '/auth/forgot-password'];
  const isPublicPage = publicPaths.includes(path);

  // if token exists and url is /login redirect to homepage
  if (token.value && path === '/auth/login') {
    // Admin users (type='user') go to admin console, staff go to WMS
    if (authStore.userInfo?.type === 'user') {
      return navigateTo('/admin/');
    }
    return navigateTo('/');
  }

  // Admin users should not access WMS pages (non-admin routes)
  if (token.value && authStore.userInfo?.type === 'user') {
    if (!path.startsWith('/admin') && path !== '/auth/login') {
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
