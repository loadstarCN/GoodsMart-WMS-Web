
import { defineStore } from 'pinia';

import { secureLocalStorage} from '~/utils/storage';

export const useStaffStore = defineStore('staff', {
  state: () => ({
    loading: false,
    staffInfo: secureLocalStorage.get<Staff>("staffInfo"), // Staff数据
  }),
  actions: {
    
    // 获取当前Staff信息
    async getCurrentStaffInfo() {
      if (this.loading) return;
      this.loading = true;
      try {
        const { data,error } = await useAuthFetch(`/api/warehouse/staff/current`, {
          method: 'GET',
          watch: false, // 不再响应变化
        });

        if (error.value) {
          throw new Error(`API Error: ${error.value.message}`);
        }

        if (data.value) {
          // 完整映射接口字段（包含嵌套对象）
          const staffData = data.value as Staff;
          
          // 对象冻结防止意外修改
          this.staffInfo = Object.freeze(staffData);
          secureLocalStorage.set("staffInfo", staffData);
          return staffData;
        }
      } catch (error) {
        console.error('Staff info fetch failed:', error);
        this.clearStaffInfo();
      } finally {
        this.loading = false;
      }
      return null;
    },
    // 清除Staff信息
    clearStaffInfo() {
      this.staffInfo = null;
      secureLocalStorage.remove("staffInfo");
    },
  },
});