export const useUseGoodsLocationSearch = () => {
  const state = reactive({
    code: '',         
    results: [],       
    total: 0,        
    loading: false,   
    selected:[] as {       
      goods: Goods,
      location_code: null, 
      goods_id: number,
      location_id: number
    }[]
  });

  const fetchGoodsLocation = async (warehouse_id:number) => {
    if (!state.code.trim()) return;
    
    state.loading = true;

    const data = await httpRequest<PaginationData>('/api/warehouse/goods/locations/', {
        method: 'GET',
        params: {goods_code: state.code,all:true ,warehouse_id: warehouse_id},
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
    state.selected = [];
  };
  const resetState = () => {
    state.code = '';
    state.results = [];
    state.total = 0;
    state.loading = false;
    state.selected = [];
  }

  return { state, fetchGoodsLocation, resetSelection,resetState };
};

