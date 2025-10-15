// ~/middleware/staff.ts
import { useAuthStore } from '~/stores/auth';
import { useStaffStore } from '~/stores/staff';

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore();
  const staffStore = useStaffStore();

  // 令牌验证
  if (authStore.authenticated && authStore.userInfo) {
    if (authStore.userInfo?.type === 'staff') {
        // 会话状态同步
        if (!staffStore.staffInfo) {
            console.log("Staff info not found, fetching...");
            await staffStore.getCurrentStaffInfo();
        }
    }
  }  
});