export const useUseGoodsLocationSearch = () => {
  const state = reactive({
    code: '',         
    results: [] as any[],       
    total: 0,        
    loading: false,   
    selected:[] as {       
      goods: Goods,
      location_code: null, 
      goods_id: number,
      location_id: number
    }[]
  });

  let generation = 0;
  const fetchGoodsLocation = async (warehouse_id:number) => {
    if (!state.code.trim()) return;
    
    const seq = ++generation;
    state.loading = true;

    const data = await httpRequest<PaginationData>('/api/warehouse/goods/locations/', {
        method: 'GET',
        params: {goods_code: state.code,all:true ,warehouse_id: warehouse_id},
        onSuccess: async(data) => {
          if (seq !== generation) return;
          state.results = data.items;
          state.total  = data.total;
        },
        onError: (error) => {
            if (seq === generation) showToast(error.message, 'error')
        },
        onFinally: () => {
          if (seq === generation) state.loading = false;
        }
    })
  };

  const resetSelection = () => {
    state.selected = [];
  };
  const resetState = () => {
    generation++;
    state.code = '';
    state.results = [];
    state.total = 0;
    state.loading = false;
    state.selected = [];
  }

  return { state, fetchGoodsLocation, resetSelection,resetState };
};

