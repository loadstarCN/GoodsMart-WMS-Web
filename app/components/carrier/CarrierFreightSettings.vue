<script setup lang="ts">
const props=defineProps<{carrierId:number|string}>(),{t}=useI18n(),{bizErrorMessage}=useBizError(),staff=useStaffStore()
const data=ref<any>(null),error=ref(''),busy=ref(false),saved=ref(false),mapping=reactive<Record<string,string>>({})
const columns=['tracking_number','shipping_date','service','destination_country','billable_weight','base','fuel','remote','other','tax','total']
const canEdit=computed(()=>!!staff.staffInfo&&staff.hasPermission('carrier_edit'))
let generation=0
const load=async()=>{const seq=++generation;data.value=null;error.value='';const result=await httpRequest<any>(`/api/warehouse/carrier/${props.carrierId}/freight-settings`,{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq===generation&&result){data.value=result;for(const key of columns)mapping[key]=result.column_mapping[key]||''}}
const save=async()=>{if(busy.value||!data.value||!canEdit.value)return;const seq=generation;busy.value=true;error.value='';saved.value=false;try{const result=await httpRequest<any>(`/api/warehouse/carrier/${props.carrierId}/freight-settings`,{method:'PUT',body:{...data.value,column_mapping:Object.fromEntries(Object.entries(mapping).filter(([,value])=>value.trim()))},onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(result&&seq===generation){data.value=result;saved.value=true}}finally{busy.value=false}}
watch(()=>props.carrierId,load);onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template><WCard :title="t('freight.settings')"><WAlert v-if="error" tone="block" :title="error"/><WAlert v-if="saved" tone="info" :title="t('freight.saved')"/><form v-if="data" @submit.prevent="save"><fieldset :disabled="!canEdit||busy"><WFormGrid>
 <WField :label="t('freight.tolerance-type')" :span="4"><WSelect v-model="data.tolerance_type" :options="[{value:'amount',label:t('freight.amount-type')},{value:'percent',label:t('freight.percent-type')}]"/></WField>
 <WField :label="t('freight.tolerance')" :span="4"><WInput v-model="data.tolerance" type="number" min="0" step="0.01" :max="data.tolerance_type==='percent'?100:undefined" required/></WField>
 <WField :label="t('freight.currency')" :span="4"><WInput v-model="data.currency" maxlength="3"/></WField>
 </WFormGrid><details><summary>{{t('freight.mapping')}}</summary><p>{{t('freight.mapping-hint')}}</p><WFormGrid><WField v-for="key in columns" :key="key" :label="key" :span="6"><WInput v-model="mapping[key]" :placeholder="key" maxlength="100"/></WField></WFormGrid></details></fieldset><footer><WButton v-if="canEdit" type="submit" :loading="busy" variant="primary">{{t('button.save')}}</WButton></footer></form></WCard></template>
<style scoped>fieldset{border:0;padding:0;min-width:0}details{margin-top:20px}summary{cursor:pointer;font-size:14px;font-weight:600}p{color:var(--w-text-3);font-size:13px}footer{display:flex;justify-content:flex-end;padding-top:16px}</style>
