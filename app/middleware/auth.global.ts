import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore();
  const { authenticated } = storeToRefs(authStore);
  const token = useCookie('token');
  if (token.value) {
    authenticated.value = true;
  }

  // if token exists and url is /login redirect to homepage
  if (token.value && to?.name === 'auth-login') {
    // Admin users (type='user') go to admin console, staff go to WMS
    if (authStore.userInfo?.type === 'user') {
      return navigateTo('/admin/');
    }
    return navigateTo('/');
  }

  // Admin users should not access WMS pages (non-admin routes)
  if (token.value && authStore.userInfo?.type === 'user') {
    const path = to?.path || '';
    if (!path.startsWith('/admin') && to?.name !== 'auth-login') {
      return navigateTo('/admin/');
    }
  }

  // Staff users should not access admin pages
  if (token.value && authStore.userInfo?.type === 'staff') {
    const path = to?.path || '';
    if (path.startsWith('/admin')) {
      return navigateTo('/');
    }
  }

  // if token doesn't exist redirect to log in
  if (!token.value && to?.name !== 'auth-login') {
    return navigateTo('/auth/login');
  }
});
