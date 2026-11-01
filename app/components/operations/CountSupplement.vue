<script setup lang="ts">
const props=defineProps<{taskId:string|number;disabled?:boolean}>()
const emit=defineEmits<{saved:[];busy:[value:boolean];draft:[value:boolean]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const blank=()=>({goods_code:'',location_code:'',lot_no:'',expiry_date:'',actual_quantity:''})
const form=ref(blank()),saving=ref(false),error=ref('')
const dirty=computed(()=>Object.values(form.value).some(value=>!!value))
watch(dirty,value=>emit('draft',value),{immediate:true,flush:'sync'})
onBeforeUnmount(()=>emit('draft',false))
useUnsavedForm(()=>dirty.value,()=>saving.value)
const save=async()=>{
 if(saving.value||props.disabled)return
 error.value=''
 if(!form.value.goods_code.trim()||!form.value.location_code.trim()||form.value.actual_quantity===''||!Number.isSafeInteger(Number(form.value.actual_quantity))||Number(form.value.actual_quantity)<0){error.value=t('common.validation.quantity-invalid');return}
 saving.value=true;emit('busy',true)
 try{
  const result=await httpRequest<any>(`/api/warehouse/cyclecount/${props.taskId}/supplements/`,{method:'POST',body:{...form.value,actual_quantity:Number(form.value.actual_quantity)},onError:e=>error.value=bizErrorMessage(e)})
  if(result?.id){form.value=blank();emit('saved');showToast(t('action-results.success'),'success')}
 }finally{saving.value=false;emit('busy',false)}
}
</script>
<template><WCard><form @submit.prevent="save"><h3>{{t('cyclecount.supplement.title')}}</h3><p>{{t('cyclecount.supplement.help')}}</p><fieldset :disabled="saving||disabled"><WFormGrid><WField :label="t('goods.fields.code')" required><WInput v-model="form.goods_code" required/></WField><WField :label="t('common.entities.location')" required><WInput v-model="form.location_code" required/></WField><WField :label="t('cyclecount.scope.lot-query')" optional><WInput v-model="form.lot_no" maxlength="40"/></WField><WField :label="t('count-print.expiry')" optional><WInput v-model="form.expiry_date" type="date"/></WField><WField :label="t('common.quantities.actual')" required><WInput v-model="form.actual_quantity" type="number" min="0" step="1" required/></WField></WFormGrid></fieldset><WAlert v-if="error" tone="block" :title="error"/><WButton type="submit" :loading="saving" :disabled="disabled" variant="primary">{{t('cyclecount.supplement.title')}}</WButton></form></WCard></template>
<style scoped>form{display:flex;flex-direction:column;gap:12px}h3,p{margin:0}h3{font-size:14px;font-weight:600}p{font-size:12px;color:var(--w-text-3);line-height:1.6}fieldset{border:0;padding:0;margin:0;min-width:0}</style>
