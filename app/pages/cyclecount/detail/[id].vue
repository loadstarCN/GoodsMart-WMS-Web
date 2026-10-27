<script lang="ts" setup>
const staff=useStaffStore(),actionBusy=ref(false)
const canEdit=computed(()=>staff.hasPermission('cyclecount_edit'))
const runAction=async(action:()=>Promise<any>)=>{if(actionBusy.value||saving.value||!canEdit.value)return;actionBusy.value=true;try{await action()}finally{actionBusy.value=false}}

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
const router = useRouter();
// 防重复提交：保存明细 / 生成调整单进行中
const saving = ref(false);
const creatingAdjustment = ref(false);
// 本页已生成过调整单（拿不到调整单 ID 无法跳转时，隐藏按钮防止再生成）
const adjustmentCreated = ref(false);
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.cyclecount'),
  list: [t('nav.warehouse'), t('nav.cyclecount')]
}));


/**
 * 实盘录入（后端 cyclecount/services.py batch_save_task_details）：提交的 actual_quantity 就是该行的实盘数（绝对值，
 * 不是在已存的数上累加），后端按录入那一刻的库位库存重取系统数、算差异。录入框里填的也是实盘数：盘错了直接改。
 * 「已录入」= 明细已完成或有录入人（operator_id），与后端 is_recorded 一致。
 */
const isRecorded = (item: any) => item?.status === 'completed' || (item?.operator_id !== null && item?.operator_id !== undefined);
/** 本次录入框里有值 */
const hasInput = (item: any) => item?.new_cyclecount_quantity !== undefined && item?.new_cyclecount_quantity !== null
  && String(item.new_cyclecount_quantity).trim() !== '';
/** 该行当前的实盘数：本次录入的值优先，否则已保存的实盘数 */
const effectiveActual = (item: any): number =>
  hasInput(item) ? (Number(item.new_cyclecount_quantity) || 0) : (Number(item?.actual_quantity) || 0);
/** 该行是否计入差异：已录入或本次录入了 */
const counted = (item: any) => isRecorded(item) || hasInput(item);
/** 该行差异（实盘 − 系统）；还没录入的行 null */
const rowDifference = (item: any): number | null =>
  counted(item) ? effectiveActual(item) - (Number(item?.system_quantity) || 0) : null;

/** 进行中的实际总数：每行当前的实盘数 */
const totalActualInProgress = computed<number>(() =>
  (itemData.value?.task_details ?? []).reduce((sum: number, item: any) => sum + effectiveActual(item), 0)
)
/** 进行中的差异合计：只算已录入 / 本次录入的行（未录入的行还没有差异） */
const totalDifferenceInProgress = computed<number>(() =>
  (itemData.value?.task_details ?? []).reduce((sum: number, item: any) => sum + (rowDifference(item) ?? 0), 0)
)



const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
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



/**
 * 本次录入过的行（点了「+」或改过数量）：保存时只提交这些行，盘到 0 件（增量 0）也要提交——
 * 后端要求每条明细都明确录入过才能完成盘点（16114），不能再按「数量是否为 0」判断要不要提交
 */
const isTouched = (item: any) => !!item?.touched && item?.status !== 'completed';
/** 完成盘点被拒（16114）时还没录入的明细 id：对应行标红 */
const unrecordedIds = ref<number[]>([]);

// 点「录入」：录入框带出已保存的实盘数（还没录入过的留空），在此基础上改成实盘数
const addCycleCountQTY = (item:any) => {
    item.new_cyclecount_quantity = isRecorded(item) ? (Number(item.actual_quantity) || 0) : '';
    item.touched = true;
};
const markTouched = (item: any) => {
    item.touched = true;
};

const resetTask = () => {
    itemData.value.task_details.forEach((item:any) => {
        item.new_cyclecount_quantity = undefined;
        item.touched = false;
    });
};

const saveTask = async () => {
  if (saving.value||actionBusy.value||!canEdit.value) return;
  // 只提交本次录入过且未完成的行（含增量 0：盘到 0 件也要提交），没动过的行不提交：
  // 先过滤再映射（映射后的对象没有录入标记）；整单提交会按打开页面时的旧值覆盖别人刚录的结果；已完成的行后端也会拒绝
  const touchedItems = (itemData.value?.task_details ?? []).filter((item: any) => isTouched(item));
  // 打开了录入框却没填数：不提交（盘到 0 件要明确填 0）
  if (touchedItems.some((item: any) => !hasInput(item)||!Number.isInteger(Number(item.new_cyclecount_quantity))||Number(item.new_cyclecount_quantity)<0)) {
    showToast(t('cyclecount.validation.no-quantity'), 'error');
    return;
  }
  // 提交的是实盘数（绝对值），不是增量
  const details = touchedItems.map((item: any) => ({
    id: item.id,
    actual_quantity: Math.max(0, Math.floor(Number(item.new_cyclecount_quantity) || 0)),
  }));

  // 组合请求参数（保持原逻辑不变）
  const payload = {
    task_id: itemData.value?.id,
    details:details
  };
  if (payload.details.length === 0) {
    showToast(t('cyclecount.validation.no-quantity'), 'error');
    return;
  }

  saving.value = true;
  try {
    let done = false;
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/details-batch-save/`, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' }, // 明确设置类型
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            showToast(bizErrorMessage(error), 'error')
        }
    })
    // 重新读取完、清掉本次录入后再解锁：否则读取期间录入值还在，再点保存会把同一批数量再加一次
    if (done) {
        // 保存过的行不再标红；后端按录入时的系统数量重算差异，重新读取即可
        const savedIds = details.map((d: any) => d.id);
        unrecordedIds.value = unrecordedIds.value.filter((id: number) => !savedIds.includes(id));
        await fetchData();
        await resetTask();
        showToast(t('action-results.success'), 'success')
    }
    return data; 
    
    // 处理成功逻辑
  } catch (err) {
    // 处理错误逻辑
  } finally {
    saving.value = false;
  }
};

const processTask = async () => {
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/process/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            itemData.value = data;
            showToast(t('action-results.task-start-process'), 'success')
            await fetchData();
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};

const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/complete/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            unrecordedIds.value = [];
            showToast(t('action-results.task-complete'), 'success')
        },
        onError: (error) => {
            // 16114：还有明细没录入（details.detail_ids），标红这些行
            if (error.code === 16114) {
                const ids = error.details?.detail_ids;
                unrecordedIds.value = Array.isArray(ids) ? ids.map((id: any) => Number(id)) : [];
                showAlert(t('button.complete'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;   
};

const completeItem = async (item:any) => {
    const data = await httpRequest(`/api/warehouse/cyclecount/${taskId}/details/${item.id}/complete/`, {
        method: 'PUT',
        onSuccess: async(data) => {
            // 更新当前项的状态
            await fetchData(); 
            showToast(t('action-results.task-item-complete'), 'success')
        },
        onError: (error) => {
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;   
};

// 有录入过但还没保存的行（含录入 0）
const hasUnsavedChanges = computed(() => {
  return itemData.value?.task_details?.some((item: any) => isTouched(item)) ?? false
})

// 完成盘点的条件与后端一致（complete_task：每条明细都已录入即可，不要求每行都点「完成」；否则 409 16114）
const allItemsRecorded = computed(() => {
  return itemData.value?.task_details?.every((item: any) => isRecorded(item)) ?? false
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
    t('action-results.complete-confirm', { entity: t('cyclecount.entity') }),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行完成任务
      runAction(completeTask)
    }
  });
}

const adjustment_reason = ref('');
const validDetails = computed(() => {
  return itemData.value?.task_details
    ?.filter((item: any) => item.difference !== 0)
    ?? []
})
const carete_adjustmentFn = async () => {
  if (creatingAdjustment.value || adjustmentCreated.value) return null
  // 如果无有效记录，直接提示并返回
  if (validDetails.value.length === 0) {
    showToast(t('cyclecount.validation.no-valid-records'), 'warning')
    return null
  }
  // 使用封装的确认对话框
  const confirmed = await showConfirm(
    t('action-results.create-confirm-title'),
    t('action-results.create-confirm', { entity: t('adjustment.entity') }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (confirmed) {
    // 执行创建调整
    await carete_adjustment();
  }
  return null
};

const carete_adjustment = async () => {
  // 提交锁：连点只生成一张调整单（同一盘点单重复生成后端返回 409）
  if (creatingAdjustment.value || adjustmentCreated.value) return null
  creatingAdjustment.value = true
  // 在回调里赋值：用 as 声明，避免 TS 把它收窄成 null
  let createdId = null as number | string | null

  const data = await httpRequest(`/api/warehouse/adjustment/create_adjustment_by_cyclecount/${taskId}`, {
    method: 'POST',
    onSuccess: (data) => {
      adjustmentCreated.value = true
      createdId = data?.id ?? null
      showToast(t('action-results.success'), 'success')
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error')
      // 16086：该盘点单已生成过调整单，details.adjustment_id 是已有的那张，直接跳过去
      if (Number(error?.code) === 16086 && error?.details?.adjustment_id) {
        adjustmentCreated.value = true
        createdId = error.details.adjustment_id
      }
    },
    onFinally: () => {
      creatingAdjustment.value = false
    },
  });

  // 成功后跳到新建的调整单（审批在调整单详情页进行）
  if (createdId !== null) {
    await router.push(`/adjustment/detail/${createdId}`)
  }
  return data;
};

onMounted(async() => {
  await fetchData();
});

const columns=computed(()=>[{key:'goods',label:t('operations.ui.location-goods'),wrap:true},{key:'system_quantity',label:t('common.quantities.system'),type:'qty' as const},{key:'actual',label:t('common.quantities.actual')},{key:'difference',label:t('operations.ui.variance')},{key:'entry',label:t('operations.ui.this-entry')},{key:'action',label:t('common.fields.action')}])
const recordedCount=computed(()=>(itemData.value?.task_details||[]).filter(isRecorded).length)
const remaining=computed(()=>Math.max(0,(itemData.value?.task_details?.length||0)-recordedCount.value))
useHead({title:()=>`CC-${taskId}`})
</script>
<template><div class="w-cycle-detail w-scope"><header><nav><NuxtLink class="w-cycle-muted" to="/cyclecount">{{t('nav.cyclecount')}}</NuxtLink><span>/</span><span>CC-{{taskId}}</span></nav><div class="w-cycle-heading"><h1>CC-{{taskId}}</h1><WStatus v-if="itemData" :tone="itemData.status==='completed'?'ok':itemData.status==='in_progress'?'warn':'none'">{{t('common.status.'+itemData.status.replaceAll('_','-'))}}</WStatus><span>{{itemData?.task_name}}</span><WButton v-if="itemData" class="w-count-print-link" icon="printer" :to="'/cyclecount/print/'+taskId">{{t('count-print.print')}}</WButton></div><div v-if="itemData" class="w-cycle-meta"><span>{{itemData.warehouse?.name}}</span><span>{{$dayjs(itemData.scheduled_date,'YYYY-MM-DD',itemData)}}</span></div></header><WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')" /></WCard><div v-if="itemData" class="w-cycle-layout"><WCard flush><div class="w-cycle-section"><h2>{{t('common.fields.task-details')}} <small>{{itemData.task_details?.length}}</small></h2><span>{{recordedCount}} / {{itemData.task_details?.length}}</span></div><WTable :columns="columns" :rows="itemData.task_details||[]" inset><template #cell-goods="{row}"><NuxtLink class="w-cycle-name" :to="'/location/detail/'+row.location_id">{{row.location?.code}}</NuxtLink><NuxtLink class="w-cycle-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-cycle-sub">{{row.goods?.code}}</span></template><template #cell-actual="{row}"><WInput v-if="canEdit&&itemData.status==='in_progress'&&row.status!=='completed'" :model-value="hasInput(row)?row.new_cyclecount_quantity:isRecorded(row)?row.actual_quantity:''" type="number" min="0" step="1" align="right" size="sm" :invalid="unrecordedIds.includes(row.id)" :aria-label="row.goods?.code+' '+row.location?.code+' '+t('common.quantities.actual')" :disabled="saving||actionBusy" @update:model-value="value=>{row.new_cyclecount_quantity=value;markTouched(row)}" /><span v-else>{{isRecorded(row)?row.actual_quantity:'—'}}</span></template><template #cell-difference="{row}"><span v-if="rowDifference(row)!==null" :class="{'w-cycle-warning':rowDifference(row)!==0}">{{(rowDifference(row)||0)>0?'+':''}}{{rowDifference(row)}}</span><span v-else>—</span></template><template #cell-entry="{row}"><WStatus :tone="isRecorded(row)?'ok':'none'">{{t(isRecorded(row)?'cyclecount.fields.recorded':'operations.ui.unrecorded')}}</WStatus><span class="w-cycle-sub">{{row.operator?.user_name}}</span><span v-if="isRecorded(row)" class="w-cycle-sub">{{$dayjs(row.updated_at,'MM/DD HH:mm',itemData)}}</span></template><template #cell-action="{row}"><WButton v-if="canEdit&&itemData.status==='in_progress'&&row.status!=='completed'&&isRecorded(row)" size="sm" :disabled="saving||actionBusy||isTouched(row)" @click="runAction(()=>completeItem(row))">{{t('button.complete')}}</WButton></template></WTable><footer v-if="canEdit"><WButton v-if="itemData.status==='pending'" variant="primary" :loading="actionBusy" @click="runAction(processTask)">{{t('button.process')}}</WButton><template v-if="itemData.status==='in_progress'"><WButton :disabled="saving||actionBusy" @click="resetTask">{{t('button.reset')}}</WButton><WButton :disabled="!hasUnsavedChanges||actionBusy" :loading="saving" @click="saveTask">{{t('button.save')}}</WButton><WButton variant="primary" :disabled="hasUnsavedChanges||saving||!allItemsRecorded" :loading="actionBusy" @click="completeFn">{{t('button.complete')}}</WButton></template></footer></WCard><aside><WCard><h3>{{t('operations.ui.variance')}}</h3><div class="w-cycle-summary"><strong>{{totalDifferenceInProgress>0?'+':''}}{{totalDifferenceInProgress}}</strong><span>{{t('operations.ui.unrecorded')}} {{remaining}}</span></div><WButton v-if="itemData.status==='completed'&&staff.hasPermission('adjustment_edit')" :disabled="!validDetails.length||adjustmentCreated" :loading="creatingAdjustment" variant="primary" block @click="carete_adjustmentFn">{{t('adjustment.operations.add')}}</WButton></WCard><WCard><h3>{{t('operations.ui.status-records')}}</h3><ol><li v-for="log in itemData.status_logs" :key="log.id"><span class="w-cycle-sub">{{$dayjs(log.changed_at,'MM/DD HH:mm',itemData)}} · {{log.operator?.user_name}}</span>{{t('common.status.'+String(log.new_status).replaceAll('_','-'))}}</li></ol></WCard></aside></div></div></template>
<style scoped>
.w-cycle-detail{display:flex;flex-direction:column;gap:24px}.w-cycle-detail header{display:flex;flex-direction:column;gap:8px}.w-cycle-detail nav{display:flex;gap:8px;color:var(--w-text-2);font-size:13px;line-height:20px}.w-cycle-muted{color:var(--w-text-3);text-decoration:none}.w-cycle-heading{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.w-cycle-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-count-print-link{margin-left:auto}.w-cycle-meta{display:flex;gap:24px;font-size:13px;color:var(--w-text-3)}.w-cycle-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;align-items:start}.w-cycle-layout aside{display:flex;flex-direction:column;gap:16px}.w-cycle-section{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--w-line);font-size:13px}.w-cycle-section h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.w-cycle-section small{font-size:13px;font-weight:400;color:var(--w-text-3)}.w-cycle-detail :deep(.w-table){min-width:740px}.w-cycle-detail :deep(.w-table td){padding-top:14px;padding-bottom:14px;vertical-align:top}.w-cycle-detail :deep(.w-input){min-width:72px;max-width:96px}.w-cycle-name{display:block;font-size:14px;font-weight:600;color:var(--w-text-1);text-decoration:none}.w-cycle-goods{display:block;font-size:13px;color:var(--w-text-2);text-decoration:none}.w-cycle-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.w-cycle-warning{color:#B87400}.w-cycle-detail footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}.w-cycle-detail h3{margin:0 0 12px;font-size:14px;line-height:22px;font-weight:600}.w-cycle-summary{display:flex;flex-direction:column;gap:8px;font-size:13px;margin-bottom:16px}.w-cycle-summary strong{font-size:24px;line-height:32px;font-weight:600}.w-cycle-detail ol{list-style:none;padding:0;margin:0}.w-cycle-detail li{border-top:1px solid var(--w-line);padding:12px 0;font-size:13px}@media(max-width:1100px){.w-cycle-layout{grid-template-columns:minmax(0,1fr)}}
</style>
