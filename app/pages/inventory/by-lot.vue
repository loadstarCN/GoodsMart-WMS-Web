<script setup lang="ts">
const {t}=useI18n(),route=useRoute(),router=useRouter(),warehouse=useWarehouseStore(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),keyword=ref(String(route.query.keyword||''))
const ready=ref(false)
let generation=0
const go=(patch:Record<string,unknown>,keepPage=false)=>{
 const query:Record<string,any>={...route.query,...patch};delete query.warehouse_id
 if(!keepPage)delete query.page
 for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key]
 router.push({query})
}
const load=async()=>{
 const seq=++generation,id=warehouse.currentWarehouse?.id
 data.value=null;error.value='';loading.value=false
 if(!id)return
 loading.value=true
 ready.value=false
 const current=await staff.getCurrentStaffInfo();if(seq!==generation)return
 if(!current){error.value=t('common.validation.company-required');loading.value=false;return}
 ready.value=true
 const result=await httpRequest<any>('/api/warehouse/inventory/expiry',{headers:warehouseHeaders(id),params:{keyword:route.query.keyword,status:route.query.status,has_lot:route.query.has_lot,page:Number(route.query.page)||1,per_page:50},onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){data.value=result;loading.value=false}
}
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()})
watch(()=>warehouse.currentWarehouse?.id,()=>{if(Number(route.query.page)>1)go({page:undefined});else load()})
onMounted(load);onBeforeUnmount(()=>generation++)
useHead({title:()=>t('lot-view.title')})
const columns=computed(()=>[
 {key:'goods',label:t('nav.goods'),wrap:true},
 {key:'lot_no',label:t('goods-label.lot'),value:(row:any)=>row.lot_no||t('lot-rules.unassigned')},
 {key:'production_date',label:t('goods.fields.product-date'),value:(row:any)=>row.production_date||'—'},
 {key:'expiry_date',label:t('goods-label.expiry'),value:(row:any)=>row.expiry_date||'—'},
 {key:'remaining_days',label:t('lot-view.remaining'),type:'qty' as const,keepZero:true,value:(row:any)=>row.remaining_days??'—'},
 {key:'status',label:t('common.fields.status')},
 ...[{key:'quantity',label:t('inventory.fields.total')},{key:'onhand_stock',label:t('goods.ui.onhand')},{key:'sorted_stock',label:t('goods.ui.pending')},{key:'damage_stock',label:t('inventory.fields.damage')},{key:'return_stock',label:t('inventory.fields.return')},{key:'picked_stock',label:t('inventory.fields.picked')},{key:'packed_stock',label:t('inventory.fields.packed')},{key:'location_count',label:t('nav.location')}].map(c=>({...c,type:'qty' as const,keepZero:true}))
])
</script>
<template>
 <div class="w-lot-inventory w-scope">
  <header><h1>{{t('nav.inventory')}}</h1><p>{{t('lot-view.scope')}}</p></header>
  <InventoryViewNav active="/inventory/by-lot"/>
  <WAlert v-if="!warehouse.currentWarehouse" tone="warn" :title="t('lot-view.warehouse')"/>
  <template v-else>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <WCard flush>
    <form @submit.prevent="go({keyword:keyword.trim()})"><WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('lot-view.search')" @change="go({keyword:keyword.trim()})"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WFilterSelect :model-value="String(route.query.status||'')||null" :label="t('common.fields.status')" :options="['normal','warning','blocked','unknown'].map(value=>({value,label:t('expiry.'+value)}))" @change="value=>go({status:value})"/><WCheckbox :model-value="route.query.has_lot==='false'" :label="t('lot-rules.unassigned')" @update:model-value="value=>go({has_lot:value?'false':undefined})"/></form>
    <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset>
     <template #cell-goods="{row}"><NuxtLink v-if="ready&&staff.hasPermission('goods_read')" :to="{path:'/goods/detail/'+row.goods_id,query:{tab:'lots'}}">{{row.goods_name}}</NuxtLink><strong v-else>{{row.goods_name}}</strong><small>{{row.goods_code}}</small></template>
     <template #cell-status="{row}"><WStatus :tone="row.status==='normal'?'ok':row.status==='warning'?'warn':row.status==='blocked'?'bad':'none'">{{t('expiry.'+row.status)}}</WStatus></template>
     <template #cell-sorted_stock="{row}">{{row.sorted_stock}}<small v-if="row.sorted_damage_stock">{{t('inventory.pending.damaged-part',{n:row.sorted_damage_stock})}}</small></template>
    </WTable>
    <footer><WPagination :page="Number(route.query.page)||1" :page-size="50" :total="data?.total||0" show-total @update:page="value=>go({page:value},true)"/></footer>
   </WCard>
   <p class="hint">{{t('lot-view.buckets')}}</p>
  </template>
 </div>
</template>
<style scoped>
.w-lot-inventory{display:flex;flex-direction:column;gap:16px}.w-lot-inventory h1{font-size:24px;line-height:32px;margin:0;font-weight:600}header p,.hint{font-size:12px;line-height:18px;color:var(--w-text-3);margin:6px 0 0}form{display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px}form :deep(.w-input){width:320px;max-width:100%}.w-lot-inventory :deep(.w-table){min-width:1350px}.w-lot-inventory :deep(td){padding-top:12px;padding-bottom:12px}a,strong{font-size:14px;font-weight:500;color:var(--w-text-1);text-decoration:none}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}footer{padding:12px 20px;border-top:1px solid var(--w-border)}
</style>
