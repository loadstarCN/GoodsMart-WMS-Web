<script setup lang="ts">
import {pendingPutaway} from '~/composables/inventory/putawayStock'
const props=defineProps<{goodsId:number;warehouseId:number}>()
const {t}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const rows=ref<any[]>([]),loading=ref(false),loaded=ref(false),error=ref('')
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value=''
 const data=await httpRequest<{items:any[]}>(`/api/warehouse/inventory/goods/${props.goodsId}/warehouse/${props.warehouseId}/pending-lots`,{headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 rows.value=data?.items||[];loaded.value=!!data;loading.value=false
}
const toggle=(event:Event)=>{if((event.target as HTMLDetailsElement).open&&!loaded.value&&!loading.value)load()}
onBeforeUnmount(()=>generation++)
</script>
<template><details class="pending-sources" @toggle="toggle"><summary>{{t('pending-age.sources')}}</summary><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><span v-else-if="loading">{{t('common.status.loading')}}</span><span v-else-if="loaded&&!rows.length">{{t('common.status.nothing-show')}}</span><ul v-else><li v-for="row in rows" :key="`${row.lot_id??0}:${row.receipt_source_id}`"><strong>{{row.lot_no||t('lot-rules.unassigned')}}</strong><span v-if="row.expiry_date">{{t('goods-label.expiry')}}: {{row.expiry_date}}</span><NuxtLink v-if="row.asn_id&&staff.hasPermission('asn_read')" :to="'/asn/detail/'+row.asn_id">ASN-{{row.asn_id}}</NuxtLink><span v-else>{{row.asn_id?'ASN-'+row.asn_id:row.dn_id?'DN-'+row.dn_id+' / '+t('ledger.movements.'+row.source_type):t('putaway-source.unknown')}}</span><span>{{t('inventory.pending.good')}} {{pendingPutaway(row)?.good}} · {{t('inventory.pending.damaged')}} {{row.sorted_damage_stock}}</span></li></ul></details></template>
<style scoped>
.pending-sources{margin-top:8px;min-width:200px;font-size:12px;line-height:18px}.pending-sources summary{cursor:pointer;color:var(--w-link);padding:4px 0}.pending-sources summary:focus-visible{outline:2px solid var(--w-pri);outline-offset:2px}.pending-sources ul{list-style:none;margin:4px 0 0;padding:0}.pending-sources li{display:flex;flex-direction:column;gap:3px;padding:8px 0;border-top:1px solid var(--w-line);color:var(--w-text-2)}.pending-sources strong{color:var(--w-text-1);font-weight:500}.pending-sources a{color:var(--w-link)}
</style>
