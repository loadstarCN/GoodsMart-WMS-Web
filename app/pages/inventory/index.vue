<script setup lang="ts">
import ThresholdEditor from '~/components/inventory/ThresholdEditor.vue'
import {pendingPutaway} from '~/composables/inventory/putawayStock'
const {t,locale}=useI18n(),route=useRoute(),router=useRouter(),staff=useStaffStore()
const {bizErrorMessage}=useBizError()
useHead({title:()=>t('nav.inventory')})
const data=ref<PaginationData|null>(null),summary=ref<any>(null),pendingSummary=ref<any>(null),loading=ref(true),error=ref('')
const keyword=ref(String(route.query.keyword||'')),selected=ref<(string|number)[]>([]),thresholdOpen=ref(false)
const pending=computed(()=>['1','true'].includes(String(route.query.pending_putaway)))
const tabs=computed(()=>[{key:'all',label:t('inventory.tabs.all')},{key:'pending',label:t('inventory.tabs.pending-putaway'),count:pendingSummary.value?.total_quantity,attention:true}])
const keys=['onhand_stock','available_stock_for_sale','dn_stock','locked_stock','return_stock','damage_stock','sorted_stock','asn_stock','received_stock','picked_stock','packed_stock','delivered_stock']
const labels=computed(()=>Object.fromEntries(keys.map((key,index)=>[key,t(['goods.ui.onhand','goods.ui.available','inventory.ui.occupied','inventory.fields.locked','inventory.fields.return','inventory.fields.damage','goods.ui.pending','inventory.fields.asn','inventory.fields.received','inventory.fields.picked','inventory.fields.packed','inventory.fields.delivered'][index]!)])))
const go=(patch:Record<string,any>,keepPage=false)=>{const query:Record<string,any>={...route.query,...patch};for(const key of Object.keys(query))if(query[key]==null||query[key]==='')delete query[key];if(!keepPage)delete query.page;router.push({query})}
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';selected.value=[]
 const params={...route.query,warehouse_id:useWarehouseStore().currentWarehouse?.id||undefined,per_page:50}
 const values=await Promise.all([
  httpRequest<PaginationData>('/api/warehouse/inventory/',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),
  httpRequest('/api/warehouse/inventory/summary',{params,onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}}),
  httpRequest('/api/warehouse/inventory/pending-putaway/summary',{params:{keyword:route.query.keyword,goods_id:route.query.goods_id}}),
 ])
 if(seq!==generation)return
 data.value=values[0];summary.value=values[1];pendingSummary.value=values[2];loading.value=false
}
watch(()=>route.query,()=>{keyword.value=String(route.query.keyword||'');load()})
onMounted(load);onBeforeUnmount(()=>{generation++})
const rowKey=(row:any)=>row.warehouse_id+':'+row.goods_id
const selection=computed(()=>data.value?.items.filter((row:any)=>selected.value.includes(rowKey(row)))||[])
const allSelected=computed({get:()=>!!data.value?.items.length&&selected.value.length===data.value.items.length,set:(value:boolean)=>{selected.value=value?data.value?.items.map(rowKey)||[]:[]}})
const openThresholds=()=>{
 if(!selection.value.length)return
 if(new Set(selection.value.map((row:any)=>row.warehouse_id)).size!==1){error.value=t('inventory.ui.choose-warehouse');return}
 thresholdOpen.value=true
}
const qty=(value:any,keep=false)=>Number(value)||keep?Number(value||0).toLocaleString(locale.value):''
const dwell=(row:any)=>{if(!row.pending_since)return '';const date=parseDateTime(row.pending_since);if(!date)return '';const days=Math.floor((Date.now()-date.getTime())/86400000);return days<1?t('inventory.pending.dwell-under-day'):t('inventory.pending.dwell-days',{n:days})}
const putawayLink=(row:any)=>({path:'/goods/detail/'+row.goods_id,query:{tab:'putaway',putaway:'open',warehouse_id:String(row.warehouse_id)}})
const parts=computed(()=>[{key:'available_stock_for_sale',color:'var(--w-pri)'},{key:'dn_stock',color:'var(--w-nontext)'},{key:'locked_stock',color:'var(--w-warn-dot)'}].map(item=>({...item,value:Number(summary.value?.[item.key]||0)})))
const pendingColumns=computed(()=>[{key:'goods',label:t('nav.goods'),wrap:true},{key:'warehouse',label:t('common.entities.warehouse'),value:(row:any)=>row.warehouse?.name},{key:'good',label:t('inventory.pending.good'),type:'qty' as const,value:(row:any)=>pendingPutaway(row)?.good},{key:'sorted_damage_stock',label:t('inventory.pending.damaged'),type:'qty' as const},{key:'sorted_stock',label:t('inventory.pending.total'),type:'qty' as const,strong:true},{key:'dwell',label:t('inventory.pending.dwell'),value:dwell},{key:'actions',label:t('common.fields.action')}])
</script>
<template>
 <div class="w-inventory w-scope">
  <header><h1>{{t('nav.inventory')}}</h1><WButton v-if="staff.hasPermission('inventory_edit')" :disabled="!selected.length" @click="openThresholds">{{t('inventory.ui.thresholds')}}</WButton></header>
  <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
  <WTabs :model-value="pending?'pending':'all'" :items="tabs" :label="t('nav.inventory')" @update:model-value="value=>go({pending_putaway:value==='pending'?'true':undefined})" />
  <section v-if="summary&&!pending" class="w-inventory__composition"><h2>{{t('inventory.ui.composition')}}</h2><div class="w-inventory__composition-main"><div class="w-inventory__total"><span>{{t('goods.ui.onhand')}}</span><strong>{{qty(summary.onhand_stock,true)}}</strong></div><div class="w-inventory__composition-body"><div class="w-inventory__bar"><span v-for="part in parts" :key="part.key" :style="{flex:Math.max(0,part.value),background:part.color}" /></div><div class="w-inventory__legend"><span v-for="part in parts" :key="part.key"><i :style="{background:part.color}" />{{labels[part.key]}} <b>{{qty(part.value,true)}}</b></span></div></div></div><div class="w-inventory__outside"><span v-for="key in ['return_stock','damage_stock','sorted_stock','asn_stock']" :key="key">{{labels[key]}} <b>{{qty(summary[key],true)}}</b></span></div></section>
  <InventoryViewNav active="/inventory" />
  <WTabs model-value="balance" :label="t('nav.inventory')" :items="[{key:'balance',label:t('ledger.balances')},{key:'ledger',label:t('ledger.title')}]" @change="key=>key==='ledger'&&router.push('/inventory/ledger')" />
  <WCard v-if="pending&&pendingSummary"><div class="w-inventory__pending-summary"><strong>{{t('inventory.pending.summary.goods',{n:pendingSummary.goods_count})}}</strong><span>{{t('inventory.pending.summary.quantity',{total:pendingSummary.total_quantity,good:pendingSummary.good_quantity,damaged:pendingSummary.damaged_quantity})}}</span><WStatus v-if="pendingSummary.overdue_quantity" tone="warn">{{t('inventory.pending.summary.overdue',{days:pendingSummary.overdue_days,n:pendingSummary.overdue_quantity})}}</WStatus></div></WCard>
  <WCard flush>
   <form class="w-inventory__filters" @submit.prevent="go({keyword:keyword.trim()})"><WInput v-model="keyword" type="search" :placeholder="t('common.search-placeholder')" :aria-label="t('common.search')"><template #prefix><WIcon name="search" :size="16" /></template></WInput><WButton type="submit">{{t('common.search')}}</WButton><WFilterSelect :model-value="route.query.below_low_threshold?'low':route.query.above_high_threshold?'high':null" :label="t('inventory.ui.thresholds')" :options="[{value:'low',label:t('inventory.thresholds.low-stock')},{value:'high',label:t('inventory.thresholds.high-stock')}]" @change="value=>go({below_low_threshold:value==='low'?'true':undefined,above_high_threshold:value==='high'?'true':undefined})" /><span v-if="selected.length">{{t('inventory.ui.selected',{count:selected.length})}}</span></form>
   <WTable v-if="pending" :rows="data?.items||[]" :columns="pendingColumns" :loading="loading" :row-key="rowKey" inset><template #cell-goods="{row}"><NuxtLink class="w-inventory__name" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-inventory__sub">{{row.goods?.code}}</span></template><template #cell-actions="{row}"><WButton v-if="staff.hasPermission('putaway_edit')" size="sm" :to="putawayLink(row)">{{t('goods.operations.create-putaway')}}</WButton></template></WTable>
   <div v-else class="w-inventory__table-wrap"><table :aria-busy="loading"><thead><tr><th rowspan="2"><WCheckbox v-model="allSelected" :indeterminate="selected.length>0&&!allSelected" :label="t('common.status.all')" /></th><th rowspan="2">{{t('nav.goods')}}</th><th rowspan="2">{{t('common.entities.warehouse')}}</th><th colspan="8" class="w-inventory__group">{{t('inventory.ui.composition')}}</th><th colspan="4" class="w-inventory__group">{{t('inventory.ui.operations')}}</th></tr><tr><th v-for="key in keys" :key="key" class="w-inventory__qty" :class="{'is-strong':key==='available_stock_for_sale'}">{{labels[key]}}</th></tr></thead><tbody><tr v-if="loading"><td colspan="15"><WEmptyState :title="t('common.status.loading')" /></td></tr><tr v-for="row in loading?[]:data?.items||[]" :key="rowKey(row)"><td><WCheckbox v-model="selected" :value="rowKey(row)" :aria-label="row.goods?.name" /></td><td><NuxtLink class="w-inventory__name" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-inventory__sub">{{row.goods?.code}}</span></td><td>{{row.warehouse?.name}}</td><td v-for="key in keys" :key="key" class="w-inventory__qty" :class="{'is-strong':key==='available_stock_for_sale','is-low':key==='available_stock_for_sale'&&row.low_stock_threshold>=0&&row[key]<row.low_stock_threshold}">{{qty(row[key],key==='available_stock_for_sale')}}</td></tr><tr v-if="!loading&&!data?.items.length"><td colspan="15"><WEmptyState :title="t('common.status.nothing-show')" /></td></tr></tbody></table></div>
   <footer><WPagination :page="Number(route.query.page)||1" :total="data?.total" :page-size="50" show-total @update:page="value=>go({page:value},true)" /></footer>
  </WCard>
  <ThresholdEditor v-model:open="thresholdOpen" :warehouse-id="selection[0]?.warehouse_id" :goods-ids="selection.map(row=>row.goods_id)" @saved="load" />
 </div>
</template>
<style scoped>
.w-inventory { display:flex; flex-direction:column; gap:16px; }
.w-inventory header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.w-inventory h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; }
.w-inventory h2 { margin:0; font-size:16px; line-height:24px; font-weight:600; }
.w-inventory__composition { padding:20px 24px; border:1px solid var(--w-border); border-radius:10px; background:var(--w-surface); display:flex; flex-direction:column; gap:16px; }
.w-inventory__composition-main { display:flex; gap:24px; align-items:center; }
.w-inventory__total { display:flex; flex-direction:column; min-width:120px; }
.w-inventory__total>span { font-size:12px; line-height:18px; color:var(--w-text-2); }
.w-inventory__total strong { font-size:28px; line-height:36px; font-weight:600; }
.w-inventory__composition-body { flex:1; min-width:0; }
.w-inventory__bar { display:flex; height:12px; gap:2px; border-radius:3px; overflow:hidden; background:var(--w-line); }
.w-inventory__legend { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:12px; }
.w-inventory__legend>span { display:flex; align-items:center; gap:6px; font-size:12px; line-height:18px; }
.w-inventory__legend i { width:8px; height:8px; border-radius:2px; }
.w-inventory__outside { display:flex; flex-wrap:wrap; gap:8px; }
.w-inventory__outside>span { border:1px solid var(--w-border); border-radius:999px; padding:3px 10px; font-size:13px; line-height:20px; color:var(--w-text-2); }
.w-inventory__outside b { font-weight:600; color:var(--w-text-1); }
.w-inventory__filters { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:12px 20px; border-bottom:1px solid var(--w-line); }
.w-inventory__filters>.w-input { flex:1 1 260px; max-width:360px; }
.w-inventory__filters>span { margin-left:auto; font-size:13px; }
.w-inventory__table-wrap { overflow:auto; }
.w-inventory table { width:100%; border-collapse:collapse; font-size:13px; line-height:20px; white-space:nowrap; }
.w-inventory th { font-size:12px; line-height:16px; font-weight:500; color:var(--w-text-3); padding:8px; border-bottom:1px solid var(--w-border); vertical-align:bottom; }
.w-inventory td { padding:12px 8px; border-bottom:1px solid var(--w-line); }
.w-inventory th:first-child,.w-inventory td:first-child { padding-left:20px; }
.w-inventory th:last-child,.w-inventory td:last-child { padding-right:20px; }
.w-inventory .w-inventory__qty { text-align:right; }
.w-inventory .w-inventory__group { text-align:center; border-left:1px solid var(--w-line); }
.w-inventory .is-strong { font-weight:600; color:var(--w-text-1); }
.w-inventory .is-low { color:var(--w-warn-text); }
.w-inventory__name { display:block; font-weight:500; font-size:14px; line-height:20px; color:var(--w-text-1); white-space:normal; min-width:160px; }
.w-inventory__sub { display:block; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-inventory footer { padding:12px 20px; border-top:1px solid var(--w-border); }
.w-inventory__pending-summary { display:flex; gap:12px; flex-wrap:wrap; align-items:center; font-size:13px; line-height:20px; }
@media(max-width:600px){.w-inventory__composition-main{flex-direction:column;align-items:stretch;gap:12px}}
</style>
