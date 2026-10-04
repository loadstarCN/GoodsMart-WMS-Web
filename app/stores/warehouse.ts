// stores/warehouse.ts
import { defineStore } from 'pinia'

export const useWarehouseStore = defineStore('warehouse', {
  state: () => ({
    currentWarehouse: null as WarehouseSimple | null,
    warehouses: [] as WarehouseSimple[],
    loading: false
  }),
  
  actions: {
    async fetchWarehouses() {
      if (this.loading) return
      this.loading = true
      try {
        // 从 staffStore 获取或 API 请求
        const staffStore = useStaffStore()
        this.warehouses = staffStore.staffInfo?.warehouses || []
      } finally {
        this.loading = false
      }
    },
    
    selectWarehouse(warehouse: WarehouseSimple | null) {
      this.currentWarehouse = warehouse
      useCookie('warehouse_id').value = warehouse?.id?.toString() || null

    },
    clearWarehouse() {
      this.currentWarehouse = null
      useCookie('warehouse_id').value = null
    },
    /**
     * 用员工信息里最新的可访问仓库列表刷新下拉，并校验当前仓库（warehouse_id cookie）：
     * 在列表里就更新为最新的仓库信息（名称可能改过），不在（已停用 / 已无权访问 / 别人的仓库）就清掉。
     * 返回当前仓库是否被清掉。
     */
    syncWarehouses(): boolean {
      const staffStore = useStaffStore()
      this.warehouses = staffStore.staffInfo?.warehouses || []
      // cookie 值按 JSON 解析，可能是数字或字符串
      const currentId = (useCookie('warehouse_id') as unknown as { value: string | number | null | undefined }).value
      if (currentId === null || currentId === undefined || currentId === '') {
        this.currentWarehouse = null
        return false
      }
      const warehouse = this.warehouses.find((w: WarehouseSimple) => String(w.id) === String(currentId))
      if (warehouse) {
        this.selectWarehouse(warehouse)
        return false
      }
      this.clearWarehouse()
      return true
    },
    /** 退出登录：清掉当前仓库与仓库列表，免得下一个登录的人沿用 */
    reset() {
      this.clearWarehouse()
      this.warehouses = []
    },
  },
  
  getters: {
    currentWarehouseLabel: (state) =>
      state.currentWarehouse?.name || ''
  }
})