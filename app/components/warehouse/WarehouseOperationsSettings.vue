<script setup lang="ts">
const props=defineProps<{warehouseId?:string;disabled?:boolean}>()
const model=defineModel<Record<string,any>>({required:true})
const {t}=useI18n(),{bizErrorMessage}=useBizError(),staff=useStaffStore()
const stations=ref<{value:string;label:string}[]>([]),loading=ref(false),error=ref('')
let generation=0
const load=async()=>{
 const seq=++generation;stations.value=[];error.value='';loading.value=false
 if(!props.warehouseId||!staff.hasPermission('warehouse_read'))return
 loading.value=true
 const onError=(e:any)=>{if(seq===generation)error.value=bizErrorMessage(e)}
 const current=await httpRequest<any>(`/api/warehouse/warehouse/${props.warehouseId}/layout`,{onError})
 if(seq!==generation)return
 if(current?.published_version){
  const result=await httpRequest<any>(`/api/warehouse/warehouse/${props.warehouseId}/layout/versions/${current.published_version}`,{onError})
  if(seq!==generation)return
  stations.value=(result?.layout?.floors||[]).flatMap((floor:any)=>floor.objects.filter((o:any)=>o.type==='station').map((o:any)=>({value:o.id,label:`${floor.name} / ${o.name}`})))
 }
 loading.value=false
}
const unassigned=computed({get:()=>model.value.allow_unassigned===null?'inherit':model.value.allow_unassigned?'allow':'block',set:(value:string)=>{model.value.allow_unassigned=value==='inherit'?null:value==='allow'}})
watch(()=>model.value.map_enabled,value=>{if(!value)model.value.route_enabled=false})
watch(()=>props.warehouseId,load,{immediate:true})
onBeforeUnmount(()=>generation++)
</script>
<template>
 <WFormSection :title="t('warehouse-operations.outbound')"><WFormGrid>
  <WField :label="t('warehouse-operations.unassigned')" :hint="t('warehouse-operations.unassigned-help')"><WSelect v-model="unassigned" :options="['inherit','allow','block'].map(value=>({value,label:t('warehouse-operations.'+value)}))" :disabled="disabled"/></WField>
 </WFormGrid></WFormSection>
 <WFormSection :title="t('warehouse-operations.navigation')"><WFormGrid>
  <WField group :label="t('warehouse-operations.map')" :span="6"><WCheckbox v-model="model.map_enabled" :disabled="disabled">{{t('warehouse-operations.map')}}</WCheckbox></WField>
  <WField group :label="t('warehouse-operations.route')" :span="6"><WCheckbox v-model="model.route_enabled" :disabled="disabled||!model.map_enabled">{{t('warehouse-operations.route')}}</WCheckbox></WField>
  <WField v-for="key in ['start_station_id','end_station_id']" :key="key" :label="t('warehouse-operations.'+key)" :span="6"><WSelect v-model="model[key]" :options="[{value:null,label:t('warehouse-operations.default-'+key)},...stations]" :disabled="disabled||loading||!!error||!model.route_enabled"/></WField>
  <WField :label="t('warehouse-operations.sort')" :hint="t('warehouse-operations.sort-help')"><WSelect v-model="model.picking_sort" :options="['code','manual'].map(value=>({value,label:t('warehouse-operations.sort-'+value)}))" :disabled="disabled"/></WField>
 </WFormGrid><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="loading" @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert></WFormSection>
</template>
