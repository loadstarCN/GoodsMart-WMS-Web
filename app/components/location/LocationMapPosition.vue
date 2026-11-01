<script setup lang="ts">
const props=defineProps<{warehouseId?:number;disabled?:boolean;errors?:Record<string,string>}>()
const model=defineModel<Record<string,any>>({required:true})
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref('')
let generation=0
const load=async()=>{const seq=++generation;data.value=null;error.value='';loading.value=false;if(!props.warehouseId)return;loading.value=true;const result=await httpRequest<any>('/api/warehouse/location/map-options/'+props.warehouseId,{headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq===generation){data.value=result;loading.value=false}}
watch(()=>props.warehouseId,load,{immediate:true});onBeforeUnmount(()=>generation++)
const resolved=computed(()=>locationRackMatch(data.value?.racks||[],model.value))
const selected=computed(()=>data.value?.racks.find((rack:any)=>rack.id===model.value.map_rack_id))
</script>
<template><WFormSection :title="t('warehouse-operations.location-position')">
 <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton :disabled="loading" @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
 <WFormGrid>
  <WField :label="t('warehouse-operations.picking_order')" :span="4" :error="errors?.picking_order" optional><WInput v-model.number="model.picking_order" type="number" min="1" max="2147483647" step="1" :disabled="disabled"/></WField>
  <template v-if="data?.enabled">
   <WField :label="t('warehouse-operations.rack')" :span="8" :hint="t('warehouse-operations.rack-help')"><WSelect v-model="model.map_rack_id" :options="[{value:null,label:t('warehouse-operations.auto-rack')},...data.racks.map((rack:any)=>({value:rack.id,label:rack.floor_name+' / '+rack.name}))]" :disabled="disabled||loading"/></WField>
   <WField v-for="key in ['rack_column','rack_level']" :key="key" :label="t('warehouse-operations.'+key)" :span="6" :error="errors?.[key]" optional><WInput v-model.number="model[key]" :placeholder="resolved?.[key==='rack_column'?'column':'level']?.toString()" type="number" min="1" :max="selected?.[key==='rack_column'?'columns':'levels']||2147483647" step="1" :disabled="disabled||loading"/></WField>
  </template>
 </WFormGrid><p v-if="resolved">{{t('warehouse-operations.rack-resolved',{floor:resolved.rack.floor_name,rack:resolved.rack.name,column:resolved.column??'—',level:resolved.level??'—'})}}</p><p v-if="data&&!data.enabled">{{t('warehouse-operations.map-disabled')}}</p>
</WFormSection></template>
<style scoped>p{font-size:13px;line-height:20px;color:var(--w-text-3)}</style>
