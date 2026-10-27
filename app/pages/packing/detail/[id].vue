<script lang="ts" setup>
import CompactFlow from '~/components/operations/CompactFlow.vue'
const staff=useStaffStore()
const canEdit=computed(()=>staff.hasPermission('packing_edit'))
const actionBusy=ref(false)
const runAction=async(action:()=>Promise<any>)=>{if(actionBusy.value||submitting.value||!canEdit.value)return;actionBusy.value=true;try{await action()}finally{actionBusy.value=false}}

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
const route = useRoute();
const taskId = route.params.id;

const itemData = ref<any>(null);
const activeTab = ref('details');
const { t } = useI18n();
// 商品分类存英文原值，显示译名
const { categoryLabel } = useOptionLabel();
const { bizErrorMessage } = useBizError();
// 批次提交的幂等键与提交锁
const batchKey = useBatchSubmitKey();
const submitting = ref(false);
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.packing'),
  list: [t('nav.warehouse'), t('nav.packing')]
}));


const totalNewPacked = computed<number>(() => {
  return (itemData.value?.dn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_packed_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})


const totalOldPacked = computed<number>(() => {
  return (itemData.value?.dn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_packed_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/packing/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          if (itemData.value?.status !== 'in_progress') {
            return;
          }
          const taskSummary = (itemData.value?.task_details ?? []) 
            .reduce((acc: Record<string, { packed: number}>, item:any) => {
              const goodsId = item?.goods_id; // 可选链防止空值 
              
              // 类型校验防御
              if (typeof goodsId !== 'string' && typeof goodsId !== 'number') return acc;
              
              const current = acc[goodsId] || { packed: 0 }; // 默认值兜底
              const packed = Number(item.packed_quantity) || 0; // 安全数值转换

              acc[goodsId] = {
                packed: current.packed + packed,
              };
              
              return acc;
            }, {});
          // 更新asn.details中的旧数量
          itemData.value.dn.details.forEach((item:any) => {
            const goodsId = item.goods_id;
            // 统计task_details中的数据（按goods_id聚合）
            // 使用可选链防止undefined错误
            // 双问号操作符设置默认值
            item.old_packed_quantity = taskSummary[goodsId]?.packed ?? 0;
          });
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


const addPackedQTY = (item:any) => {
    item.new_packed_quantity = item.picked_quantity-item.old_packed_quantity; // 初始化为已拣货数量
};

const resetTask = () => {
    itemData.value.dn.details.forEach((item:any) => {
        item.new_packed_quantity = undefined;
    });
};

const saveTask = async () => {
  if(!canEdit.value||actionBusy.value)return;
  if((itemData.value?.dn?.details||[]).some((line:any)=>{const n=Number(line.new_packed_quantity||0);return !Number.isInteger(n)||n<0||n>Number(line.picked_quantity||0)-Number(line.old_packed_quantity||0)})){showToast(t('error.check-quantities'),'error');return}
  // 安全访问嵌套属性并处理空值
  const details = (itemData.value?.dn?.details ?? [])
    .map((item: any) => {
      // 计算可打包数量（已拣未包数量）
      const availableToPack = 
        (Number(item?.picked_quantity) || 0) - 
        (Number(item?.old_packed_quantity) || 0);
      
      // 获取新打包数量
      const newPacked = Number(item?.new_packed_quantity) || 0;
      
      // 校验打包数量不超过上限
      if (newPacked > availableToPack) {
        showToast(t('error.check-quantities'), 'error');
        return null; // 标记无效条目
      }
      
      return {
        goods_id: item?.goods_id ?? null,
        packed_quantity: newPacked
      };
    })
    .filter(Boolean) // 移除被标记为null的无效条目
    .filter((item: any) => {
      // 同时满足两个条件才保留条目
      return (
        item.goods_id !== undefined && 
        item.packed_quantity !== 0
      );
    });

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    details
  };
  if (payload.details.length === 0) {
    showToast(t('error.empty-packing-items'), 'error');
    return;
  }
  if (submitting.value) return;

  submitting.value = true;
  let done = false;
  let replayMismatch = false;
  try {
    const data = await httpRequest(`/api/warehouse/packing/${taskId}/batches/`, {
        method: 'POST',
        // 幂等键：失败后重试沿用同一个（上次其实已成功时后端返回 200 + 已有批次），成功后清掉
        body: { ...payload, client_batch_id: batchKey.take() },
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            replayMismatch = batchKey.isReplayMismatch(error);
            showToast(bizErrorMessage(error), 'error')
        }
    })
    // 成功（201 新建 / 200 重放）：清掉幂等键，重新读取并清空录入后才解除提交锁（免得旧录入被再提交一次）
    if (done) {
        batchKey.clear();
        await fetchData();
        resetTask();
        showToast(t('action-results.success'), 'success')
        flowRef.value?.reload();
    }
    // 16121：这次提交此前已按不同的内容处理过，换新的幂等键，重新读取并清空录入，让用户核对后再录
    if (replayMismatch) {
        batchKey.clear();
        await fetchData();
        resetTask();
    }
    return data;
  } finally {
    submitting.value = false;
  }
};

const processTask = async () => {
    const data = await httpRequest(`/api/warehouse/packing/${taskId}/process/`, {
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



const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/packing/${taskId}/complete/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
            // 打包完成：DN 到 packed，流程轮到单证 / 运单
            flowRef.value?.reload();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const hasUnsavedChanges = computed(() => {
  return itemData.value?.dn?.details?.some((item: any) => {
    const packed = Number(item?.new_packed_quantity) || 0
    return packed > 0 
  }) ?? false
})

function completeFn() {

  // 强制获取最新计算值
  if (hasUnsavedChanges.value) {
    showToast(t('action-results.task-save-changes-before-complete'), 'error');
    return;
  }

  // 使用封装的确认对话框
  showConfirm(
    t('action-results.complete-confirm-title'),
    t('action-results.complete-confirm', { entity: t('packing.entity') }),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行完成任务
      runAction(completeTask)
    }
  });
}


// 删除Item
const deleteDetailItem = async (item_id:Number) => {
    const confirm = await showConfirm(t('action-results.delete-confirm-title'), t('action-results.delete-confirm', { entity: t('common.fields.task-details') }),t('button.confirm'),t('button.cancel'));
    if (confirm) {
        await httpRequest(`/api/warehouse/packing/${taskId}/details/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();
                flowRef.value?.reload();
            },
            onError: (error) => {
                showToast(error.message, 'error')
            }
        })
    }
}
onMounted(async() => {
  await fetchData();
});

// ------------------ 发货流程（compact）：录箱子、单证、运单……都在流程里，本页只展开当前这一步 ----------------------
const flowRef = ref<{ reload: () => Promise<void> } | null>(null);

const saved=(row:any)=>(itemData.value?.task_details||[]).filter((line:any)=>line.goods_id===row.goods_id).reduce((sum:number,line:any)=>sum+Number(line.packed_quantity||0),0)
const goodsColumns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},{key:'picked_quantity',label:t('common.quantities.picked'),type:'qty' as const},{key:'processed',label:t('common.quantities.packed'),type:'qty' as const},{key:'entry',label:t('operations.ui.this-entry')}])
useHead({title:()=>`PACK-${taskId}`})
</script>
<template><div class="w-packing-detail w-scope"><header><nav><NuxtLink class="w-sort-muted" to="/packing">{{t('nav.packing')}}</NuxtLink><span>/</span><span>PACK-{{taskId}}</span></nav><div class="w-sort-heading"><h1>PACK-{{taskId}}</h1><WStatus v-if="itemData" :tone="itemData.status==='completed'?'ok':itemData.status==='in_progress'?'warn':'none'">{{t('common.status.'+itemData.status.replaceAll('_','-'))}}</WStatus></div><div v-if="itemData" class="w-sort-meta"><NuxtLink class="w-sort-link" :to="'/dn/detail/'+itemData.dn_id">DN-{{itemData.dn_id}}</NuxtLink><span>{{itemData.dn?.recipient?.name}}</span><span>{{$dayjs(itemData.started_at,undefined,itemData)}}</span></div></header><CompactFlow v-if="itemData" :key="itemData.status" :document-id="itemData.dn_id" kind="dn" current="packing" /><WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')" /></WCard><div v-if="itemData" class="w-sort-layout"><div class="w-sort-main"><WCard flush><div class="w-sort-section"><div class="w-sort-section-heading"><h2>{{t('nav.goods')}} <small>{{itemData.dn?.details?.length}}</small></h2><span>{{t('common.quantities.packed')}} <strong>{{itemData.total_packed_quantity}}</strong> / {{itemData.expected_quantity}}</span></div><progress :value="itemData.total_packed_quantity" :max="Math.max(1,itemData.expected_quantity)" :aria-label="t('operations.ui.progress')" /></div><WTable :columns="goodsColumns" :rows="itemData.dn?.details||[]" inset><template #cell-goods="{row}"><NuxtLink class="w-sort-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-sort-sub">{{row.goods?.code}}</span><span class="w-sort-sub">{{row.remark}}</span></template><template #cell-processed="{row}">{{saved(row)}}</template><template #cell-entry="{row}"><WInput v-if="itemData.status==='in_progress'&&canEdit" v-model.number="row.new_packed_quantity" type="number" min="0" step="1" size="sm" align="right" :aria-label="row.goods?.code+' '+t('operations.ui.this-entry')" :disabled="submitting||actionBusy" /><span v-else>—</span></template></WTable><footer v-if="canEdit"><WButton v-if="itemData.status==='pending'" variant="primary" :loading="actionBusy" @click="runAction(processTask)">{{t('button.process')}}</WButton><template v-if="itemData.status==='in_progress'"><span class="w-sort-sub">{{t('operations.ui.this-entry')}} {{totalNewPacked}}</span><WButton :disabled="submitting||actionBusy" @click="resetTask">{{t('button.reset')}}</WButton><WButton :disabled="!hasUnsavedChanges||actionBusy" :loading="submitting" @click="saveTask">{{t('button.save')}}</WButton><WButton variant="primary" :disabled="hasUnsavedChanges||submitting" :loading="actionBusy" @click="completeFn">{{t('button.complete')}}</WButton></template></footer></WCard><DnShippingFlow ref="flowRef" :dn-id="itemData.dn_id" mode="compact" :warehouse-id="itemData?.dn?.warehouse_id??null" /></div><aside><WCard><h3>{{t('nav.DN')}}</h3><dl><dt>{{t('nav.recipient')}}</dt><dd>{{itemData.dn?.recipient?.name}}</dd><dt>{{t('dn.fields.order-no')}}</dt><dd>{{itemData.dn?.order_number||'—'}}</dd><dt>{{t('nav.warehouse')}}</dt><dd>{{itemData.dn?.warehouse?.name}}</dd><dt>{{t('common.fields.remark')}}</dt><dd>{{itemData.dn?.remark||'—'}}</dd></dl></WCard><WCard><h3>{{t('operations.ui.packing-records')}} <small>{{itemData.batches?.length||0}}</small></h3><ol class="w-sort-records"><li v-for="batch in itemData.batches" :key="batch.id"><strong>#{{batch.id}}</strong><span class="w-sort-sub">{{$dayjs(batch.operation_time,'MM/DD HH:mm',itemData)}} · {{batch.operator?.user_name}}</span><div v-for="line in batch.details" :key="line.id" class="w-sort-record-line"><span>{{line.goods?.name}}</span><span>{{line.packed_quantity}}</span><WButton v-if="canEdit&&itemData.status==='in_progress'" icon="trash" icon-only variant="danger" size="sm" :aria-label="t('button.delete')" :disabled="actionBusy||submitting" @click="runAction(()=>deleteDetailItem(line.id))" /></div></li></ol></WCard><WCard><h3>{{t('operations.ui.status-records')}}</h3><ol class="w-sort-records"><li v-for="log in itemData.status_logs" :key="log.id"><span class="w-sort-sub">{{$dayjs(log.changed_at,'MM/DD HH:mm',itemData)}} · {{log.operator?.user_name}}</span>{{t('common.status.'+String(log.new_status).replaceAll('_','-'))}}</li></ol></WCard></aside></div></div></template>
<style scoped>
.w-packing-detail{display:flex;flex-direction:column;gap:24px}.w-packing-detail header{display:flex;flex-direction:column;gap:8px}.w-packing-detail nav{display:flex;gap:8px;color:var(--w-text-2);font-size:13px;line-height:20px}.w-sort-muted{color:var(--w-text-3);text-decoration:none}.w-sort-heading{display:flex;gap:12px;align-items:center}.w-sort-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-sort-meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:13px;color:var(--w-text-3)}.w-sort-link{color:var(--w-link);text-decoration:none}.w-sort-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.w-sort-main,.w-sort-layout aside{min-width:0;display:flex;flex-direction:column;gap:16px}.w-sort-section{padding:16px 24px;display:flex;flex-direction:column;gap:12px}.w-sort-section-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px}.w-packing-detail h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.w-packing-detail small{font-size:13px;font-weight:400;color:var(--w-text-3)}.w-sort-section progress{width:100%;height:6px;border:0;border-radius:6px;overflow:hidden}.w-sort-section progress::-webkit-progress-bar{background:#EDEFF3}.w-sort-section progress::-webkit-progress-value{background:#7855FE}.w-sort-main :deep(.w-table){min-width:780px}.w-sort-main :deep(.w-table td){padding-top:14px;padding-bottom:14px;vertical-align:top}.w-sort-main :deep(.w-input){min-width:64px;max-width:88px}.w-sort-goods{color:var(--w-text-1);font-size:14px;font-weight:500;text-decoration:none}.w-sort-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.w-sort-warning{color:#B87400}.w-sort-main footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--w-border)}.w-sort-main footer>span{margin-right:auto}.w-sort-layout aside :deep(.w-card__body){padding:16px 20px 20px}.w-sort-layout h3{margin:0 0 10px;font-size:14px;line-height:22px;font-weight:600}.w-sort-layout dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px;font-size:13px;line-height:20px;margin:0}.w-sort-layout dt{color:var(--w-text-3);font-weight:400}.w-sort-layout dd{margin:0;overflow-wrap:anywhere}.w-sort-records{list-style:none;margin:0;padding:0}.w-sort-records li{padding:12px 0;border-top:1px solid var(--w-line);font-size:13px}.w-sort-record-line{display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:12px;margin-top:6px}.w-sort-record-line>span:first-child{flex:1;min-width:0}@media(max-width:1100px){.w-sort-layout{grid-template-columns:minmax(0,1fr)}}
</style>
