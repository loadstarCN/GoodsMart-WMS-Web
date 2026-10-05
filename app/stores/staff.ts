import { defineStore } from 'pinia';

import { secureLocalStorage} from '~/utils/storage';
import type { HttpRequestError } from '~/utils/http';

// 正在进行的 /staff/current 请求：并发调用共用同一个结果（不再直接返回 undefined，免得调用方拿到旧缓存）
let _pendingStaffInfo: Promise<Staff | null> | null = null;
// 清除次数：请求返回前已退出登录（清过缓存）时，丢弃这次结果，免得把上一个人的信息写回去
let _clearGeneration = 0;
let _pendingGeneration = 0;

export const useStaffStore = defineStore('staff', {
  state: () => ({
    loading: false,
    staffInfo: secureLocalStorage.get<Staff>("staffInfo"), // Staff数据
    // 本次打开页面后是否已从后端刷新过（不持久化；页头据此在每次打开页面时刷新一次）
    refreshed: false,
  }),
  getters: {
    /** 是否公司管理员：以后端按启用中角色算出的 is_company_admin 为准（不看 roles，停用的角色不算） */
    isCompanyAdmin: (state): boolean => state.staffInfo?.is_company_admin === true,
    /**
     * 是否有任一所需权限（用于显示菜单 / 按钮，鉴权仍以后端为准）：
     * - all_access / company_all_access 视为拥有全部权限；
     * - 没有员工信息（平台用户）或员工信息里还没有 permissions（旧缓存，刷新前）时不按权限隐藏
     */
    hasPermission: (state) => (...required: string[]): boolean => {
      const permissions = state.staffInfo?.permissions;
      if (!Array.isArray(permissions)) return true;
      if (permissions.includes('all_access') || permissions.includes('company_all_access')) return true;
      return required.length === 0 || required.some((p) => permissions.includes(p));
    },
  },
  actions: {

    // 获取当前Staff信息
    async getCurrentStaffInfo(): Promise<Staff | null> {
      // 清过缓存后发起的调用不复用清除前的请求
      if (_pendingStaffInfo && _pendingGeneration === _clearGeneration) return _pendingStaffInfo;
      const run = async (): Promise<Staff | null> => {
        const generation = _clearGeneration;
        this.loading = true;
        try {
          // 用 httpRequest 每次都真正发请求：useFetch 同一个 key 成功过一次后，在页面里再调用会直接返回第一次的缓存，
          // 刷新不生效，换人登录（未整页刷新）也会拿到上一个人的员工信息
          // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
          let fetched = null as Staff | null;
          let fetchError = null as HttpRequestError | null;
          await httpRequest<Staff>(`/api/warehouse/staff/current`, {
            method: 'GET',
            onSuccess: (data) => {
              fetched = data as Staff;
            },
            onError: (error) => {
              fetchError = error;
            },
          });

          if (fetchError) {
            throw new Error(`API Error: ${fetchError.message}`);
          }

          if (generation !== _clearGeneration) return null;

          if (fetched) {
            // 完整映射接口字段（包含嵌套对象）
            const staffData = fetched;

            // 对象冻结防止意外修改
            this.staffInfo = Object.freeze(staffData);
            secureLocalStorage.set("staffInfo", staffData);
            this.refreshed = true;
            return staffData;
          }
        } catch (error) {
          console.error('Staff info fetch failed:', error);
          if (generation === _clearGeneration) this.clearStaffInfo();
        } finally {
          this.loading = false;
        }
        return null;
      };
      const pending: Promise<Staff | null> = run().finally(() => {
        if (_pendingStaffInfo === pending) _pendingStaffInfo = null;
      });
      _pendingStaffInfo = pending;
      _pendingGeneration = _clearGeneration;
      return pending;
    },
    /**
     * 重新拉取员工信息（公司、可访问仓库），并用新的仓库列表刷新页头下拉、校验当前仓库：
     * 当前仓库已停用 / 已无权访问时清掉（否则所有请求都带着它被拒）。
     * 登录成功、仓库新增 / 编辑 / 删除 / 启用 / 停用、公司保存后调用。
     */
    async refreshStaffInfo(): Promise<Staff | null> {
      const staff = await this.getCurrentStaffInfo();
      if (staff) {
        useWarehouseStore().syncWarehouses();
      }
      return staff;
    },
    // 清除Staff信息
    clearStaffInfo() {
      _clearGeneration += 1;
      this.staffInfo = null;
      this.refreshed = false;
      secureLocalStorage.remove("staffInfo");
    },
  },
});
