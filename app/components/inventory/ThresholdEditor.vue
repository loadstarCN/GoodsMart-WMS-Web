<script setup lang="ts">
import {thresholdPreviewRow,thresholdPreviewCsv} from '~/utils/thresholdPreview'
import {categoriesOptions} from '~/data/selectOptions'
const props=defineProps<{warehouseId?:number;goodsIds:number[]}>()
const open=defineModel<boolean>('open',{default:false})
const emit=defineEmits<{saved:[]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError(),staff=useStaffStore()
const canEdit=computed(()=>staff.refreshed&&!!staff.staffInfo&&staff.hasPermission('inventory_edit'))
const {categoryLabel}=useOptionLabel(),categoryListId=useId()+'-categories'
const scope=ref('selected'),scopeValues=ref(''),keepExisting=ref(true),rowFilter=ref('all')
const scopeTerms=computed(()=>[...new Set(scopeValues.value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean))])
const mode=ref('fixed'),low=ref<any>(null),high=ref<any>(null),windowDays=ref<any>(30),coverDays=ref<any>(14),overstockDays=ref<any>(90),minimum=ref<any>(1)
const rows=ref<any[]>([]),selected=ref<(string|number)[]>([]),loading=ref(false),busy=ref(false),error=ref(''),stale=ref(false)
let generation=0
const preview=async()=>{
 if(busy.value||!canEdit.value||!props.warehouseId)return
 const seq=++generation;loading.value=true;error.value='';rows.value=[];selected.value=[];stale.value=true
 try{
  if(scope.value==='selected'?!props.goodsIds.length:!scopeTerms.value.length){error.value=t('threshold.choose-scope');return}
  const filters=scope.value==='selected'?[{goods_ids:props.goodsIds.join(',')}]:scopeTerms.value.map(value=>({[scope.value]:scope.value==='category'?(categoriesOptions.find(option=>categoryLabel(option).toLowerCase()===value.toLowerCase())||value):value}))
  const collected=new Map<number,any>()
  for(const filter of filters){
   for(let page=1;;page++){
    const result=await httpRequest<any>('/api/warehouse/inventory/thresholds/suggest',{headers:warehouseHeaders(props.warehouseId),params:{...filter,page,per_page:100,window_days:windowDays.value,cover_days:coverDays.value,overstock_days:overstockDays.value,min_quantity:minimum.value},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
    if(seq!==generation||!result)return
    if(result.total>1000){error.value=t('threshold.limit');return}
    for(const row of result.items)collected.set(row.goods.id,row)
    if(collected.size>1000){error.value=t('threshold.limit');return}
    if(page*result.per_page>=result.total)break
   }
  }
  rows.value=[...collected.values()].map(row=>thresholdPreviewRow(row,{mode:mode.value,low:low.value,high:high.value,keepExisting:keepExisting.value}))
  selected.value=rows.value.filter(selectable).map(row=>row.id);stale.value=false
 }finally{if(seq===generation)loading.value=false}
}
const selectable=(row:any)=>!row.retained&&row.low!==null&&row.high!==null
const rowState=(row:any)=>row.retained?'retained':row.low===null||row.high===null?'no-outbound':'change'
const visibleRows=computed(()=>rowFilter.value==='all'?rows.value:rows.value.filter(row=>rowState(row)===rowFilter.value))
const exportPreview=()=>{
 if(loading.value||stale.value||!rows.value.length)return
 const headers=[t('goods.fields.code'),t('common.fields.name'),t('threshold.daily'),t('goods.ui.available'),t('threshold.current'),t('inventory.ui.low'),t('inventory.ui.high'),t('common.fields.status')]
 const values=rows.value.map(row=>[row.goods.code,row.goods.name,row.avg_daily_out,row.available_stock_for_sale,`${row.current_low} / ${row.current_high}`,row.low,row.high,t('threshold.'+rowState(row))])
 saveBlob(new Blob([thresholdPreviewCsv(headers,values)],{type:'text/csv;charset=utf-8'}),'threshold-preview.csv')
}

watch(open,value=>{if(value){preview()}else{generation++;rows.value=[]}})
watch([mode,low,high,windowDays,coverDays,overstockDays,minimum,scope,scopeValues,keepExisting],()=>{generation++;loading.value=false;stale.value=true})
const scopeKey=computed(()=>JSON.stringify([props.warehouseId,props.goodsIds]))
watch(scopeKey,()=>{generation++;loading.value=false;stale.value=true;rows.value=[];selected.value=[];if(!busy.value)open.value=false})
onBeforeUnmount(()=>generation++)
const save=async()=>{
 if(busy.value||loading.value||stale.value||!selected.value.length||!props.warehouseId||!canEdit.value)return
 const warehouseId=props.warehouseId,scope=scopeKey.value
 const items=rows.value.filter(row=>selectable(row)&&selected.value.includes(row.id)).map(row=>({goods_id:row.id,low_stock_threshold:Number(row.low),high_stock_threshold:Number(row.high)}))
 busy.value=true;error.value=''
 try{
  const dry=await httpRequest<any>('/api/warehouse/inventory/thresholds',{method:'PUT',headers:warehouseHeaders(warehouseId),body:{items,dry_run:true},onError:err=>{error.value=bizErrorMessage(err)}})
  if(!dry||scope!==scopeKey.value||stale.value)return
  const result=await httpRequest<any>('/api/warehouse/inventory/thresholds',{method:'PUT',headers:warehouseHeaders(warehouseId),body:{items},onError:err=>{error.value=bizErrorMessage(err)}})
  if(result){showToast(t('action-results.success'),'success');open.value=false;emit('saved')}
 }finally{busy.value=false}
}
const columns=computed(()=>[{key:'goods',label:t('nav.goods')},{key:'avg_daily_out',label:t('threshold.daily'),type:'qty' as const,keepZero:true},{key:'available_stock_for_sale',label:t('goods.ui.available'),type:'qty' as const,strong:true,keepZero:true},{key:'current',label:t('threshold.current')},{key:'low',label:t('inventory.ui.low')},{key:'high',label:t('inventory.ui.high')}])
</script>
<template><WModal v-model:open="open" :title="t('inventory.ui.thresholds')" size="xl" :closable="!busy"><div class="w-threshold-editor"><p>{{t('threshold.scope',{count:goodsIds.length})}}</p><WField :label="t('threshold.range')"><WSelect v-model="scope" :disabled="busy" :options="['selected','category','brand'].map(value=>({value,label:t('threshold.scope-'+value)}))" /></WField><WField v-if="scope!=='selected'" :label="t(scope==='category'?'goods.fields.category':'goods.fields.brand')" :hint="t('threshold.multiple')"><WInput v-model="scopeValues" :disabled="busy" :list="scope==='category'?categoryListId:undefined" /><datalist v-if="scope==='category'" :id="categoryListId"><option v-for="category in categoriesOptions" :key="category" :value="categoryLabel(category)" /></datalist></WField><WCheckbox v-model="keepExisting" :disabled="busy" :label="t('threshold.retained')" /><div class="w-threshold-modes"><section :class="{'is-selected':mode==='fixed'}"><label><input v-model="mode" type="radio" value="fixed" :disabled="busy" /><strong>{{t('threshold.fixed')}}</strong></label><WFormGrid><WField :label="t('inventory.ui.low')" :span="6"><WInput v-model="low" type="number" min="-1" step="1" :disabled="busy||mode!=='fixed'" /></WField><WField :label="t('inventory.ui.high')" :span="6"><WInput v-model="high" type="number" min="-1" step="1" :disabled="busy||mode!=='fixed'" /></WField></WFormGrid><small>{{t('threshold.keep')}} {{t('inventory.ui.disabled')}}</small></section><section :class="{'is-selected':mode==='suggest'}"><label><input v-model="mode" type="radio" value="suggest" :disabled="busy" /><strong>{{t('threshold.suggest')}}</strong></label><WFormGrid><WField :label="t('threshold.window')" :span="6"><WInput v-model="windowDays" type="number" min="1" :disabled="busy||mode!=='suggest'" /></WField><WField :label="t('threshold.cover')" :span="6"><WInput v-model="coverDays" type="number" min="1" :disabled="busy||mode!=='suggest'" /></WField><WField :label="t('threshold.overstock')" :span="6"><WInput v-model="overstockDays" type="number" min="1" :disabled="busy||mode!=='suggest'" /></WField><WField :label="t('threshold.minimum')" :span="6"><WInput v-model="minimum" type="number" min="0" :disabled="busy||mode!=='suggest'" /></WField></WFormGrid></section></div><div class="w-threshold-preview"><h3>{{t('threshold.preview')}}</h3><WButton size="sm" :disabled="loading||stale||!rows.length" @click="exportPreview">{{t('threshold.export')}}</WButton><WButton size="sm" :loading="loading" :disabled="busy" @click="preview">{{t('threshold.refresh')}}</WButton></div><WAlert v-if="error" tone="block" :title="error" /><WAlert v-if="stale" tone="warn" :title="t('threshold.stale')" /><WSegmented v-model="rowFilter" :label="t('common.fields.status')" :options="['all','change','retained','no-outbound'].map(value=>({value,label:(value==='all'?t('common.status.all'):t('threshold.'+value))+' '+rows.filter(row=>value==='all'||rowState(row)===value).length}))" /><WTable v-model:selected="selected" selectable sticky-header max-height="360px" :row-selectable="selectable" :columns="columns" :rows="visibleRows" :loading="loading" inset><template #cell-goods="{row}">{{row.goods.name}}<span class="w-threshold-sub">{{row.goods.code}}</span></template><template #cell-current="{row}">{{row.current_low<0?'—':row.current_low}} / {{row.current_high<0?'—':row.current_high}}</template><template #cell-low="{row}"><WInput v-if="row.low!==null" v-model="row.low" type="number" min="-1" step="1" :aria-label="t('inventory.ui.low')+' '+row.goods.code" :disabled="busy||row.retained" /><span v-else>{{t('threshold.no-outbound')}}</span></template><template #cell-high="{row}"><WInput v-if="row.high!==null" v-model="row.high" type="number" min="-1" step="1" :aria-label="t('inventory.ui.high')+' '+row.goods.code" :disabled="busy||row.retained" /></template></WTable></div><template #footer><span>{{t('inventory.ui.selected',{count:selected.length})}}</span><WButton :disabled="busy" @click="open=false">{{t('button.cancel')}}</WButton><WButton variant="primary" :loading="busy" :disabled="!canEdit||stale||loading||!selected.length" @click="save">{{t('button.save')}}</WButton></template></WModal></template>
<style scoped>
.w-threshold-editor{min-width:0;display:flex;flex-direction:column;gap:16px}.w-threshold-editor :deep(.w-seg){max-width:100%;overflow-x:auto}.w-threshold-editor p{margin:0;font-size:13px;color:var(--w-text-2)}.w-threshold-modes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.w-threshold-modes section{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--w-border);border-radius:6px}.w-threshold-modes section.is-selected{border-color:var(--w-pri);background:var(--w-sel-bg)}.w-threshold-modes label{display:flex;align-items:center;gap:8px}.w-threshold-modes input[type=radio]{accent-color:var(--w-pri);width:16px;height:16px}.w-threshold-modes strong{font-size:14px;font-weight:600}.w-threshold-modes small{font-size:12px;color:var(--w-text-3)}.w-threshold-preview{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.w-threshold-preview h3{margin:0;font-size:14px;line-height:22px;font-weight:600}.w-threshold-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.w-threshold-editor :deep(.w-table){min-width:800px}.w-threshold-editor :deep(td .w-input){min-width:90px;max-width:120px}@media(max-width:650px){.w-threshold-modes{grid-template-columns:1fr}}
</style>
