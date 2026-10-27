<script setup lang="ts">
/** Options come from the same permission-scoped report, never a sample catalogue. */
const props=defineProps<{ dimension:'category'|'brand'; warehouseId:number|null; filters:Record<string,any> }>()
const emit=defineEmits<{ change:[patch:Record<string,any>] }>()
const {t}=useI18n(),{categoryLabel}=useOptionLabel(),{bizErrorMessage}=useBizError()
const rows=ref<(string|null)[]>([]),page=ref(0),total=ref(0),loaded=ref(0),loading=ref(false),error=ref('')
const placement=ref<'bottom-start'|'bottom-end'>('bottom-start')
const position=(event:Event)=>{const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();placement.value=rect.left+260>window.innerWidth-16&&rect.right>=260?'bottom-end':'bottom-start'}
let generation=0
const label=computed(()=>t('stock-report.'+props.dimension))
const missing=computed(()=>String(props.filters[props.dimension+'_missing'])==='1')
const current=computed(()=>missing.value?t('stock-report.unassigned'):props.filters[props.dimension]?display(String(props.filters[props.dimension])):t('w.filter.all'))
const display=(value:string|null)=>value===null?t('stock-report.unassigned'):props.dimension==='category'?categoryLabel(value):value
const scope=computed(()=>Object.fromEntries(Object.entries(props.filters).filter(([key])=>!['page','per_page','group_by','warehouse_id',props.dimension,props.dimension+'_missing'].includes(key))))
const load=async(append=false)=>{
 const seq=append?generation:++generation
 if(append&&loading.value)return
 if(!append){rows.value=[];page.value=0;loaded.value=0;total.value=0}
 loading.value=true;error.value=''
 const next=page.value+1
 const result=await httpRequest<any>('/api/warehouse/stock-ledger/summary',{params:{...scope.value,group_by:props.dimension,warehouse_id:props.warehouseId,page:next,per_page:100},headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 if(result){rows.value=[...new Set([...rows.value,...result.items.map((row:any)=>row.group_value??null)])] as (string|null)[];page.value=next;loaded.value+=result.items.length;total.value=result.total}
 loading.value=false
}
const choose=(value:string|null|undefined)=>emit('change',{[props.dimension]:value??undefined,[props.dimension+'_missing']:value===null?1:undefined})
watch(()=>[scope.value,props.warehouseId,props.dimension],()=>load(),{deep:true})
onMounted(()=>load());onBeforeUnmount(()=>generation++)
</script>
<template>
 <WDropdown :label="label" width="260px" :placement="placement" @pointerdown.capture="position" @focusin.capture="position">
  <template #trigger="{attrs}"><button v-bind="attrs" type="button" class="metadata-filter"><span>{{label}}</span><strong>{{current}}</strong><WIcon name="chevron-down" :size="14"/></button></template>
  <button type="button" role="menuitemradio" class="w-menu-item" :aria-checked="!missing&&!filters[dimension]" @click="choose(undefined)">{{t('w.filter.all')}}</button>
  <button v-for="value in rows" :key="JSON.stringify(value)" type="button" role="menuitemradio" class="w-menu-item" :aria-checked="value===null?missing:!missing&&filters[dimension]===value" @click="choose(value)">{{display(value)}}</button>
  <span v-if="loading" class="feedback" role="status">{{t('common.status.loading')}}</span>
  <span v-if="error" class="feedback" role="alert">{{error}}</span>
  <button v-if="!loading&&(error||loaded<total)" type="button" role="menuitem" data-keep-open class="w-menu-item" @click="load(true)">{{t('stock-report.load-more')}}</button>
 </WDropdown>
</template>
<style scoped>
.metadata-filter{display:inline-flex;align-items:center;gap:6px;height:36px;max-width:280px;padding:0 10px 0 12px;border:1px solid var(--w-border-strong,#CDD1DA);border-radius:6px;background:var(--w-surface);font:inherit;font-size:14px;line-height:20px;color:var(--w-text-2);cursor:pointer}.metadata-filter strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:var(--w-text-1)}.metadata-filter>span{flex:none}.feedback{padding:8px 10px;font-size:13px;line-height:20px;color:var(--w-text-3)}
</style>
