export const useGoodsSearch = () => {
  const state = reactive({
    code: '',         
    results: [],       
    total: 0,        
    loading: false,   
    selected: {       
      goods: null as Goods | null,
      goods_id: null as number | null,
      quantity: null as number | null,
      weight: null as number | null,
      volume: null as number | null,
      remark: ''
    }
  });

  const fetchGoods = async () => {
    if (!state.code.trim()) return;
    
    state.loading = true;

    const data = await httpRequest<PaginationData>('/api/warehouse/goods/', {
        method: 'GET',
        params: {code: state.code,per_page: 5},
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
      goods: null, goods_id: null, quantity: null, 
      weight: null, volume: null, remark: '' 
    };
  };
  const resetState = () => {
    state.code = '';
    state.results = [];
    state.total = 0;
    state.loading = false;
    state.selected = { 
      goods: null, goods_id: null, quantity: null, 
      weight: null, volume: null, remark: '' 
    };
  }

  return { state, fetchGoods, resetSelection,resetState };
};

