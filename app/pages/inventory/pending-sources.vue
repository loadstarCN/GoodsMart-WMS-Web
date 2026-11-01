<script setup lang="ts">
import BulkPutaway from '~/components/inventory/BulkPutaway.vue'
const {t}=useI18n(),route=useRoute(),router=useRouter(),warehouse=useWarehouseStore(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),keyword=ref(String(route.query.keyword||''))
const ready=ref(false)
const selected=ref<(string|number)[]>([]),bulkOpen=ref(false),exporting=ref(false)
const selection=computed(()=>data.value?.items.filter((row:any)=>selected.value.includes(row.id))||[])
const canPutaway=computed(()=>ready.value&&!!staff.staffInfo&&staff.hasPermission('putaway_edit'))
const filters=()=>Object.fromEntries(['keyword','source','damaged','has_lot','overdue_days'].map(key=>[key,route.query[key]]).filter(([,value])=>value!=null&&value!==''))
let generation=0
const go=(patch:Record<string,unknown>,keepPage=false)=>{
 const query:Record<string,any>={...filters(),...patch};if(keepPage&&route.query.page)query.page=patch.page??route.query.page
 for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key]
 router.push({query})
}
const load=async()=>{
 const seq=++generation,id=warehouse.currentWarehouse?.id
 data.value=null;selected.value=[];error.value='';loading.value=false;ready.value=false
 if(!id)return
 loading.value=true
 const current=await staff.getCurrentStaffInfo();if(seq!==generation)return
 if(!current){error.value=t('common.validation.company-required');loading.value=false;return}
 ready.value=true
 const result=await httpRequest<any>('/api/warehouse/inventory/pending-putaway/sources',{headers:warehouseHeaders(id),params:{...filters(),page:Number(route.query.page)||1,per_page:50},onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){data.value=result;loading.value=false}
}
const download=async()=>{
 const id=warehouse.currentWarehouse?.id,seq=generation
 if(!id||!ready.value||!data.value||loading.value||exporting.value)return
 exporting.value=true;error.value=''
 try{const params=new URLSearchParams(Object.entries(filters()).map(([key,value])=>[key,String(value)]));await downloadFile('/api/warehouse/inventory/pending-putaway/sources/export?'+params,{headers:warehouseHeaders(id)},'pending-sources.csv')}
 catch(e){if(seq===generation)error.value=bizErrorMessage(e as HttpRequestError)}finally{exporting.value=false}
}
const openBulk=(row?:any)=>{if(!canPutaway.value||loading.value)return;if(row)selected.value=[row.id];if(selection.value.length)bulkOpen.value=true}
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');bulkOpen.value=false;load()})
watch(()=>warehouse.currentWarehouse?.id,()=>{bulkOpen.value=false;if(Number(route.query.page)>1)go({});else load()})
onMounted(load);onBeforeUnmount(()=>generation++)
useHead({title:()=>t('pending-source-view.title')})
const dwell=(row:any)=>{const date=row.pending_since&&parseDateTime(row.pending_since);if(!date)return '—';const days=Math.floor((Date.now()-date.getTime())/86400000);return days<1?t('inventory.pending.dwell-under-day'):t('inventory.pending.dwell-days',{n:days})}
const columns=computed(()=>[
 {key:'goods',label:t('nav.goods'),wrap:true},
 {key:'lot_no',label:t('goods-label.lot'),value:(row:any)=>row.lot_no||(row.tracks_lots?t('lot-rules.unassigned'):'')},
 {key:'source',label:t('pending-source-view.source')},
 {key:'expiry_date',label:t('goods-label.expiry'),value:(row:any)=>row.expiry_date||'—'},
 ...[{key:'good_quantity',label:t('inventory.pending.good')},{key:'sorted_damage_stock',label:t('inventory.pending.damaged')},{key:'sorted_stock',label:t('inventory.pending.total')}].map(c=>({...c,type:'qty' as const,keepZero:true})),
 {key:'dwell',label:t('inventory.pending.dwell'),value:dwell},
 {key:'locations',label:t('pending-source-view.locations'),wrap:true},
 ...(canPutaway.value?[{key:'actions',label:t('common.fields.action')}]:[])
])
</script>
<template>
 <div class="w-pending-sources w-scope">
  <header><div><h1>{{t('pending-source-view.title')}}</h1><p>{{t('pending-source-view.hint')}}</p></div><WButton :disabled="!warehouse.currentWarehouse||!ready||!data||loading||!!error" :loading="exporting" icon="download" @click="download">{{t('goods.ui.export')}}</WButton></header>
  <WButton variant="text" to="/inventory?pending_putaway=true">← {{t('inventory.tabs.pending-putaway')}}</WButton>
  <WAlert v-if="!warehouse.currentWarehouse" tone="warn" :title="t('pending-source-view.warehouse')"/>
  <template v-else>
   <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
   <section v-if="data" class="summary"><div v-for="item in [{key:'quantity',label:t('inventory.pending.total')},{key:'damaged_quantity',label:t('inventory.pending.damaged')},{key:'unknown_quantity',label:t('putaway-source.unknown')}]" :key="item.key"><span>{{item.label}}</span><strong>{{data.summary[item.key]}}</strong></div></section>
   <WCard flush>
    <form @submit.prevent="go({keyword:keyword.trim()})">
     <WInput v-model="keyword" type="search" :aria-label="t('common.search')" :placeholder="t('pending-source-view.search')"><template #prefix><WIcon name="search" :size="16"/></template></WInput><WButton type="submit">{{t('common.search')}}</WButton>
     <WFilterSelect :model-value="String(route.query.source||'')||null" :label="t('pending-source-view.source')" :options="[{value:'asn',label:'ASN'},...['pack_short_return','dn_cancel_return'].map(value=>({value,label:t('ledger.movements.'+value)})),{value:'unknown',label:t('putaway-source.unknown')}]" @change="value=>go({source:value})"/>
     <WFilterSelect :model-value="String(route.query.damaged||'')||null" :label="t('inventory.pending.damaged')" :options="[{value:'true',label:t('inventory.pending.damaged')}]" @change="value=>go({damaged:value})"/>
     <WFilterSelect :model-value="String(route.query.has_lot||'')||null" :label="t('goods-label.lot')" :options="[{value:'true',label:t('pending-source-view.with-lot')}]" @change="value=>go({has_lot:value})"/>
     <WFilterSelect :model-value="String(route.query.overdue_days||'')||null" :label="t('inventory.pending.dwell')" :options="[3,7,30].map(n=>({value:String(n),label:t('pending-age.overdue',{days:n})}))" @change="value=>go({overdue_days:value})"/>
    </form>
    <div v-if="canPutaway" class="bulk"><WButton :disabled="!selection.length||loading" @click="openBulk()">{{t('pending-bulk.title')}}<template v-if="selected.length"> ({{selected.length}})</template></WButton></div>
    <WTable :rows="data?.items||[]" :columns="columns" :loading="loading" :selectable="canPutaway" v-model:selected="selected" row-key="id" inset>
     <template #cell-goods="{row}"><NuxtLink v-if="ready&&staff.hasPermission('goods_read')" :to="'/goods/detail/'+row.goods_id">{{row.goods.name}}</NuxtLink><strong v-else>{{row.goods.name}}</strong><small>{{row.goods.code}}</small></template>
     <template #cell-expiry_date="{row}"><span>{{row.expiry_date||'—'}}</span><small v-if="row.remaining_days!=null">{{t('goods-trend.remaining-days',{days:row.remaining_days})}}</small><WStatus v-if="row.expiry_status==='below_acceptance'" tone="warn">{{t('pending-source-view.below-acceptance',{days:row.accept_days})}}</WStatus><WStatus v-else-if="row.expiry_status==='warning'" tone="warn">{{t('expiry.warning')}}</WStatus></template><template #cell-source="{row}"><NuxtLink v-if="ready&&row.asn_id&&staff.hasPermission('asn_read')" :to="'/asn/detail/'+row.asn_id">ASN #{{row.asn_id}}</NuxtLink><NuxtLink v-else-if="ready&&row.dn_id&&staff.hasPermission('dn_read')" :to="'/dn/detail/'+row.dn_id">DN #{{row.dn_id}}</NuxtLink><span v-else>{{row.asn_id?'ASN #'+row.asn_id:row.dn_id?'DN #'+row.dn_id:t('putaway-source.unknown')}}</span><small v-if="row.dn_id">{{t('ledger.movements.'+row.source_type)}}</small></template>
     <template #cell-locations="{row}"><span v-if="!row.locations.length">—</span><small v-for="location in row.locations" :key="location.id">{{location.code}} · {{location.quantity}}</small><small v-if="row.location_count>row.locations.length">+{{row.location_count-row.locations.length}}</small></template>
     <template #cell-actions="{row}"><WButton size="sm" @click="openBulk(row)">{{t('goods.operations.create-putaway')}}</WButton></template>
    </WTable>
    <footer><WPagination :page="Number(route.query.page)||1" :page-size="50" :total="data?.total||0" show-total @update:page="value=>go({page:value},true)"/></footer>
   </WCard>
  </template>
  <BulkPutaway v-model:open="bulkOpen" :rows="selection" @saved="load"/>
 </div>
</template>
<style scoped>
.w-pending-sources{display:flex;flex-direction:column;gap:16px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h1{font-size:24px;line-height:32px;margin:0;font-weight:600}header p{font-size:12px;line-height:18px;color:var(--w-text-3);margin:6px 0 0;max-width:720px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.summary>div{padding:20px 24px;border:1px solid var(--w-border);border-radius:10px;background:var(--w-surface)}.summary span,small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.summary strong{display:block;font-size:24px;line-height:32px;font-weight:600;margin-top:6px}form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 20px}form :deep(.w-input){width:280px;max-width:100%}.bulk{padding:0 20px 12px}.w-pending-sources :deep(.w-table){min-width:1200px}.w-pending-sources :deep(td){padding-top:12px;padding-bottom:12px}a,strong{font-size:14px;font-weight:500;color:var(--w-text-1);text-decoration:none}footer{padding:12px 20px;border-top:1px solid var(--w-border)}
</style>
