<script lang="ts" setup>

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
// 按权限显示审批 / 完成 / 取消按钮（鉴权仍以后端为准）
const staffStore = useStaffStore();
const { bizErrorMessage } = useBizError();
/**
 * 调整原因：从盘点单生成的调整单，后端写的是固定英文「Adjustment by CycleCountTask ID: 12」→ 显示「按盘点单 CC-12 生成」；
 * 手工填写的原因原样显示
 */
const AUTO_REASON_RE = /^Adjustment by CycleCountTask ID:\s*(\d+)$/;
const adjustmentReasonText = computed(() => {
  const reason = String(itemData.value?.adjustment_reason || '').trim();
  if (!reason) return '';
  const auto = AUTO_REASON_RE.exec(reason);
  return auto ? t('adjustment.tips.from-cyclecount', { id: auto[1] }) : reason;
});
/** 来源盘点单（只有从盘点单生成的调整单有） */
const sourceCyclecountId = computed(() => itemData.value?.cyclecount_id ?? null);
/** 已取消：取消后 status 保持原值，is_active=false；之后一切操作 409 16111 */
const cancelled = computed(() => itemData.value?.is_active === false);
// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.adjustment'),
  list: [t('nav.warehouse'), t('nav.adjustment')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}`, {
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

const approveTask = async () => {
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}/approve/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-approved'), 'success')
        },
        onError: (error) => {
            // 16122：审批人改过这张调整单的明细，不能自己审批（职责分离），用弹窗说明
            if (error.code === 16122) {
                showAlert(t('button.approved'), bizErrorMessage(error), 'warning');
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;
};

const completeTask = async () => {
  // 检查是否存在未保存的有效分拣数据
    const data = await httpRequest(`/api/warehouse/adjustment/${taskId}/complete/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.task-complete'), 'success')
        },
        onError: (error) => {
            // 16113：建单后库位库存有变动，只能取消后按当前库存重新建单；16111：已被取消
            if (error.code === 16113 || error.code === 16111) {
                showAlert(t('button.complete'), bizErrorMessage(error), 'warning');
                fetchData();
                return;
            }
            showToast(bizErrorMessage(error), 'error')
        }
    })
    return data;   
};

// ------------------ 取消调整单（待审批 / 已审批；需要审批权限）----------------------
const canceling = ref(false);
const cancelAdjustment = async () => {
    if (canceling.value) return;
    const confirmed = await showConfirm(
        t('adjustment.tips.cancel-confirm-title'),
        t('adjustment.tips.cancel-confirm', { id: taskId }),
        t('adjustment.operations.cancel'),
        t('button.dont-cancel'),
    );
    if (!confirmed) return;
    canceling.value = true;
    await httpRequest(`/api/warehouse/adjustment/${taskId}/cancel/`, {
        method: 'PUT',
        onSuccess: (data) => {
            itemData.value = data;
            showToast(t('action-results.success'), 'success');
        },
        onError: (error) => {
            // 16111 已取消 / 16112 状态不能取消：按最新状态显示
            showToast(bizErrorMessage(error), 'error');
            if (error.status === 409) fetchData();
        },
    });
    canceling.value = false;
};

function completeFn() {

  // 使用封装的确认对话框
  showConfirm(
    t('action-results.complete-confirm-title'),
    t('action-results.complete-confirm', { entity: t('adjustment.entity') }),
    t('button.confirm'),
    t('button.cancel'),
  ).then((confirmed) => {
    if (confirmed) {
      // 执行完成任务
      runAction(completeTask)
    }
  });
}

onMounted(async() => {
  await fetchData();
});


const actorId=computed(()=>Number(useAuthStore().userInfo?.id))
const ownApproval=computed(()=>!!actorId.value&&[itemData.value?.created_by,itemData.value?.details_modified_by].some(id=>Number(id)===actorId.value))
const actionBusy=ref(false)
const runAction=async(action:()=>Promise<any>)=>{if(actionBusy.value||canceling.value)return;actionBusy.value=true;try{await action()}finally{actionBusy.value=false}}
const stateLabel=computed(()=>itemData.value?.status==='pending'&&!cancelled.value?t('adjustment.ui.pending'):t('common.status.'+(cancelled.value?'cancelled':String(itemData.value?.status||'pending').replaceAll('_','-'))))
const steps=computed(()=>[
 {label:t('common.dates.created'),time:itemData.value?.created_at,done:true},
 {label:t('button.approved'),time:itemData.value?.approved_at,done:!!itemData.value?.approved_at},
 {label:t('button.complete'),time:itemData.value?.completed_at,done:itemData.value?.status==='completed'}
])
const currentStep=computed(()=>itemData.value?.status==='completed'?3:itemData.value?.status==='approved'?2:1)
const delta=(row:any)=>Number(row.actual_quantity||0)-Number(row.system_quantity||0)
const totalDelta=computed(()=>Number(itemData.value?.total_actual_quantity||0)-Number(itemData.value?.total_system_quantity||0))
const columns=computed(()=>[
 {key:'goods',label:t('nav.goods'),wrap:true},{key:'location',label:t('common.entities.location')},
 {key:'system_quantity',label:t('common.quantities.system'),type:'qty' as const},
 {key:'difference',label:t('common.quantities.adjusted'),type:'qty' as const},
 {key:'actual_quantity',label:t('common.quantities.actual'),type:'qty' as const}
])
useHead({title:()=>`ADJ-${taskId}`})
</script>
<template>
 <div class="w-adjustment-detail w-scope">
  <header>
   <nav><NuxtLink class="w-adjust-breadcrumb" to="/adjustment">{{t('nav.adjustment')}}</NuxtLink><span>/</span><span>ADJ-{{taskId}}</span></nav>
   <div class="heading"><div><div class="title"><h1>ADJ-{{taskId}}</h1><WStatus variant="pill" :tone="cancelled?'none':itemData?.status==='completed'?'ok':'warn'">{{stateLabel}}</WStatus></div><div class="meta"><span v-if="sourceCyclecountId">{{t('adjustment.fields.source-cyclecount')}} <NuxtLink :to="'/cyclecount/detail/'+sourceCyclecountId">CC-{{sourceCyclecountId}}</NuxtLink></span><span>{{t('adjustment.fields.adjustment-reason')}} <b>{{adjustmentReasonText||'—'}}</b></span><span>{{t('common.entities.warehouse')}} {{itemData?.warehouse?.name}}</span></div></div><WButton v-if="['pending','approved'].includes(itemData?.status)&&!cancelled&&staffStore.hasPermission('adjustment_approve')" variant="danger" :loading="canceling" :disabled="actionBusy" @click="cancelAdjustment">{{t('adjustment.operations.cancel')}}</WButton></div>
  </header>
  <WCard v-if="loading&&!itemData"><WEmptyState :title="t('common.status.loading')" /></WCard>
  <template v-if="itemData">
   <section class="progress-card"><ol><li v-for="(step,index) in steps" :key="index" :class="{done:step.done,current:index===currentStep&&!cancelled}"><div class="step-track"><i :class="{hidden:index===0,done:index<=currentStep}"/><span class="step-dot"><WIcon v-if="step.done" name="check" :size="12"/><span v-else-if="index===currentStep&&!cancelled" class="inner-dot"/><template v-else>{{index+1}}</template></span><i :class="{hidden:index===2,done:index<currentStep}"/></div><strong>{{step.label}}</strong><small>{{step.time?$dayjs(step.time,'MM/DD HH:mm',itemData):'—'}}</small></li></ol></section>
   <div class="detail-grid"><div class="main-column">
    <WCard flush class="action-card"><div class="section-title"><h2>{{stateLabel}}</h2></div><div class="action-body"><dl><div><dt>{{t('common.users.creator')}}</dt><dd>{{itemData.creator?.user_name||'—'}}<small>{{$dayjs(itemData.created_at,'MM/DD HH:mm',itemData)}}</small></dd></div><div><dt>{{t('common.users.approver')}}</dt><dd>{{itemData.approver?.user_name||'—'}}<small>{{itemData.approved_at?$dayjs(itemData.approved_at,'MM/DD HH:mm',itemData):'—'}}</small></dd></div><div><dt>{{t('common.quantities.total-difference')}}</dt><dd><b>{{totalDelta>0?'+':''}}{{totalDelta}}</b></dd></div></dl><WButton v-if="itemData.status==='pending'&&!cancelled&&staffStore.hasPermission('adjustment_approve')" variant="primary" :loading="actionBusy" :disabled="canceling||ownApproval" :title="ownApproval?t('adjustment.tips.independent-approval'):undefined" @click="runAction(approveTask)">{{t('button.approved')}}</WButton><WButton v-if="itemData.status==='approved'&&!cancelled&&staffStore.hasPermission('adjustment_edit')" variant="primary" :loading="actionBusy" :disabled="canceling" @click="completeFn">{{t('button.complete')}}</WButton></div></WCard>
    <WCard flush><div class="section-title"><h3>{{t('adjustment.ui.info')}} <small>{{itemData.details?.length}}</small></h3></div><WTable :columns="columns" :rows="itemData.details||[]" inset><template #cell-goods="{row}"><div class="goods-cell"><img :src="row.goods?.thumbnail_url||'/images/goods/default.png'" alt=""/><div><NuxtLink class="w-adjust-goods" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><small>{{row.goods?.code}}</small></div></div></template><template #cell-location="{row}"><NuxtLink class="w-adjust-location" :to="'/location/detail/'+row.location_id">{{row.location?.code}}</NuxtLink><small>{{t('common.locations.'+row.location?.location_type)}}</small></template><template #cell-difference="{row}"><b>{{delta(row)>0?'+':''}}{{delta(row)}}</b></template></WTable><div class="totals"><span>{{t('common.quantities.total-system')}} <b>{{itemData.total_system_quantity}}</b></span><span>{{t('common.quantities.total-difference')}} <b>{{totalDelta>0?'+':''}}{{totalDelta}}</b></span><span>{{t('common.quantities.total-actual')}} <b>{{itemData.total_actual_quantity}}</b></span></div></WCard>
   </div><aside><WCard><h3>{{t('adjustment.ui.info')}}</h3><dl class="info"><dt>{{t('common.entities.warehouse')}}</dt><dd>{{itemData.warehouse?.name}}</dd><dt>{{t('adjustment.fields.source-cyclecount')}}</dt><dd><NuxtLink v-if="sourceCyclecountId" :to="'/cyclecount/detail/'+sourceCyclecountId">CC-{{sourceCyclecountId}}</NuxtLink><template v-else>—</template></dd><dt>{{t('adjustment.fields.adjustment-reason')}}</dt><dd>{{adjustmentReasonText||'—'}}</dd><dt>{{t('common.users.creator')}}</dt><dd>{{itemData.creator?.user_name||'—'}}</dd><dt>{{t('common.dates.created')}}</dt><dd>{{$dayjs(itemData.created_at,'MM/DD HH:mm',itemData)}}</dd><dt>{{t('common.users.approver')}}</dt><dd>{{itemData.approver?.user_name||'—'}}</dd><dt>{{t('common.users.operator')}}</dt><dd>{{itemData.operator?.user_name||'—'}}</dd><dt>{{t('common.dates.completed')}}</dt><dd>{{itemData.completed_at?$dayjs(itemData.completed_at,'MM/DD HH:mm',itemData):'—'}}</dd></dl></WCard></aside></div>
  </template>
 </div>
</template>
<style scoped>
.w-adjustment-detail{display:flex;flex-direction:column;gap:24px;max-width:1216px}.w-adjustment-detail header{display:flex;flex-direction:column;gap:8px}nav{display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2)}nav a{color:var(--w-text-3)}a{text-decoration:none}.heading{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.title{display:flex;align-items:center;gap:12px}.title h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.meta{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:13px;line-height:20px;color:var(--w-text-3);margin-top:6px}.meta b{font-weight:500;color:var(--w-text-1)}.progress-card{padding:16px 24px 20px;background:var(--w-surface);border:1px solid var(--w-border);border-radius:10px}.progress-card ol{display:flex;list-style:none;padding:0;margin:0}.progress-card li{flex:1;min-width:0;text-align:center;display:flex;flex-direction:column;gap:4px}.step-track{display:flex;align-items:center;height:28px}.step-track i{height:2px;background:#E1E4EA;flex:1}.step-track i.done{background:#369E4E}.step-track i.hidden{visibility:hidden}.step-dot{width:20px;height:20px;border:1.5px solid #CDD1DA;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12px;background:white}.done .step-dot{background:#369E4E;border-color:#369E4E;color:white}.current .step-dot{background:#5F1FE6;border-color:#5F1FE6;box-shadow:0 0 0 4px #DAD6FF}.inner-dot{width:6px;height:6px;background:white;border-radius:50%}.progress-card strong{font-size:13px;font-weight:500;line-height:20px}.progress-card small{font-size:12px;line-height:16px}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.main-column{display:flex;flex-direction:column;gap:16px}.action-card{border-color:#DAD6FF}.section-title{padding:16px 24px;border-bottom:1px solid var(--w-line)}h2,h3{margin:0;font-weight:600}h2{font-size:20px;line-height:28px}h3{font-size:16px;line-height:24px}.action-body{padding:16px 24px 20px;display:flex;align-items:center;gap:12px 32px;flex-wrap:wrap}.action-body dl{flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 24px;margin:0;min-width:260px;font-size:13px;line-height:20px}dt,small{color:var(--w-text-3)}dt{font-size:12px;line-height:18px}dd{margin:0}small{display:block;font-size:12px;line-height:18px}.section-title small{display:inline;font-size:13px;font-weight:400;margin-left:4px}.goods-cell{display:flex;gap:12px;align-items:center}.goods-cell img{width:40px;height:40px;object-fit:contain;border-radius:6px;background:#EDEFF3}.goods-cell a{font-size:14px;line-height:20px;font-weight:500;color:var(--w-text-1)}.w-adjust-location{font-weight:600;color:var(--w-text-1)}.w-adjustment-detail :deep(.w-table){min-width:640px}.w-adjustment-detail :deep(.w-table td){padding-top:12px;padding-bottom:12px}.totals{padding:12px 24px;display:flex;justify-content:flex-end;gap:24px;flex-wrap:wrap;border-top:1px solid var(--w-border);font-size:13px}.totals b{margin-left:8px}aside h3{font-size:14px;line-height:22px;margin-bottom:10px}.info{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px 0;font-size:13px;line-height:20px;margin:0}.info dt{font-size:13px;line-height:20px}.info dd{overflow-wrap:anywhere}@media(max-width:1100px){.detail-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:600px){.progress-card{padding:16px 8px}.action-body dl{min-width:0;gap:12px}.action-body{padding:16px}.info{grid-template-columns:100px minmax(0,1fr)}}
</style>
