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
  },
  
  getters: {
    currentWarehouseLabel: (state) => 
      state.currentWarehouse?.name || 'All Warehouse'
  }
})