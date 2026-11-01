<script setup lang="ts">
import LotRulesEditor from './LotRulesEditor.vue'
import LotDateEditor from './LotDateEditor.vue'
const props=defineProps<{goodsId:number}>()
const staff=useStaffStore(),warehouse=useWarehouseStore()
const unassigned=ref<any>(null)
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),keyword=ref(''),page=ref(1)
const showCleared=ref(false)
const dateLot=ref<any>(null),dateOpen=ref(false)
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';data.value=null;unassigned.value=null
 const onError=(err:any)=>{if(seq===generation)error.value=bizErrorMessage(err)}
 const result=await httpRequest<any>('/api/warehouse/goods/'+props.goodsId+'/lots',{params:{keyword:keyword.value,page:page.value,per_page:20,in_stock:staff.hasPermission('inventory_read')?String(!showCleared.value):undefined},headers:warehouseHeaders(warehouse.currentWarehouse?.id),onError})
 if(seq!==generation)return
 if(result&&staff.hasPermission('inventory_read')){
  const balances=await httpRequest<any>('/api/warehouse/inventory/lot-balances',{params:{goods_id:props.goodsId,warehouse_id:warehouse.currentWarehouse?.id||undefined,lot_ids:result.items.map((row:any)=>row.id).join(',')||undefined},headers:warehouseHeaders(warehouse.currentWarehouse?.id),onError})
  if(seq!==generation)return
  if(balances){const map=new Map(balances.items.map((row:any)=>[row.lot_id,row]));result.items=result.items.map((row:any)=>({...row,...(map.get(row.id)||{})}));unassigned.value=map.get(null)}
 }
 data.value=result;loading.value=false
}
const columns=computed(()=>[{key:'lot_no',label:t('goods-label.lot'),strong:true},{key:'production_date',label:t('goods.fields.product-date')},{key:'expiry_date',label:t('goods-label.expiry')},...(staff.hasPermission('inventory_read')?[{key:'total_stock',label:t('goods.ui.onhand'),type:'qty' as const,keepZero:true},{key:'sorted_stock',label:t('goods.ui.pending'),type:'qty' as const,keepZero:true},{key:'picked_stock',label:t('inventory.fields.picked'),type:'qty' as const,keepZero:true},{key:'packed_stock',label:t('inventory.fields.packed'),type:'qty' as const,keepZero:true}]:[]),{key:'actions',label:t('common.fields.action'),align:'right' as const}])
watch([page,()=>props.goodsId,()=>warehouse.currentWarehouse?.id],load);onMounted(load);onBeforeUnmount(()=>generation++)
const search=()=>{if(page.value!==1)page.value=1;else load()}
watch(showCleared,search)
</script>
<template><section class="w-goods-lots"><header><h2>{{t('goods-label.lot')}} <small>{{data?.total??0}}</small></h2><WInput v-model="keyword" type="search" :placeholder="t('goods-label.lot')" :aria-label="t('goods-label.lot')" @keydown.enter.prevent="search" @change="search"/><WButton :to="'/goods/label/'+goodsId">{{t('goods-label.title')}}</WButton><label v-if="staff.hasPermission('inventory_read')" class="cleared-toggle"><input v-model="showCleared" type="checkbox"/>{{t('goods.ui.show-cleared-lots')}}</label></header><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><p v-if="unassigned" class="unassigned">{{t('lot-rules.unassigned')}} &middot; {{t('goods.ui.onhand')}} {{unassigned.total_stock}} &middot; {{t('goods.ui.pending')}} {{unassigned.sorted_stock}}</p><WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset><template #cell-actions="{row}"><WButton variant="text" size="sm" @click="dateLot=row;dateOpen=true">{{t('lot-dates.title')}}</WButton><WButton v-if="staff.hasPermission('inventory_read')" variant="text" size="sm" :to="{path:'/inventory/ledger',query:{goods_id:goodsId,lot_no:row.lot_no}}">{{t('ledger.title')}}</WButton><WButton variant="text" size="sm" :to="{path:'/goods/label/'+goodsId,query:{lot_id:row.id}}">{{t('goods-label.title')}}</WButton></template></WTable><footer><WPagination v-model:page="page" :page-size="20" :total="data?.total" show-total /></footer><LotRulesEditor :goods-id="goodsId" /><LotDateEditor v-if="dateLot" v-model:open="dateOpen" :goods-id="goodsId" :lot="dateLot" @saved="load"/></section></template>
<style scoped>
.cleared-toggle{display:flex;align-items:center;gap:6px;font-size:13px}.unassigned{padding:0 20px;font-size:13px;color:var(--w-text-2)}
.w-goods-lots header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px 20px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0 auto 0 0}h2 small{margin-left:6px;font-size:13px;font-weight:400;color:var(--w-text-3)}header>.w-input{width:220px}footer{padding:12px 20px;border-top:1px solid var(--w-line)}.w-goods-lots :deep(table){min-width:600px}
.w-goods-lots :deep(.w-table-wrap){--w-table-edge:20px}
.w-goods-lots :deep(thead th){height:auto;padding-top:12px;padding-bottom:8px;font-weight:500}
.w-goods-lots :deep(thead th.is-strong){color:var(--w-text-3);font-weight:500}
.w-goods-lots :deep(tbody td){height:auto;padding-top:12px;padding-bottom:12px}
.w-goods-lots :deep(tbody td:last-child){padding-top:8px;padding-bottom:8px}
.w-goods-lots :deep(tbody td:nth-child(2)){color:var(--w-text-2)}
</style>
