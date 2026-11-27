<script lang="ts" setup>
import LabelLotPicker from '~/components/goods/LabelLotPicker.vue'
import CompactFlow from '~/components/operations/CompactFlow.vue'
import SortingCorrections from '~/components/sorting/SortingCorrections.vue'
import SortingRecordEditor from '~/components/sorting/SortingRecordEditor.vue'
import {
  emptySortingQuantities, sameSortingQuantities, validSortingQuantities,
  type SortingCorrectionSnapshot, type SortingLotQuantity, type SortingQuantities, type SortingQuantityKey,
} from '~/utils/sortingQuantities'
const staff=useStaffStore()
const canEdit=computed(()=>!!staff.refreshed && !!staff.staffInfo && !loading.value && !loadError.value && staff.hasPermission('sorting_edit'))
const actionBusy=ref(false)
const runAction=async(action:()=>Promise<any>)=>{if(actionBusy.value||submitting.value||!canEdit.value)return;actionBusy.value=true;try{await action()}finally{actionBusy.value=false}}

// 定义页面元数据
definePageMeta({ key: route => route.path });

let loading = ref(true);
const loadError = ref('');
const entryError = ref('');
const reasonAttempted = ref(false);
let loadGeneration = 0;
onBeforeUnmount(() => { loadGeneration++ });
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
    const generation = ++loadGeneration;
    loading.value = true; loadError.value = ''; itemData.value = null;
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}`, {
        method: 'GET',
        onSuccess: (data) => {
          if (generation !== loadGeneration) return;
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
          (itemData.value?.asn?.details || []).forEach((item:any) => {
            const goodsId = item.goods_id;
            // 统计task_details中的数据（按goods_id聚合）
            // 使用可选链防止undefined错误
            // 双问号操作符设置默认值
            item.old_sorted_quantity = taskSummary[goodsId]?.sorted ?? 0;
            item.old_damage_quantity = taskSummary[goodsId]?.damage ?? 0;
            item.old_rejected_quantity = (itemData.value.task_details||[]).filter((line:any)=>line.goods_id===goodsId).reduce((sum:number,line:any)=>sum+Number(line.rejected_quantity||0),0);
          });
        },
        onError: (error) => {
            if (generation === loadGeneration) loadError.value = bizErrorMessage(error);
        },
        onFinally: () => {
            if (generation === loadGeneration) loading.value = false;
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
    entryError.value = ''; reasonAttempted.value = false;
    (itemData.value?.asn?.details || []).forEach((item:any) => {
        item.new_sorted_quantity = undefined;
        item.new_damage_quantity = undefined;
        item.new_rejected_quantity = undefined; item.rejection_reason=''; item.concession_reason='';
    });
};

const draftDetails = (reviewingOverage = false) => {
  entryError.value = '';
  reasonAttempted.value = true;
  const rows = itemData.value?.asn?.details ?? []
  if (rows.some((row:any) => Number(row.new_rejected_quantity)>0 && !String(row.rejection_reason||'').trim())) {
    entryError.value = t('error.generic-required', { field: t('receiving-exceptions.rejection-reason') });
    return null;
  }
  if (invalidTaskEntries('sorting', rows, reviewingOverage)) {
    const exceedsPlan = !reviewingOverage && !invalidTaskEntries('sorting', rows, true)
    showToast(exceedsPlan ? bizErrorMessage({ code: 16062, status: 400, message: '' }) : t('error.check-quantities'), 'error');
    return null;
  }
  // 安全访问嵌套属性并处理空值
  return rows
    .map((item:any) => ({
      goods_id: item?.goods_id ?? null,
      sorted_quantity: Number(item?.new_sorted_quantity) || 0,
      lot_id: item?.receiving_lot?.id ?? null,
      damage_quantity: Number(item?.new_damage_quantity) || 0,
      rejected_quantity: Number(item?.new_rejected_quantity) || 0,
      rejection_reason: item.rejection_reason?.trim()||null, concession_reason: item.concession_reason?.trim()||null
    }))
    .filter((item:any) => item.goods_id && (item.sorted_quantity || item.damage_quantity || item.rejected_quantity));
};
const saveTask = async () => {
  if(!canEdit.value||actionBusy.value||submitting.value)return;
  const details = draftDetails();
  if (!details) return;
  if (details.length === 0) {
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
        body: { details, client_batch_id: batchKey.take() },
        onSuccess: () => {
            done = true;
        },
        onError: (error) => {
            entryError.value = bizErrorMessage(error);
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

type QuantityDifference = { goods_id: number; planned: number; received: number; rejected: number }
const supportsVarianceReview = computed(() =>
  !!itemData.value && Object.hasOwn(itemData.value, 'variance_resolved_at'))
const sortingReview = ref<QuantityDifference[] | null>(null)
const reviewOpen = computed({ get: () => sortingReview.value !== null, set: open => { if (!open) sortingReview.value = null } })
const varianceReason = ref('')
const resolutionNote = ref('')
const completionBatch = ref<{ details: NonNullable<ReturnType<typeof draftDetails>>; client_batch_id: string }>()
const reviewGoods = (goodsId: number) => {
  const row = itemData.value?.asn?.details?.find((entry: any) => entry.goods_id === goodsId)
  return [row?.goods?.code, row?.goods?.name].filter(Boolean).join(' · ') || `#${goodsId}`
}
const resolveVariance = () => runAction(async () => {
  const result = await httpRequest(`/api/warehouse/sorting/${taskId}/variance-resolution`, {
    method: 'POST',
    body: { note: resolutionNote.value.trim() },
    onError: error => showToast(bizErrorMessage(error), 'error'),
  })
  if (result) {
    itemData.value = result
    resolutionNote.value = ''
    showToast(t('action-results.success'), 'success')
  }
})

const completeTask = async (variances?: QuantityDifference[]) => {
    let replayMismatch = false
    const data = await httpRequest(`/api/warehouse/sorting/${taskId}/complete/`, {
        method: 'PUT',
        body: supportsVarianceReview.value
          ? { review_variance: true, batch: completionBatch.value, variances,
            variance_reason: variances ? varianceReason.value.trim() : undefined }
          : undefined,
        onSuccess: (data) => {
            sortingReview.value = null
            completionBatch.value = undefined
            batchKey.clear()
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
            const pending = specPendingText(data?.spec_pending);
            if (pending) {
              showAlert(t('sorting.spec-pending.title'), t('sorting.spec-pending.warn', { items: pending }), 'warning');
            }
        },
        onError: (error) => {
            if (error.code === 17030 && Array.isArray(error.details?.variances)) {
              varianceReason.value = ''
              sortingReview.value = error.details.variances
              return
            }
            replayMismatch = batchKey.isReplayMismatch(error)
            // 17021：仓库要求先采集规格，列出待采集的商品和项
            const pending = error.code === 17021 ? specPendingText(error.details?.lines) : '';
            if (pending) {
              showAlert(t('sorting.spec-pending.blocked-title'), t('sorting.spec-pending.blocked', { items: pending }), 'error');
              return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    if (replayMismatch) {
      sortingReview.value = null
      completionBatch.value = undefined
      batchKey.clear()
      await fetchData()
      resetTask()
    }
    return data;   
};

const hasUnsavedChanges = computed(() => hasTaskEntry(itemData.value?.asn?.details || [], ['new_sorted_quantity', 'new_damage_quantity','new_rejected_quantity']))
useUnsavedForm(() => hasUnsavedChanges.value, () => submitting.value || actionBusy.value)


async function completeFn() {
  if (!canEdit.value || actionBusy.value || submitting.value) return
  if (!supportsVarianceReview.value && hasUnsavedChanges.value) return
  const details = supportsVarianceReview.value ? draftDetails(true) : []
  if (!details) return
  const confirmed = await showConfirm(
    t('action-results.complete-confirm-title'),
    supportsVarianceReview.value ? t('sorting-variance.complete-hint')
      : t('action-results.complete-confirm', { entity: t('sorting.entity') }),
    t('button.confirm'),
    t('button.cancel'),
  )
  if (confirmed) {
    completionBatch.value = details.length ? { details, client_batch_id: batchKey.take() } : undefined
    await runAction(() => completeTask())
  }
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

const recordEditorOpen = ref(false)
const recordToEdit = ref<InstanceType<typeof SortingRecordEditor>['$props']['line']>(null)
function editRecord(line: NonNullable<typeof recordToEdit.value>) {
  if (!canEdit.value || itemData.value?.status !== 'in_progress' || actionBusy.value || submitting.value) return
  if (hasUnsavedChanges.value) {
    showToast(t('action-results.task-save-changes-before-complete'), 'error')
    return
  }
  recordToEdit.value = line
  recordEditorOpen.value = true
}

type CorrectionDraft = Omit<SortingLotQuantity, 'quantities'> & {
  before: SortingQuantities
  after: SortingQuantities<number | null>
  pending: boolean
}

const correctionHistory = ref<InstanceType<typeof SortingCorrections>>()
const correctionSnapshot = ref<SortingCorrectionSnapshot>()
const correctionDraft = ref<Map<number, CorrectionDraft[]> | null>(null)
const correctionReason = ref('')
const correctionError = ref('')
const correctionBusy = ref(false)
const correctionKey = useBatchSubmitKey()
let lastCorrectionPayload = ''
const firstLineByGoods = computed(() => {
  const result = new Map<number, number>()
  for (const row of itemData.value?.asn?.details ?? []) {
    if (!result.has(row.goods_id)) result.set(row.goods_id, row.id)
  }
  return result
})
const plannedByGoods = computed(() => {
  const result = new Map<number, number>()
  for (const row of itemData.value?.asn?.details ?? []) {
    result.set(row.goods_id, (result.get(row.goods_id) ?? 0) + Number(row.quantity))
  }
  return result
})
const canCorrect = computed(() => canEdit.value && correctionSnapshot.value?.bulk_supported)
const correctionDraftRows = computed(() => [...(correctionDraft.value?.values() ?? [])].flat())
const changedCorrections = computed(() => correctionDraftRows.value.filter(row =>
  !row.pending && !sameSortingQuantities(row.after, row.before)))

function draftLot(goodsId: number, lotId: number | null, lotNo: string | null, quantities = emptySortingQuantities) {
  return {
    goods_id: goodsId, lot_id: lotId, lot_no: lotNo, before: { ...quantities }, after: { ...quantities },
    pending: !!correctionSnapshot.value?.corrections.some(row =>
      row.status === 'pending' && row.goods_id === goodsId && row.lot_id === lotId),
  }
}
function startCorrection() {
  if (!canCorrect.value || !correctionSnapshot.value) return
  const rows = new Map<number, CorrectionDraft[]>()
  for (const goodsId of firstLineByGoods.value.keys()) {
    const lots = correctionSnapshot.value.rows.filter(row => row.goods_id === goodsId)
    const pendingLots = correctionSnapshot.value.corrections.filter(row => row.goods_id === goodsId && row.status === 'pending')
    const values = lots.map(row => draftLot(goodsId, row.lot_id, row.lot_no, row.quantities))
    for (const row of pendingLots) {
      if (!values.some(lot => lot.lot_id === row.lot_id)) values.push(draftLot(goodsId, row.lot_id, row.lot_no, row.before))
    }
    rows.set(goodsId, values.length ? values : [draftLot(goodsId, null, null)])
  }
  correctionDraft.value = rows
  correctionReason.value = ''
  correctionError.value = ''
}
const displayRows = computed(() => {
  const lines = itemData.value?.asn?.details ?? []
  const draft = correctionDraft.value
  if (!draft) return lines
  return lines.flatMap((line: Record<string, any>) => {
    if (firstLineByGoods.value.get(line.goods_id) !== line.id) return []
    return (draft.get(line.goods_id) ?? []).map((correction, index) => ({
      ...line, key: `${line.id}-${correction.lot_id ?? 0}`, correction, extraLot: index !== 0,
      quantity: plannedByGoods.value.get(line.goods_id),
    }))
  })
})
function changeCorrection(row: CorrectionDraft, column: SortingQuantityKey, value: unknown) {
  row.after[column] = value == null || value === '' ? null : Number(value)
}
function closeCorrection() {
  correctionDraft.value = null
  correctionError.value = ''
  lastCorrectionPayload = ''
  correctionKey.clear()
}
async function submitCorrections() {
  if (!canCorrect.value || correctionBusy.value || !changedCorrections.value.length || !correctionReason.value.trim()
    || !changedCorrections.value.every(row => validSortingQuantities(row.after))) return
  correctionBusy.value = true
  correctionError.value = ''
  try {
    const body = { reason: correctionReason.value.trim(), rows: changedCorrections.value.map(({ goods_id, lot_id, before, after }) =>
      ({ goods_id, lot_id, before, after })) }
    const payload = JSON.stringify(body)
    if (payload !== lastCorrectionPayload) {
      correctionKey.clear()
      lastCorrectionPayload = payload
    }
    const result = await httpRequest(`/api/warehouse/sorting/${taskId}/quantity-corrections`, {
      method: 'POST', headers: warehouseHeaders(itemData.value.warehouse_id),
      body: { ...body, request_group: correctionKey.take() },
      onError: error => correctionError.value = bizErrorMessage(error),
    })
    if (result) {
      closeCorrection()
      await correctionHistory.value?.load()
    }
  } finally {
    correctionBusy.value = false
  }
}

const saved=(row:any,field:'sorted_quantity'|'damage_quantity'|'rejected_quantity')=>itemData.value?.status==='completed'
  ? Number(row[field]||0)
  : (itemData.value?.task_details||[]).filter((line:any)=>line.goods_id===row.goods_id).reduce((sum:number,line:any)=>sum+Number(line[field]||0),0)
function received(row: Record<string, any>) {
  const after = (row.correction as CorrectionDraft | undefined)?.after
  if (after) {
    return after.sorted_quantity == null || after.damage_quantity == null
      ? null : after.sorted_quantity + after.damage_quantity
  }
  return saved(row, 'sorted_quantity') + saved(row, 'damage_quantity')
}
function variance(row: Record<string, any>) {
  if (row.correction) {
    const rows = correctionDraft.value?.get(row.goods_id) ?? []
    if (row.extraLot || !rows.every(lot => validSortingQuantities(lot.after))) return null
    const handled = rows.reduce((total, lot) => total + Number(lot.after.sorted_quantity)
      + Number(lot.after.damage_quantity) + Number(lot.after.rejected_quantity), 0)
    return handled - row.quantity
  }
  return saved(row,'sorted_quantity')+saved(row,'damage_quantity')+Number(row.new_sorted_quantity||0)
    +Number(row.new_damage_quantity||0)+saved(row,'rejected_quantity')+Number(row.new_rejected_quantity||0)-row.quantity
}

const goodsColumns = computed(() => {
  const active = itemData.value?.status === 'in_progress'
  const hasDamage = Number(itemData.value?.total_damage_quantity) > 0
  const hasRejection = Number(itemData.value?.total_rejected_quantity) > 0
  return [
    { key: 'goods', label: t('nav.goods'), wrap: true },
    { key: 'quantity', label: t('common.quantities.expected'), type: 'qty' as const },
    { key: 'received', label: t('sorting-quantity.received-total'), type: 'qty' as const },
    ...(active || hasDamage || correctionDraft.value ? [
      { key: 'sorted', label: t('inventory.pending.good'), type: 'qty' as const },
      { key: 'damaged', label: t('inventory.pending.damaged'), type: 'qty' as const },
    ] : []),
    ...(hasRejection ? [{ key: 'rejected', label: t('receiving-exceptions.rejected'), type: 'qty' as const }] : []),
    ...(active && canEdit.value ? [
      { key: 'new_sorted', label: t('operations.ui.new-good') },
      { key: 'new_damage', label: t('operations.ui.new-damage') },
    ] : []),
    { key: 'variance', label: t('operations.ui.variance'), type: 'qty' as const },
  ]
})
useHead({title:()=>`SORT-${taskId}`})
</script>
<template><div class="w-sorting-detail w-scope"><header><nav><NuxtLink class="w-sort-muted" to="/sorting">{{t('nav.sorting')}}</NuxtLink><span>/</span><span>SORT-{{taskId}}</span></nav><div class="w-sort-heading"><h1>SORT-{{taskId}}</h1><WStatus v-if="itemData" :tone="itemData.status==='completed'?'ok':itemData.status==='in_progress'?'warn':'none'">{{t('common.status.'+itemData.status.replaceAll('_','-'))}}</WStatus></div><div v-if="itemData" class="w-sort-meta"><NuxtLink v-if="staff.hasPermission('asn_read')" class="w-sort-link" :to="'/asn/detail/'+itemData.asn_id">ASN-{{itemData.asn_id}}</NuxtLink><span v-else>ASN-{{itemData.asn_id}}</span><span>{{itemData.asn?.supplier?.name}}</span><span>{{$dayjs(itemData.started_at,undefined,itemData)}}</span></div></header><CompactFlow v-if="itemData" :key="itemData.status" :document-id="itemData.asn_id" kind="asn" current="sorting" /><WAlert v-if="loadError" tone="block" :title="loadError"><template #actions><WButton @click="fetchData">{{t('dn.list.retry')}}</WButton></template></WAlert><WAlert v-if="entryError" tone="block" :title="entryError"/><WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')" /></WCard><div v-if="itemData" class="w-sort-layout"><div class="w-sort-main"><WCard flush><div class="w-sort-section"><div class="w-sort-section-heading"><h2>{{t('nav.goods')}} <small>{{itemData.asn?.details?.length}}</small></h2><span>{{t('sorting-quantity.processed')}} <strong>{{itemData.total_sorted_quantity+itemData.total_damage_quantity+(itemData.total_rejected_quantity||0)}}</strong> / {{itemData.expected_quantity}}</span><WButton v-if="canCorrect && !correctionDraft" size="sm" @click="startCorrection">{{ t('sorting-quantity.request') }}</WButton></div><progress :value="itemData.total_sorted_quantity+itemData.total_damage_quantity+(itemData.total_rejected_quantity||0)" :max="Math.max(1,itemData.expected_quantity)" :aria-label="t('operations.ui.progress')" /></div><WTable :columns="goodsColumns" :rows="displayRows" :row-key="row => row.key ?? row.id" inset><template #cell-goods="{row}"><GoodsIdentity v-if="!row.extraLot" :goods="row.goods"><NuxtLink v-if="staff.hasPermission('goods_read')" class="w-sort-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span v-else class="w-sort-goods">{{row.goods?.name}}</span><span class="w-sort-sub">{{row.goods?.code}}</span><span class="w-sort-sub">{{row.remark}}</span></GoodsIdentity>
<span v-if="row.correction?.lot_no" class="w-sort-sub">{{ row.correction.lot_no }}</span>
<span v-if="row.correction?.pending" class="w-sort-sub">{{ t('sorting-quantity.pending') }}</span>
<LabelLotPicker v-if="itemData.status==='in_progress'&&canEdit" v-model="row.receiving_lot" :goods-id="row.goods_id" receiving :disabled="submitting||actionBusy" /><details v-if="itemData.status==='in_progress'&&canEdit" class="receipt-exception"><summary>{{t('receiving-exceptions.title')}}</summary><WField :label="t('receiving-exceptions.new-rejected')"><WInput v-model.number="row.new_rejected_quantity" type="number" min="0" step="1" :disabled="submitting||actionBusy"/></WField><WField v-if="Number(row.new_rejected_quantity)>0" :label="t('receiving-exceptions.rejection-reason')" :error="reasonAttempted && !String(row.rejection_reason||'').trim() ? t('common.tips.required') : undefined" required><WTextarea v-model="row.rejection_reason" :maxlength="500" :disabled="submitting||actionBusy"/></WField><WField :label="t('receiving-exceptions.concession-reason')"><WTextarea v-model="row.concession_reason" :maxlength="500" :disabled="submitting||actionBusy"/></WField><small>{{t('receiving-exceptions.hint')}}</small></details><AsnSpecCapture v-if="!correctionDraft" :asn="itemData.asn" :line="row" :disabled="submitting||actionBusy||hasUnsavedChanges" @saved="fetchData" /></template>
<template #cell-quantity="{row}">{{ row.extraLot ? '' : row.quantity }}</template>
<template #cell-received="{row}"><strong class="w-sort-received">{{ received(row) ?? '—' }}</strong></template>
<template #cell-sorted="{row}">
  <WInput v-if="row.correction" class="w-sort-correction-input" :model-value="row.correction.after.sorted_quantity"
    :disabled="correctionBusy || row.correction.pending" type="number" min="0" step="1" size="sm" align="right"
    :aria-label="[row.goods?.name, row.correction.lot_no, t('inventory.pending.good')].filter(Boolean).join(' · ')"
    @update:model-value="value => changeCorrection(row.correction, 'sorted_quantity', value)" />
  <template v-else>{{ saved(row,'sorted_quantity') }}</template>
</template><template #cell-rejected="{row}">
  <WInput v-if="row.correction" class="w-sort-correction-input" :model-value="row.correction.after.rejected_quantity"
    :disabled="correctionBusy || row.correction.pending" type="number" min="0" step="1" size="sm" align="right"
    :aria-label="[row.goods?.name, row.correction.lot_no, t('receiving-exceptions.rejected')].filter(Boolean).join(' · ')"
    @update:model-value="value => changeCorrection(row.correction, 'rejected_quantity', value)" />
  <template v-else>{{ saved(row,'rejected_quantity') }}</template>
</template><template #cell-damaged="{row}">
  <WInput v-if="row.correction" class="w-sort-correction-input" :model-value="row.correction.after.damage_quantity"
    :disabled="correctionBusy || row.correction.pending" type="number" min="0" step="1" size="sm" align="right"
    :aria-label="[row.goods?.name, row.correction.lot_no, t('inventory.pending.damaged')].filter(Boolean).join(' · ')"
    @update:model-value="value => changeCorrection(row.correction, 'damage_quantity', value)" />
  <template v-else>{{ saved(row,'damage_quantity') }}</template>
</template><template #cell-new_sorted="{row}"><WInput v-if="itemData.status==='in_progress'&&canEdit" v-model.number="row.new_sorted_quantity" type="number" min="0" step="1" size="sm" align="right" :aria-label="row.goods?.name+' '+t('operations.ui.new-good')" :disabled="submitting||actionBusy" /><span v-else>—</span></template><template #cell-new_damage="{row}"><WInput v-if="itemData.status==='in_progress'&&canEdit" v-model.number="row.new_damage_quantity" type="number" min="0" step="1" size="sm" align="right" :aria-label="row.goods?.name+' '+t('operations.ui.new-damage')" :disabled="submitting||actionBusy" /><span v-else>—</span></template><template #cell-variance="{row}"><WDifference :value="variance(row)" /></template></WTable>
<form v-if="correctionDraft" class="w-sort-correction-submit" @submit.prevent="submitCorrections">
  <WAlert v-if="correctionError" tone="block" :title="correctionError" />
  <WField :label="t('sorting-quantity.reason')" required>
    <WTextarea v-model="correctionReason" :maxlength="500" :disabled="correctionBusy" required />
  </WField>
  <div class="w-sort-correction-actions">
    <span>{{ t('sorting-quantity.changed-rows', { count: changedCorrections.length }) }}</span>
    <WButton type="button" :disabled="correctionBusy" @click="closeCorrection">{{ t('button.cancel') }}</WButton>
    <WButton type="submit" variant="primary" :loading="correctionBusy" :disabled="!canCorrect || !changedCorrections.length || !correctionReason.trim() || !changedCorrections.every(row => validSortingQuantities(row.after))">{{ t('sorting-quantity.submit') }}</WButton>
  </div>
</form>
<footer v-if="canEdit && itemData.status !== 'completed'"><WButton v-if="itemData.status==='pending'" variant="primary" :loading="actionBusy" @click="runAction(processTask)">{{t('button.process')}}</WButton><template v-if="itemData.status==='in_progress'"><span class="w-sort-sub">{{t('operations.ui.this-entry')}} {{totalNewSorted+totalNewDamaged+(itemData.asn?.details||[]).reduce((sum:number,row:any)=>sum+Number(row.new_rejected_quantity||0),0)}}</span><WButton :disabled="submitting||actionBusy" @click="resetTask">{{t('button.reset')}}</WButton><WButton :disabled="!hasUnsavedChanges||actionBusy" :loading="submitting" @click="saveTask">{{t('button.save')}}</WButton><WButton variant="primary" :disabled="(!supportsVarianceReview && hasUnsavedChanges) || submitting" :loading="actionBusy" @click="completeFn">{{t('button.complete')}}</WButton></template></footer></WCard></div><aside><WCard><h3>{{t('nav.ASN')}}</h3><dl><dt>{{t('nav.supplier')}}</dt><dd>{{itemData.asn?.supplier?.name}}</dd><dt>{{t('dn.fields.order-no')}}</dt><dd>{{itemData.asn?.order_number||'—'}}</dd><dt>{{t('nav.warehouse')}}</dt><dd>{{itemData.asn?.warehouse?.name}}</dd><dt>{{t('common.fields.remark')}}</dt><dd>{{itemData.asn?.remark||'—'}}</dd></dl></WCard><SortingCorrections v-if="itemData.status === 'completed' && typeof itemData.has_pending_correction === 'boolean'"
  ref="correctionHistory" :task-id="Number(taskId)" :warehouse-id="itemData.warehouse_id"
  :lines="itemData.asn?.details || []" :editing="!!correctionDraft" @loaded="correctionSnapshot = $event" @approved="fetchData" />
<SortingRecordEditor v-if="itemData.status === 'in_progress'" v-model:open="recordEditorOpen"
  :task-id="Number(taskId)" :warehouse-id="itemData.warehouse_id" :line="recordToEdit" @saved="fetchData" />
<WCard v-if="supportsVarianceReview && itemData.has_variance" class="sorting-review">
  <h3>{{ t('sorting-variance.follow-up') }}</h3>
  <WStatus :tone="itemData.variance_resolved_at ? 'ok' : 'warn'">
    {{ t(itemData.variance_resolved_at ? 'sorting-variance.resolved' : 'sorting-variance.unresolved') }}
  </WStatus>
  <div v-if="itemData.variance_reason">
    <strong>{{ t('sorting-variance.reason') }}</strong>
    <p>{{ itemData.variance_reason }}</p>
  </div>
  <template v-if="itemData.variance_resolved_at">
    <p>{{ itemData.variance_resolution }}</p>
    <small>{{ $dayjs(itemData.variance_resolved_at, undefined, itemData) }} ? #{{ itemData.variance_resolved_by }}</small>
  </template>
  <form v-else-if="canEdit" class="sorting-review" @submit.prevent="resolveVariance">
    <WField :label="t('sorting-variance.resolution-note')">
      <WTextarea v-model="resolutionNote" :maxlength="500" :disabled="actionBusy" />
    </WField>
    <WButton type="submit" :disabled="!resolutionNote.trim()" :loading="actionBusy">{{ t('sorting-variance.mark-resolved') }}</WButton>
  </form>
</WCard>
<WCard>
  <h3>{{ t('operations.ui.records') }} <small>{{ itemData.batches?.length || 0 }}</small></h3>
  <ol class="w-sort-records w-sort-batches">
    <li v-for="batch in itemData.batches" :key="batch.id">
      <div class="w-sort-batch-header">
        <strong>#{{ batch.id }}</strong>
        <span>{{ $dayjs(batch.operation_time, 'MM/DD HH:mm', itemData) }} · {{ batch.operator?.user_name }}</span>
      </div>
      <ul v-if="batch.details?.length" class="w-sort-record-items">
        <li v-for="line in batch.details" :key="line.id" class="w-sort-record-item">
          <div class="w-sort-record-product">
            <span>{{ line.goods?.name }}</span>
            <span v-if="line.lot_no" class="w-sort-sub">{{ line.lot_no }}</span>
          </div>
          <div class="w-sort-record-actions">
            <div class="w-sort-record-quantities">
              <span>{{ t('inventory.pending.good') }} <strong>{{ line.sorted_quantity }}</strong></span>
              <span>{{ t('inventory.pending.damaged') }} <strong>{{ line.damage_quantity }}</strong></span>
            </div>
          </div>
          <div v-if="canEdit && itemData.status === 'in_progress'" class="w-sort-record-controls">
            <WButton size="sm" :disabled="actionBusy || submitting" @click="editRecord(line)">
              {{ t('sorting-quantity.edit') }}
            </WButton>
            <WButton icon="trash" icon-only variant="danger"
              size="sm" :aria-label="t('button.delete')" :disabled="actionBusy || submitting"
              @click="runAction(() => deleteDetailItem(line.id))" />
          </div>
          <div v-if="line.rejected_quantity || line.concession_reason" class="w-sort-record-notes">
            <div v-if="line.rejected_quantity">{{ t('receiving-exceptions.rejected') }} {{ line.rejected_quantity }} · {{ line.rejection_reason }}</div>
            <div v-if="line.concession_reason">{{ t('receiving-exceptions.concession') }} · {{ line.concession_reason }}</div>
          </div>
        </li>
      </ul>
    </li>
  </ol>
</WCard>
<WCard><h3>{{t('operations.ui.status-records')}}</h3><ol class="w-sort-records"><li v-for="log in itemData.status_logs" :key="log.id"><span class="w-sort-sub">{{$dayjs(log.changed_at,'MM/DD HH:mm',itemData)}} · {{log.operator?.user_name}}</span>{{t('common.status.'+String(log.new_status).replaceAll('_','-'))}}</li></ol></WCard></aside></div>
<WModal v-model:open="reviewOpen" :title="t('sorting-variance.review')" :closable="!actionBusy">
  <div class="sorting-review">
    <p>{{ t(sortingReview?.length ? 'sorting-variance.hint' : 'sorting-variance.recheck') }}</p>
    <ul v-if="sortingReview?.length" class="sorting-variance-lines">
      <li v-for="row in sortingReview" :key="row.goods_id">
        <strong>{{ reviewGoods(row.goods_id) }}</strong>
        <span>{{ t('sorting-variance.counts', row) }}</span>
      </li>
    </ul>
    <WField v-if="sortingReview?.length" :label="t('sorting-variance.reason')">
      <WTextarea v-model="varianceReason" :maxlength="500" :disabled="actionBusy" />
    </WField>
  </div>
  <template #footer>
    <WButton :disabled="actionBusy" @click="reviewOpen = false">{{ t('sorting-variance.go-back') }}</WButton>
    <WButton variant="primary" :loading="actionBusy" :disabled="!!sortingReview?.length && !varianceReason.trim()"
      @click="runAction(() => completeTask(sortingReview ?? []))">
      {{ t(sortingReview?.length ? 'sorting-variance.confirm' : 'button.confirm') }}
    </WButton>
  </template>
</WModal>
</div></template>
<style scoped>
.w-sort-batches { display: grid; gap: 14px; }
.w-sort-records.w-sort-batches > li { padding: 0; border: 1px solid var(--w-border); border-radius: 8px; overflow: hidden; }
.w-sort-batch-header {
  display: grid; gap: 3px; padding: 10px 12px; border-bottom: 1px solid var(--w-border);
  background: var(--w-bg-subtle, #f3f5f9); color: var(--w-text-2); font-size: 12px;
}
.w-sort-batch-header strong { color: var(--w-text-1); font-size: 14px; }
.w-sort-batches .w-sort-record-items { padding: 0 12px; margin: 0; }
.w-sort-batches .w-sort-record-item:first-child { border-top: 0; }
.w-sort-received { font-variant-numeric: tabular-nums; font-weight: 600; }
.w-sort-correction-input { margin-inline-start: auto; width: 82px; }
.w-sort-correction-submit { display: grid; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--w-border); }
.w-sort-correction-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
.w-sort-correction-actions > span { margin-right: auto; color: var(--w-text-2); font-size: 13px; }
.receipt-exception{margin-top:12px;min-width:180px}.receipt-exception summary{cursor:pointer;color:var(--w-pri);margin-bottom:8px}.receipt-exception small{color:var(--w-text-3);font-size:12px}.receipt-exception :deep(.w-field){margin-top:8px}

.w-sorting-detail{display:flex;flex-direction:column;gap:16px}.w-sorting-detail header{display:flex;flex-direction:column;gap:8px}.w-sorting-detail nav{display:flex;gap:8px;color:var(--w-text-2);font-size:13px;line-height:20px}.w-sort-muted{color:var(--w-text-3);text-decoration:none}.w-sort-heading{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.w-sort-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.w-sort-meta>span{min-width:0;overflow-wrap:anywhere}.w-sort-meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:13px;color:var(--w-text-3)}.w-sort-link{color:var(--w-link);text-decoration:none}.w-sort-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.w-sort-main,.w-sort-layout aside{min-width:0;display:flex;flex-direction:column;gap:16px}.w-sort-section{padding:16px 24px;display:flex;flex-direction:column;gap:12px}.w-sort-section-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px}.w-sorting-detail h2{margin:0;font-size:16px;line-height:24px;font-weight:600}.w-sorting-detail small{font-size:13px;font-weight:400;color:var(--w-text-3)}.w-sort-section progress{width:100%;height:6px;border:0;border-radius:6px;overflow:hidden}.w-sort-section progress::-webkit-progress-bar{background:#EDEFF3}.w-sort-section progress::-webkit-progress-value{background:#7855FE}.w-sort-main :deep(.w-table){min-width:780px}.w-sort-main :deep(.w-table td){padding-top:14px;padding-bottom:14px;vertical-align:top}.w-sort-main :deep(.w-input){min-width:64px;max-width:88px}.w-sort-goods{color:var(--w-text-1);font-size:14px;font-weight:500;text-decoration:none}.w-sort-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:4px}.w-sort-main footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--w-border)}.w-sort-main footer>span{margin-right:auto}.w-sort-layout aside :deep(.w-card__body){padding:16px 20px 20px}.w-sort-layout h3{margin:0 0 10px;font-size:14px;line-height:22px;font-weight:600}.w-sort-layout dl{display:grid;grid-template-columns:72px minmax(0,1fr);gap:6px;font-size:13px;line-height:20px;margin:0}.w-sort-layout dt{color:var(--w-text-3);font-weight:400}.w-sort-layout dd{margin:0;overflow-wrap:anywhere}.w-sort-records{list-style:none;margin:0;padding:0}.w-sort-records>li{overflow-wrap:anywhere;padding:12px 0;border-top:1px solid var(--w-line);font-size:13px}@media(max-width:1100px){.w-sort-layout{grid-template-columns:minmax(0,1fr)}}

.w-sort-record-items {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}
.w-sort-record-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--w-line);
  font-size: 13px;
  line-height: 20px;
}
.w-sort-record-product { font-weight: 500; overflow-wrap: anywhere; }
.w-sort-record-product .w-sort-sub { font-weight: 400; }
.w-sort-record-actions { display: flex; align-items: start; gap: 8px; }
.w-sort-record-quantities {
  display: grid;
  justify-items: end;
  font-size: 12px;
  color: var(--w-text-3);
  font-variant-numeric: tabular-nums;
}
.w-sort-record-quantities strong { color: var(--w-text-1); }
.w-sort-record-notes {
  grid-column: 1 / -1;
  margin-top: 6px;
  font-size: 12px;
  color: var(--w-text-3);
  overflow-wrap: anywhere;
}
.w-sort-record-controls {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}
.sorting-review { display: grid; gap: 12px; }
.sorting-review p { margin: 0; overflow-wrap: anywhere; white-space: pre-line; }
.sorting-variance-lines { display: grid; gap: 8px; max-height: 38vh; overflow: auto; margin: 0; padding: 0; list-style: none; }
.sorting-variance-lines li { display: grid; gap: 3px; padding: 8px 10px; background: var(--w-surface-2); border-radius: 6px; }
.sorting-variance-lines span { color: var(--w-text-2); }
</style>
