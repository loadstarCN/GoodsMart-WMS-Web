<script lang="ts" setup>
import OperationsCompactFlow from "~/components/operations/CompactFlow.vue"
/**
 * 配送任务详情：任务资料（运费、承运商、运输方式、备注）在本页填；运单号、揽收、完成发货、跟踪、签收都在下面的发货流程（compact）里办，
 * 完成发货时把本页的运费 / 承运商 / 运输方式 / 备注一起提交（completeExtras）。
 * 承运商选了就保存到任务（PUT tracking 只带 carrier_id）：流程的「运单」一步按任务上的承运商决定怎么建运单。
 */
import { dnTransportationModesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const taskId = String(route.params.id);

const itemData = ref<any>(null);
const activeTab = ref('details');
const { t } = useI18n();
const { translateOption } = useOptionLabel();
const { bizErrorMessage } = useBizError();
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.delivery'),
  list: [t('nav.warehouse'), t('nav.delivery')]
}));
const staffStore = useStaffStore()


// 配置化选项集合
const selectOptions = reactive({
  transportation_modes: dnTransportationModesOptions,
})


const errors = ref<Record<string, any>>({
  carrier: null,
  transportation_mode: null,
});
/** 发货流程（compact） */
const flowRef = ref<{ reload: () => Promise<void> } | null>(null);
/** 任务上已保存的承运商：选择框改了才保存 */
const savedCarrierId = ref<number | null>(null);

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          // 任务自己的币种优先；没有时才用公司默认币种（以前每次读取都改成默认币种，覆盖了任务的币种）
          if (!itemData.value.currency) {
            itemData.value.currency = staffStore.staffInfo?.company?.default_currency || 'JPY';
          }         
          savedCarrierId.value = itemData.value?.carrier_id ?? null;
          selectedCarrier.value = itemData.value?.carrier_id
            ? itemData.value?.carrier
            : null;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};


const processTask = async () => {
    const data = await httpRequest(`/api/warehouse/delivery/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData();
            flowRef.value?.reload();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;
};

// 运费输入框（v-maska 文本框）的值转成提交值：空 → null（后端视为不改），否则转数字
const toShippingCost = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : Number(text);
};

/** 任务还没发货（pending / in_progress）：能改承运商、运费、运输方式、备注（完成发货时一起提交） */
const taskEditable = computed(() => ['pending', 'in_progress'].includes(String(itemData.value?.status || '')));

/**
 * 发货流程「完成发货」时一起提交的本页字段；承运商、运输方式没填 → 标出来并返回 null（不提交）。
 * 运单号不在这里：在流程的「运单」一步保存（完成发货时后端沿用已存的运单号）
 */
const completeExtras = (): Record<string, any> | null => {
  errors.value = {
    carrier: itemData.value?.carrier_id ? null : t('delivery.validation.carrier-required'),
    transportation_mode: itemData.value?.transportation_mode ? null : t('delivery.validation.transportation-required'),
  };
  if (Object.values(errors.value).some(v => v)) {
    showToast(t('delivery.tips.complete-fields-missing'), 'warning');
    return null;
  }
  return {
    // 输入框是文本框：空 = 不改已存运费（null），其余按数字提交（后端只收数字 / 数字字符串）
    shipping_cost: toShippingCost(itemData.value.shipping_cost),
    carrier_id: itemData.value.carrier_id,
    transportation_mode: itemData.value.transportation_mode,
    remark: itemData.value.remark,
  };
};


// 处理承运商选择
const isLoading = ref(false);
const selectedCarrier = ref<any>(null);
const carrierSelectedOptions = ref<any[]>([]);


const fetchCarrierData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/carrier/', {
        method: 'GET',
        params: {all: true,name: name},
        onSuccess: async(data) => {
          carrierSelectedOptions.value = data.items;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
          isLoading.value = false;
        }
    })
    return data;   
};


watch(
  () => selectedCarrier.value,  // 监听选中的承运商对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.carrier_id = newVal.id;  // 将对象 ID 同步到表单
      // 承运商决定了运单怎么建（在线对接 / 手工）、揽收和跟踪方式：选了就保存，发货流程随之刷新
      if (taskEditable.value && newVal.id !== savedCarrierId.value) saveCarrier(newVal);
    } else {
      if (itemData.value?.carrier_id) {
        itemData.value.carrier_id = null;       // 清空选择时重置
      }
    }
  },
  { immediate: true }  // 初始化时立即触发
);

onMounted(async() => {
  await fetchData();
});

// ------------------ 发货流程（compact） ----------------------
/** 保存承运商 / 运单号时要弹窗说明的业务码：自动运单锁定（16078）/ 结果不明（16079）/ 与 CI 不一致（16080 / 16092）/ 不是当前任务（16091） */
const SHIPPING_BLOCK_CODES = [16078, 16079, 16080, 16091, 16092];

/**
 * 选了承运商就保存（PUT tracking 只带 carrier_id）：发货流程按任务上的承运商判断怎么建运单。
 * 有效在线运单期间不能换（16078）等：弹窗说明，选择框改回原来的承运商
 */
const savingCarrier = ref(false);
const saveCarrier = async (carrier: any) => {
  if (savingCarrier.value) return;
  savingCarrier.value = true;
  const previous = itemData.value?.carrier ?? null;
  await httpRequest<any>(`/api/warehouse/delivery/${taskId}/tracking`, {
    method: 'PUT',
    body: { carrier_id: carrier.id },
    onSuccess: (data) => {
      savedCarrierId.value = data?.carrier_id ?? carrier.id;
      itemData.value.carrier = data?.carrier ?? carrier;
      errors.value.carrier = null;
      flowRef.value?.reload();
    },
    onError: (error) => {
      if (SHIPPING_BLOCK_CODES.includes(Number(error.code))) {
        showAlert(t('delivery.tips.tracking-blocked-title'), bizErrorMessage(error), 'error');
      } else {
        showToast(bizErrorMessage(error), 'error');
      }
      selectedCarrier.value = previous;
    },
    onFinally: () => {
      savingCarrier.value = false;
    },
  });
};

/**
 * 发货流程里做了操作（存运单号、建 / 取消运单、完成发货、签收……）：任务状态变了就整页重读；
 * 否则只同步运单号与承运商，画面上其余输入（运费、运输方式、备注等）保持不动
 */
const syncFromTask = async () => {
  await httpRequest<any>(`/api/warehouse/delivery/${taskId}`, {
    method: 'GET',
    onSuccess: (data) => {
      if (!itemData.value) return;
      if (data?.status && data.status !== itemData.value.status) {
        fetchData();
        return;
      }
      itemData.value.tracking_number = data?.tracking_number ?? null;
      if (data?.carrier_id) {
        itemData.value.carrier_id = data.carrier_id;
        itemData.value.carrier = data.carrier;
        savedCarrierId.value = data.carrier_id;
        selectedCarrier.value = data.carrier;
      }
    },
  });
};


const processing=ref(false)
const start=async()=>{if(processing.value)return;processing.value=true;try{await processTask()}finally{processing.value=false}}
const canEdit=computed(()=>taskEditable.value&&staffStore.hasPermission('delivery_edit'))
const carrierValue=computed({get:()=>selectedCarrier.value?.id??null,set:(id:number|null)=>{selectedCarrier.value=carrierSelectedOptions.value.find(row=>row.id===id)||selectedCarrier.value}})
const searchCarriers=async(query:string)=>{const result=await httpRequest<PaginationData>('/api/warehouse/carrier/',{params:{name:query,all:true,is_active:true}});carrierSelectedOptions.value=result?.items||[];return carrierSelectedOptions.value.map(row=>({value:row.id,label:row.name}))}
const columns=computed(()=>[{key:'goods',label:t('nav.goods')},{key:'quantity',label:t('common.fields.quantity'),type:'qty' as const},{key:'picked_quantity',label:t('common.quantities.picked'),type:'qty' as const},{key:'packed_quantity',label:t('common.quantities.packed'),type:'qty' as const}])
useHead({title:()=>`DEL-${taskId}`})
</script>
<template><div class="w-delivery-detail w-scope"><header><nav><NuxtLink class="w-delivery-muted" to="/delivery">{{t('nav.delivery')}}</NuxtLink><span>/</span><span>DEL-{{taskId}}</span></nav><div class="title"><h1>DEL-{{taskId}}</h1><WStatus v-if="itemData" variant="pill" :tone="itemData.status==='signed'?'ok':itemData.status==='pending'?'none':'warn'">{{t('common.status.'+itemData.status.replaceAll('_','-'))}}</WStatus></div><div v-if="itemData" class="meta"><NuxtLink class="w-delivery-link" :to="'/dn/detail/'+itemData.dn_id">DN-{{itemData.dn_id}}</NuxtLink><span>{{itemData.dn?.order_number}}</span><span>{{itemData.dn?.warehouse?.name}}</span><span>{{t('dn.fields.scheduled-date')}} {{$dayjs(itemData.expected_shipping_date,'YYYY-MM-DD',itemData)}}</span></div></header><WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')"/></WCard><template v-if="itemData"><OperationsCompactFlow :key="itemData.status" :document-id="itemData.dn_id" kind="dn" current="handover"/><div class="detail-grid"><div class="main-column"><WCard v-if="itemData.status==='pending'&&canEdit"><div class="start"><h2>{{t('delivery.entity')}}</h2><WButton variant="primary" :loading="processing" @click="start">{{t('button.process')}}</WButton></div></WCard><DnShippingFlow v-if="itemData.dn_id" ref="flowRef" :dn-id="itemData.dn_id" mode="compact" :warehouse-id="itemData.dn?.warehouse_id??null" :complete-extras="completeExtras" @changed="syncFromTask"/><WCard flush><div class="section-title"><h3>{{t('delivery.fields.items')}}</h3></div><WTable :columns="columns" :rows="itemData.dn?.details||[]" inset><template #cell-goods="{row}"><NuxtLink class="w-delivery-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><small>{{row.goods?.code}}</small></template></WTable></WCard><WCard v-if="itemData.dn?.special_handling||itemData.dn?.packaging_info||itemData.dn?.remark"><h3>{{t('dn.fields.special-handling')}}</h3><p>{{itemData.dn?.special_handling}}</p><p>{{itemData.dn?.packaging_info}}</p><p>{{itemData.dn?.remark}}</p></WCard></div><aside><WCard><h3>{{t('delivery.fields.detail-info')}}</h3><div class="field-stack"><WField :label="t('common.entities.carrier')" required :error="errors.carrier"><WCombobox v-model="carrierValue" :search="searchCarriers" :selected-label="selectedCarrier?.name||''" :disabled="!canEdit||savingCarrier"/></WField><WField :label="t('dn.fields.transportation')" required :error="errors.transportation_mode"><WSelect v-model="itemData.transportation_mode" :options="selectOptions.transportation_modes.map(value=>({value,label:translateOption(value,'dn.transportation')}))" :disabled="!canEdit"/></WField><WField :label="t('common.fields.tracking-number')"><span class="tracking">{{itemData.tracking_number||'—'}}</span></WField></div></WCard><WCard><h3>{{t('common.fields.shipping-cost')}} <span>{{itemData.currency}}</span></h3><WInput v-model="itemData.shipping_cost" type="number" min="0" step="0.01" :aria-label="t('common.fields.shipping-cost')" :disabled="!canEdit"/><small v-if="taskEditable">{{t('delivery.tips.complete-in-flow')}}</small></WCard><WCard><h3>{{t('dn.fields.shipping-address')}}</h3><p class="recipient">{{itemData.recipient?.name}}</p><p>{{itemData.recipient?.phone}}</p><p>{{itemData.shipping_address}}</p></WCard><WCard><WField :label="t('common.fields.remark')"><WTextarea v-model="itemData.remark" :rows="3" :disabled="!canEdit"/></WField></WCard><WCard><h3>{{t('common.fields.task-logs')}}</h3><ol><li v-for="log in itemData.status_logs" :key="log.id"><span>{{t('common.status.'+log.new_status.replaceAll('_','-'))}}</span><small>{{$dayjs(log.changed_at,'MM/DD HH:mm',itemData)}} · {{log.operator?.user_name}}</small></li></ol></WCard></aside></div></template></div></template>
<style scoped>
.w-delivery-detail{display:flex;flex-direction:column;gap:16px;max-width:1216px}header{display:flex;flex-direction:column;gap:8px}nav{display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2)}.w-delivery-muted{color:var(--w-text-3);text-decoration:none}.title{display:flex;align-items:center;gap:12px}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:13px;line-height:20px;color:var(--w-text-3)}.w-delivery-link{color:var(--w-link);text-decoration:none}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:16px}.main-column,aside,.field-stack{display:flex;flex-direction:column;gap:16px}h2{margin:0;font-size:20px;line-height:28px;font-weight:600}h3{font-size:14px;line-height:22px;font-weight:600;margin:0 0 12px}h3>span{color:var(--w-text-3);font-weight:400}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}.section-title h3{font-size:16px;line-height:24px;margin:0}.start{display:flex;justify-content:space-between;align-items:center;gap:16px}.w-delivery-detail :deep(.w-table){min-width:560px}.w-delivery-detail :deep(.w-table td){padding-top:12px;padding-bottom:12px}.w-delivery-goods{font-size:14px;font-weight:500;color:var(--w-text-1);text-decoration:none}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}p{margin:0 0 4px;font-size:13px;line-height:20px;overflow-wrap:anywhere}.recipient{font-weight:600}.tracking{font-size:13px;overflow-wrap:anywhere}ol{list-style:none;padding:0;margin:0}li{font-size:13px;line-height:20px;padding:10px 0;border-bottom:1px solid var(--w-line)}li:last-child{border-bottom:0}@media(max-width:1100px){.detail-grid{grid-template-columns:minmax(0,1fr)}}
</style>
