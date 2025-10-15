export const useInventorySearch = () => {
  const state = reactive({
    code: '',         
    results: [],       
    total: 0,        
    loading: false,   
    selected: {       
      goods: null,
      goods_id: null as number | null,
      max_qty: null as number | null,
      quantity: null as number | null,
      remark: ''
    }
  });

  const fetchInventory = async (warehouse_id:number) => {
    if (!state.code.trim()) return;
    
    state.loading = true;

    const data = await httpRequest<PaginationData>('/api/warehouse/inventory/', {
        method: 'GET',
        params: {goods_codes: state.code,per_page: 5,warehouse_id: warehouse_id},
        onSuccess: async(data) => {
          state.results = data.items;
          state.total  = data.total;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
          state.loading = false;
        }
    })
  };

  const resetSelection = () => {
    state.selected = { 
      goods: null, goods_id: null, quantity: null,remark: '' 
    };
  };
  const resetState = () => {
    state.code = '';
    state.results = [];
    state.total = 0;
    state.loading = false;
    state.selected = { 
      goods: null, goods_id: null, quantity: null, remark: '' 
    };
  }

  return { state, fetchInventory, resetSelection,resetState };
};

