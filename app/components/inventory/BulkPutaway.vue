<script setup lang="ts">
import PendingLotPicker from './PendingLotPicker.vue'
import {putawaySplitLimit,type PendingPutaway} from '~/composables/inventory/putawayStock'
const open=defineModel<boolean>('open',{default:false})
const props=defineProps<{rows:any[]}>(),emit=defineEmits<{saved:[]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError(),staff=useStaffStore()
type Source={lot_id:number|null;receipt_source_id:number;pending:PendingPutaway|null}
const drafts=ref<{key:number;searchGeneration:number;stock:any;source:Source|null;location:number|null;options:any[];quantity:number|null;remark:string}[]>([])
let nextKey=0
const newRow=(stock:any)=>({key:++nextKey,searchGeneration:0,stock,source:null,location:null,options:[],quantity:null,remark:''})
const split=(stock:any)=>{if(!busy.value&&!uncertain.value&&drafts.value.length<100)drafts.value.push(newRow(stock))}
const {locationTypeLabel}=useOptionLabel()
const busy=ref(false),error=ref(''),uncertain=ref(false)
const dirty=computed(()=>open.value&&(drafts.value.length!==props.rows.length||drafts.value.some(row=>row.location!==null||row.quantity!==null||!!row.remark)))
useUnsavedForm(()=>dirty.value||busy.value,()=>busy.value)
let closing=false
const close=async()=>{if(busy.value||closing)return;closing=true;try{if(dirty.value&&!await wConfirm({title:t('unsaved-form.title'),message:t('unsaved-form.message'),confirmText:t('unsaved-form.leave'),cancelText:t('unsaved-form.stay')}))return;open.value=false}finally{closing=false}}
const modalOpen=computed({get:()=>open.value,set:value=>{if(!value)void close()}})
watch(open,value=>{if(value){error.value='';uncertain.value=false;drafts.value=props.rows.map(newRow)}})
const locationOf=(row:typeof drafts.value[number])=>row.options.find(item=>item.id===row.location)
const maximum=(row:typeof drafts.value[number])=>row.source?.pending&&locationOf(row)?putawaySplitLimit(row.source.pending,locationOf(row).location_type,drafts.value.filter(other=>other.key!==row.key&&other.stock.goods_id===row.stock.goods_id&&other.stock.warehouse_id===row.stock.warehouse_id&&other.source?.lot_id===row.source?.lot_id&&other.source?.receipt_source_id===row.source?.receipt_source_id&&locationOf(other)).map(other=>({quantity:Number(other.quantity),locationType:locationOf(other).location_type}))):0
const valid=computed(()=>drafts.value.length>0&&new Set(drafts.value.map(row=>row.stock.warehouse_id)).size===1&&drafts.value.every(row=>row.source&&row.location&&Number.isInteger(row.quantity)&&Number(row.quantity)>0&&Number(row.quantity)<=maximum(row)))
const search=async(row:typeof drafts.value[number],code:string)=>{
 const seq=++row.searchGeneration
 const current=()=>open.value&&seq===row.searchGeneration&&drafts.value.some(item=>item.key===row.key)
 const data=await httpRequest<PaginationData>(`/api/warehouse/goods/${row.stock.goods_id}/putaway-locations`,{params:{code:code||undefined,lot_id:row.source?.lot_id||undefined,per_page:50,warehouse_id:row.stock.warehouse_id},headers:warehouseHeaders(row.stock.warehouse_id),onError:e=>{if(current())error.value=bizErrorMessage(e)}})
 const options=data?.items||[]
 if(current())row.options=options
 return options.map(item=>({value:item.id,label:item.code,description:locationTypeLabel(item.location_type)+' · '+t('goods.ui.same-lot-stock',{count:item.same_lot_quantity})+(item.other_lot_quantity>0?' · '+t('goods.ui.mixed-lot-stock',{count:item.other_lot_quantity}):'')}))
}
const selectSource=(row:typeof drafts.value[number],source:Source|null)=>{if(row.source?.lot_id!==source?.lot_id){row.location=null;row.searchGeneration++}row.source=source}
const submit=async()=>{
 if(busy.value||uncertain.value||!valid.value||!staff.hasPermission('putaway_edit'))return
 busy.value=true;error.value=''
 try{
  const data=await httpRequest<any[]>('/api/warehouse/putaway/bulk',{method:'POST',headers:warehouseHeaders(drafts.value[0]!.stock.warehouse_id),body:drafts.value.map(row=>({goods_id:row.stock.goods_id,location_id:row.location,quantity:Number(row.quantity),lot_id:row.source!.lot_id,receipt_source_id:row.source!.receipt_source_id,remark:row.remark||null})),onError:e=>{error.value=bizErrorMessage(e);uncertain.value=!e.status||e.status>=500}})
  if(data){showToast(t('action-results.success'),'success');open.value=false;emit('saved')}
 }finally{busy.value=false}
}
const refresh=()=>{open.value=false;emit('saved')}
</script>
<template><WModal v-model:open="modalOpen" :title="drafts.length===1?t('goods.operations.create-putaway'):t('pending-bulk.title')" :closable="!busy"><p class="bulk-hint">{{t('pending-bulk.hint')}}</p><WAlert v-if="error" tone="block" :title="error"/><WAlert v-if="uncertain" tone="warn" :title="t('pending-bulk.uncertain')"><template #actions><WButton @click="refresh">{{t('pending-bulk.refresh')}}</WButton></template></WAlert><div class="bulk-rows"><section v-for="row in drafts" :key="row.key"><h3>{{row.stock.goods?.name}} <small>{{row.stock.goods?.code}}</small></h3><WFormGrid><PendingLotPicker :preferred-source="row.stock.source_type?row.stock:undefined" :goods-id="row.stock.goods_id" :warehouse-id="row.stock.warehouse_id" :disabled="busy||uncertain" @change="selectSource(row,$event)"/><WField :label="t('common.entities.location')"><WCombobox :key="String(row.source?.lot_id)" v-model="row.location" :search="code=>search(row,code)" :selected-label="locationOf(row)?.code||''" :disabled="busy||uncertain" two-line/></WField><WField :label="t('common.fields.quantity')" :hint="t('pending-bulk.maximum',{n:maximum(row)})"><WInput v-model.number="row.quantity" type="number" min="1" :max="maximum(row)" step="1" :disabled="busy||uncertain"/></WField><WField :label="t('common.fields.remark')" optional><WInput v-model="row.remark" :disabled="busy||uncertain"/></WField></WFormGrid><div class="split-actions"><WButton size="sm" :disabled="busy||uncertain||drafts.length>=100" @click="split(row.stock)">{{t('pending-split.add')}}</WButton><WButton v-if="drafts.length>1" size="sm" variant="text" :disabled="busy||uncertain" @click="drafts=drafts.filter(item=>item.key!==row.key)">{{t('pending-split.remove')}}</WButton></div></section></div><template #footer><WButton :disabled="busy" @click="close">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="busy" :disabled="!valid||uncertain" @click="submit">{{t('button.submit')}}</WButton></template></WModal></template>
<style scoped>.bulk-hint{font-size:13px;line-height:20px;color:var(--w-text-2)}.bulk-rows{display:flex;flex-direction:column;gap:16px}.bulk-rows section{padding:12px 0;border-top:1px solid var(--w-line)}h3{margin:0 0 12px;font-size:14px;line-height:20px;font-weight:600;overflow-wrap:anywhere}small{font-size:12px;font-weight:400;color:var(--w-text-3)}</style>

<style scoped>.split-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}</style>
