<script setup lang="ts">
const props=defineProps<{goodsId:number;lot:any}>()
const open=defineModel<boolean>('open',{default:false})
const emit=defineEmits<{saved:[]}>()
const {t}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),history=ref<any>(null),page=ref(1),loading=ref(false),saving=ref(false),error=ref(''),historyError=ref('')
const form=reactive({production_date:'',expiry_date:'',reason:''})
const editable=computed(()=>staff.refreshed&&!!staff.staffInfo&&staff.hasPermission('goods_edit'))
const original=ref(''),snapshot=()=>JSON.stringify(form)
const dirty=computed(()=>open.value&&!!data.value&&snapshot()!==original.value)
useUnsavedForm(()=>dirty.value||saving.value,()=>saving.value)
let generation=0,historyGeneration=0,confirming=false
const url=computed(()=>`/api/warehouse/goods/${props.goodsId}/lots/${props.lot.id}`)
const discard=async()=>!dirty.value||await wConfirm({title:t('unsaved-form.title'),message:t('unsaved-form.message'),confirmText:t('unsaved-form.leave'),cancelText:t('unsaved-form.stay')})
const close=async()=>{if(saving.value||confirming)return;confirming=true;try{if(await discard())open.value=false}finally{confirming=false}}
const drawerOpen=computed({get:()=>open.value,set:value=>{if(!value)void close()}})
const loadHistory=async()=>{const seq=++historyGeneration;historyError.value='';history.value=null;const result=await httpRequest<any>(url.value+'/date-history',{params:{page:page.value},onError:e=>{if(seq===historyGeneration)historyError.value=bizErrorMessage(e)}});if(seq===historyGeneration)history.value=result}
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';data.value=null
 const result=await httpRequest<any>(url.value,{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result){Object.assign(form,{production_date:result.production_date||'',expiry_date:result.expiry_date||'',reason:''});original.value=snapshot()}
}
const retry=async()=>{if(saving.value||loading.value||confirming)return;confirming=true;try{if(await discard())await load()}finally{confirming=false}}
const save=async()=>{
 if(saving.value||loading.value||!data.value||!editable.value||!dirty.value)return
 if(!form.reason.trim()){error.value=t('goods.validation.reason-required');return}
 if(form.production_date&&form.expiry_date&&form.expiry_date<form.production_date){error.value=t('goods-label.invalid-dates');return}
 saving.value=true;error.value=''
 try{const result=await httpRequest<any>(url.value,{method:'PUT',body:{...form,reason:form.reason.trim(),date_revision:data.value.date_revision},onError:e=>{error.value=e.status===409?t('lot-dates.conflict'):bizErrorMessage(e)}})
  if(result){data.value=result;Object.assign(form,{production_date:result.production_date||'',expiry_date:result.expiry_date||'',reason:''});original.value=snapshot();page.value=1;await loadHistory();emit('saved');showToast(t('action-results.success'),'success')}
 }finally{saving.value=false}
}
watch(open,value=>{if(value){page.value=1;load();loadHistory()}else{generation++;historyGeneration++;data.value=null}},{immediate:true})
watch(page,()=>{if(open.value)loadHistory()})
onBeforeUnmount(()=>{generation++;historyGeneration++})
</script>
<template><WDrawer v-model:open="drawerOpen" :title="t('lot-dates.title')+' · '+lot.lot_no" width="640px" :closable="!saving" :close-on-backdrop="!saving">
 <p>{{t('lot-dates.help')}}</p><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="saving||loading" @click="retry">{{t('dn.list.retry')}}</WButton></template></WAlert><WEmptyState v-if="loading" :title="t('common.status.loading')"/>
 <WFormGrid v-if="data"><WField :label="t('goods.fields.product-date')" optional><WInput v-model="form.production_date" type="date" :disabled="saving||!editable"/></WField><WField :label="t('goods-label.expiry')" optional><WInput v-model="form.expiry_date" type="date" :min="form.production_date||undefined" :disabled="saving||!editable"/></WField><WField v-if="editable" :label="t('common.fields.reason')" required :span="12"><WTextarea v-model="form.reason" :maxlength="255" :disabled="saving"/></WField></WFormGrid>
 <h3>{{t('lot-dates.history')}}</h3><WAlert v-if="historyError" tone="block" :title="historyError"><template #actions><WButton @click="loadHistory">{{t('dn.list.retry')}}</WButton></template></WAlert><WEmptyState v-else-if="history&&!history.total" :title="t('common.status.nothing-show')"/>
 <article v-for="row in history?.items||[]" :key="row.id" class="date-change"><header>{{row.operator_name||'—'}} · {{$dayjs(row.created_at,'YYYY-MM-DD HH:mm')}}</header><p>{{t('goods.fields.product-date')}}: {{row.before_production_date||'—'}} → {{row.production_date||'—'}}</p><p>{{t('goods-label.expiry')}}: {{row.before_expiry_date||'—'}} → {{row.expiry_date||'—'}}</p><p>{{row.reason}}</p></article><WPagination v-if="history?.total" v-model:page="page" :page-size="20" :total="history.total"/>
 <template #footer><WButton :disabled="saving" @click="close">{{t('button.close')}}</WButton><WButton v-if="editable&&data" variant="primary" :disabled="loading||!dirty" :loading="saving" @click="save">{{t('button.save')}}</WButton></template>
</WDrawer></template>
<style scoped>p{font-size:13px;line-height:20px;overflow-wrap:anywhere;color:var(--w-text-2)}h3{font-size:15px;margin:24px 0 12px}.date-change{border-top:1px solid var(--w-line);padding:12px 0}.date-change header{font-size:12px;color:var(--w-text-3)}.date-change p{margin:4px 0}</style>
