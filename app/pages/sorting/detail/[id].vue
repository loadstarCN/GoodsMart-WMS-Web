<script lang="ts" setup>
import CompactFlow from '~/components/operations/CompactFlow.vue'
const staff=useStaffStore()
const canEdit=computed(()=>staff.hasPermission('sorting_edit'))
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
const { t, te } = useI18n();
// 商品分类存英文原值，显示译名
const { categoryLabel } = useOptionLabel();
const { bizErrorMessage } = useBizError();
// 批次提交的幂等键与提交锁
const batchKey = useBatchSubmitKey();
const submitting = ref(false);
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.sorting'),
  list: [t('nav.warehouse'), t('nav.sorting')]
}));


const totalNewSorted = computed<number>(() => {
  return (itemData.value?.asn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_sorted_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})

const totalNewDamaged = computed<number>(() => {
  return (itemData.value?.asn?.details ?? [])
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.new_damage_quantity) || 0)
    }, 0)
})


const totalOldSorted = computed<number>(() => {
  return (itemData.value?.asn?.details ?? []) // 空值防御链[1,4](@ref)
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_sorted_quantity) || 0) // 安全数值转换[3](@ref)
    }, 0)
})

const totalOldDamaged = computed<number>(() => {
  return (itemData.value?.asn?.details ?? [])
    .reduce((sum: number, item: any) => {
      return sum + (Number(item.old_damage_quantity) || 0)
    }, 0)
})


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
          if (itemData.value?.status !== 'in_progress') {
            return;
          }
          const taskSummary = (itemData.value?.task_details ?? []) 
            .reduce((acc: Record<string, { sorted: number; damage: number }>, item:any) => {
              const goodsId = item?.goods_id; // 可选链防止空值 
              
              // 类型校验防御
              if (typeof goodsId !== 'string' && typeof goodsId !== 'number') return acc;
              
              const current = acc[goodsId] || { sorted: 0, damage: 0 }; // 默认值兜底
              const sorted = Number(item.sorted_quantity) || 0; // 安全数值转换
              const damage = Number(item.damage_quantity) || 0;

              acc[goodsId] = {
                sorted: current.sorted + sorted,
                damage: current.damage + damage
              };
              
              return acc;
            }, {});
          // 更新asn.details中的旧数量
          itemData.value.asn.details.forEach((item:any) => {
            const goodsId = item.goods_id;
            // 统计task_details中的数据（按goods_id聚合）
            // 使用可选链防止undefined错误
            // 双问号操作符设置默认值
            item.old_sorted_quantity = taskSummary[goodsId]?.sorted ?? 0;
            item.old_damage_quantity = taskSummary[goodsId]?.damage ?? 0;
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



const addSortedQTY = (item:any) => {
    item.new_sorted_quantity = 0;
};
const addDamageQTY = (item:any) => {
    item.new_damage_quantity = 0;
};

const resetTask = () => {
    itemData.value.asn.details.forEach((item:any) => {
        item.new_sorted_quantity = undefined;
        item.new_damage_quantity = undefined;
    });
};

const saveTask = async () => {
  if(!canEdit.value||actionBusy.value)return;
  // 安全访问嵌套属性并处理空值
  const details = (itemData.value?.asn?.details ?? [])
    .map((item:any) => ({
      goods_id: item?.goods_id ?? null,
      sorted_quantity: Number(item?.new_sorted_quantity) || 0,
      damage_quantity: Number(item?.new_damage_quantity) || 0
    }))
    .filter((item:any) => {
      // 同时满足两个条件才保留条目
      return (
        item.goods_id !== undefined && // 原始过滤条件[1](@ref)
        (item.sorted_quantity !== 0 || item.damage_quantity !== 0) // 新增过滤条件
      );
    });

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    details
  };
  if (payload.details.length === 0) {
    showToast(t('error.empty-sorting-items'), 'error');
    return;
  }
  if (submitting.value) return;

  submitting.value = true;
  let done = false;
  let replayMismatch = false;
  try {
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/batches/`, {
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
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData(); // 确保数据是最新的
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};



// 规格采集（后端 warehouse/asn/spec_capture.py）：完成分拣时仓库规则为提示（warn）照常完成，响应的 spec_pending 列出
// 本单分拣到、还没采集规格的行；为拦截（block）时 409 17021，details.lines 同一结构。采集界面以后做，这里只列出商品和待采集项
// 行：{asn_detail_id, goods_id, goods_code, goods_name, spec_pending: [weight | dimensions | origin_country]}
const specPendingText = (lines: unknown): string => {
  if (!Array.isArray(lines)) return '';
  return lines.filter((line: any) => line && typeof line === 'object').map((line: any) => {
    const goods = [line.goods_code, line.goods_name].filter(Boolean).join(' ') || `#${line.goods_id ?? line.asn_detail_id}`;
    const fields = (Array.isArray(line.spec_pending) ? line.spec_pending : [])
      .map((field: string) => {
        const key = `sorting.spec-pending.fields.${String(field).replace(/_/g, '-')}`;
        return te(key) ? t(key) : String(field);
      })
      .join(t('shipping.list-separator'));
    return fields ? t('sorting.spec-pending.line', { goods, fields }) : goods;
  }).join(t('sorting.spec-pending.separator'));
};

const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/complete/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
            const pending = specPendingText(data?.spec_pending);
            if (pending) {
              showAlert(t('sorting.spec-pending.title'), t('sorting.spec-pending.warn', { items: pending }), 'warning');
            }
        },
        onError: (error) => {
            // 17021：仓库要求先采集规格，列出待采集的商品和项
            const pending = error.code === 17021 ? specPendingText(error.details?.lines) : '';
            if (pending) {
              showAlert(t('sorting.spec-pending.blocked-title'), t('sorting.spec-pending.blocked', { items: pending }), 'error');
              return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;   
};

const hasUnsavedChanges = computed(() => {
  return itemData.value?.asn?.details?.some((item: any) => {
    const sorted = Number(item?.new_sorted_quantity) || 0
    const damaged = Number(item?.new_damage_quantity) || 0
    return sorted > 0 || damaged > 0
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
    t('action-results.complete-confirm', { entity: t('sorting.entity') }),
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
        await httpRequest(`/api/warehouse/sorting/${taskId}/details/${item_id}`, {
            method: 'DELETE',
            onSuccess: async() => {
                showToast(t('action-results.success'), 'success')
                await fetchData();                
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

const saved=(row:any,field:'sorted_quantity'|'damage_quantity')=>(itemData.value?.task_details||[]).filter((line:any)=>line.goods_id===row.goods_id).reduce((sum:number,line:any)=>sum+Number(line[field]||0),0)
const variance=(row:any)=>saved(row,'sorted_quantity')+saved(row,'damage_quantity')+Number(row.new_sorted_quantity||0)+Number(row.new_damage_quantity||0)-row.quantity
const goodsColumns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},{key:'quantity',label:t('common.quantities.expected'),type:'qty' as const},{key:'sorted',label:t('common.quantities.sorted'),type:'qty' as const},{key:'damaged',label:t('common.quantities.damaged'),type:'qty' as const},{key:'new_sorted',label:t('operations.ui.new-good')},{key:'new_damage',label:t('operations.ui.new-damage')},{key:'variance',label:t('operations.ui.variance'),type:'qty' as const}])
useHead({title:()=>`SORT-${taskId}`})
</script>
<template><div class="w-sorting-detail w-scope"><header><nav><NuxtLink class="w-sort-muted" to="/sorting">{{t('nav.sorting')}}</NuxtLink><span>/</span><span>SORT-{{taskId}}</span></nav><div class="w-sort-heading"><h1>SORT-{{taskId}}</h1><WStatus v-if="itemData" :tone="itemData.status==='completed'?'ok':itemData.status==='in_progress'?'warn':'none'">{{t('common.status.'+itemData.status.replaceAll('_','-'))}}</WStatus></div><div v-if="itemData" class="w-sort-meta"><NuxtLink class="w-sort-link" :to="'/asn/detail/'+itemData.asn_id">ASN-{{itemData.asn_id}}</NuxtLink><span>{{itemData.asn?.supplier?.name}}</span><span>{{$dayjs(itemData.started_at,undefined,itemData)}}</span></div></header><CompactFlow v-if="itemData" :key="itemData.status" :document-id="itemData.asn_id" kind="asn" current="sorting" /><WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')" /></WCard><div v-if="itemData" class="w-sort-layout"><div class="w-sort-main"><WCard flush><div class="w-sort-section"><div class="w-sort-section-heading"><h2>{{t('nav.goods')}} <small>{{itemData.asn?.details?.length}}</small></h2><span>{{t('common.quantities.sorted')}} <strong>{{itemData.total_sorted_quantity+itemData.total_damage_quantity}}</strong> / {{itemData.expected_quantity}}</span></div><progress :value="itemData.total_sorted_quantity+itemData.total_damage_quantity" :max="Math.max(1,itemData.expected_quantity)" :aria-label="t('operations.ui.progress')" /></div><WTable :columns="goodsColumns" :rows="itemData.asn?.details||[]" inset><template #cell-goods="{row}"><NuxtLink class="w-sort-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-sort-sub">{{row.goods?.code}}</span><span class="w-sort-sub">{{row.remark}}</span></template><template #cell-sorted="{row}">{{saved(row,'sorted_quantity')}}</template><template #cell-damaged="{row}">{{saved(row,'damage_quantity')}}</template><template #cell-new_sorted="{row}"><WInput v-if="itemData.status==='in_progress'&&canEdit" v-model.number="row.new_sorted_quantity" type="number" min="0" step="1" size="sm" align="right" :aria-label="row.goods?.name+' '+t('operations.ui.new-good')" :disabled="submitting||actionBusy" /><span v-else>—</span></template><template #cell-new_damage="{row}"><WInput v-if="itemData.status==='in_progress'&&canEdit" v-model.number="row.new_damage_quantity" type="number" min="0" step="1" size="sm" align="right" :aria-label="row.goods?.name+' '+t('operations.ui.new-damage')" :disabled="submitting||actionBusy" /><span v-else>—</span></template><template #cell-variance="{row}"><span :class="{'w-sort-warning':variance(row)!==0}">{{variance(row)>0?'+':''}}{{variance(row)}}</span></template></WTable><footer v-if="canEdit"><WButton v-if="itemData.status==='pending'" variant="primary" :loading="actionBusy" @click="runAction(processTask)">{{t('button.process')}}</WButton><template v-if="itemData.status==='in_progress'"><span class="w-sort-sub">{{t('operations.ui.this-entry')}} {{totalNewSorted+totalNewDamaged}}</span><WButton :disabled="submitting||actionBusy" @click="resetTask">{{t('button.reset')}}</WButton><WButton :disabled="!hasUnsavedChanges||actionBusy" :loading="submitting" @click="saveTask">{{t('button.save')}}</WButton><WButton variant="primary" :disabled="hasUnsavedChanges||submitting" :loading="actionBusy" @click="completeFn">{{t('button.complete')}}</WButton></template></footer></WCard></div><aside><WCard><h3>{{t('nav.ASN')}}</h3><dl><dt>{{t('nav.supplier')}}</dt><dd>{{itemData.asn?.supplier?.name}}</dd><dt>{{t('dn.fields.order-no')}}</dt><dd>{{itemData.asn?.order_number||'—'}}</dd><dt>{{t('nav.warehouse')}}</dt><dd>{{itemData.asn?.warehouse?.name}}</dd><dt>{{t('common.fields.remark')}}</dt><dd>{{itemData.asn?.remark||'—'}}</dd></dl></WCard><WCard><h3>{{t('operations.ui.records')}} <small>{{itemData.batches?.length||0}}</small></h3><ol class="w-sort-records"><li v-for="batch in itemData.batches" :key="batch.id"><strong>#{{batch.id}}</strong><span class="w-sort-sub">{{$dayjs(batch.operation_time,'MM/DD HH:mm',itemData)}} · {{batch.operator?.user_name}}</span><div v-for="line in batch.details" :key="line.id" class="w-sort-record-line"><span>{{line.goods?.name}}</span><span>{{line.sorted_quantity}} / {{line.damage_quantity}}</span><WButton v-if="canEdit&&itemData.status==='in_progress'" icon="trash" icon-only variant="danger" size="sm" :aria-label="t('button.delete')" :disabled="actionBusy||submitting" @click="runAction(()=>deleteDetailItem(line.id))" /></div></li></ol></WCard><WCard><h3>{{t('operations.ui.status-records')}}</h3><ol class="w-sort-records"><li v-for="log in itemData.status_logs" :key="log.id"><span class="w-sort-sub">{{$dayjs(log.changed_at,'MM/DD HH:mm',itemData)}} · {{log.operator?.user_name}}</span>{{t('common.status.'+String(log.new_status).replaceAll('_','-'))}}</li></ol></WCard></aside></div></div></template>
<style scoped>
.w-sorting-detail{display:flex;flex-direction:column;gap:16px}.w-sorting-detail header{display:flex;flex-direction:column;gap:8px}.w-sorting-detail nav{display:flex;gap:8px;color:var(--w-text-2);font-size:13px;line-height:20px}.w-sort-muted{color:var(--w-text-3);text-decoration:none}.w-sort-heading{display:flex;gap:12px;align-items:center}.w-sort-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-sort-meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:13px;color:var(--w-text-3)}.w-sort-link{color:var(--w-link);text-decoration:none}.w-sort-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.w-sort-main,.w-sort-layout aside{min-width:0;display:flex;flex-direction:column;gap:16px}.w-sort-section{padding:16px 24px;display:flex;flex-direction:column;gap:12px}.w-sort-section-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px}.w-sorting-detail h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.w-sorting-detail small{font-size:13px;font-weight:400;color:var(--w-text-3)}.w-sort-section progress{width:100%;height:6px;border:0;border-radius:6px;overflow:hidden}.w-sort-section progress::-webkit-progress-bar{background:#EDEFF3}.w-sort-section progress::-webkit-progress-value{background:#7855FE}.w-sort-main :deep(.w-table){min-width:780px}.w-sort-main :deep(.w-table td){padding-top:14px;padding-bottom:14px;vertical-align:top}.w-sort-main :deep(.w-input){min-width:64px;max-width:88px}.w-sort-goods{color:var(--w-text-1);font-size:14px;font-weight:500;text-decoration:none}.w-sort-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.w-sort-warning{color:#B87400}.w-sort-main footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--w-border)}.w-sort-main footer>span{margin-right:auto}.w-sort-layout aside :deep(.w-card__body){padding:16px 20px 20px}.w-sort-layout h3{margin:0 0 10px;font-size:14px;line-height:22px;font-weight:600}.w-sort-layout dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px;font-size:13px;line-height:20px;margin:0}.w-sort-layout dt{color:var(--w-text-3);font-weight:400}.w-sort-layout dd{margin:0;overflow-wrap:anywhere}.w-sort-records{list-style:none;margin:0;padding:0}.w-sort-records li{padding:12px 0;border-top:1px solid var(--w-line);font-size:13px}.w-sort-record-line{display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:12px;margin-top:6px}.w-sort-record-line>span:first-child{flex:1;min-width:0}@media(max-width:1100px){.w-sort-layout{grid-template-columns:minmax(0,1fr)}}
</style>
