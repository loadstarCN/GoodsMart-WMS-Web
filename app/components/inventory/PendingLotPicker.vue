<script setup lang="ts">
import { pendingPutaway } from '~/composables/inventory/putawayStock'
const props=defineProps<{goodsId?:number|string|null;warehouseId?:number|null;disabled?:boolean;preferredSource?:{lot_id:number|null;receipt_source_id:number}}>()
const emit=defineEmits<{change:[value:{lot_id:number|null;receipt_source_id:number;pending:ReturnType<typeof pendingPutaway>}|null]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const rows=ref<any[]>([]),selected=ref<string|null>(null),busy=ref(false),error=ref('')
let generation=0
const rowKey=(row:any)=>`${row.lot_id??0}:${row.receipt_source_id??0}`
const publish=()=>{const row=rows.value.find(row=>rowKey(row)===selected.value);emit('change',row?{lot_id:row.lot_id,receipt_source_id:row.receipt_source_id??0,pending:pendingPutaway(row)}:null)}
watch(selected,publish)
const load=async()=>{
 const seq=++generation;rows.value=[];selected.value=null;error.value='';emit('change',null)
 if(!props.goodsId||!props.warehouseId){busy.value=false;return}
 busy.value=true
 const data=await httpRequest<{items:any[]}>(`/api/warehouse/inventory/goods/${props.goodsId}/warehouse/${props.warehouseId}/pending-lots`,{headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 busy.value=false
 if(data){
  rows.value=data.items
  if(props.preferredSource){const preferred=rowKey(props.preferredSource);if(rows.value.some(row=>rowKey(row)===preferred))selected.value=preferred}
  else if(rows.value.length===1)selected.value=rowKey(rows.value[0])
 }
}
watch(()=>[props.goodsId,props.warehouseId],load,{immediate:true})
onBeforeUnmount(()=>generation++)
</script>
<template><WField :label="t('goods-label.lot')"><WCombobox v-model="selected" :disabled="disabled||busy" :loading="busy" :options="rows.map(row=>({value:rowKey(row),label:(row.lot_no||t('lot-rules.unassigned'))+' / '+(row.asn_id?'ASN #'+row.asn_id:row.dn_id?'DN #'+row.dn_id+' / '+t('ledger.movements.'+row.source_type):t('putaway-source.unknown')),description:`${row.sorted_stock} / ${row.expiry_date||'—'}`}))" two-line /><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert></WField></template>
