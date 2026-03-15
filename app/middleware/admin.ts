// ~/middleware/admin.ts
import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore();

  if (!authStore.authenticated || !authStore.userInfo) {
    return navigateTo('/auth/login');
  }

  // Only 'user' type (non-staff, platform-level) can access admin pages
  if (authStore.userInfo.type !== 'user') {
    return navigateTo('/');
  }
});
