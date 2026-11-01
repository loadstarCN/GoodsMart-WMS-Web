<script setup lang="ts">
const props=defineProps<{rows:any[];today:string;warehouseId:number;rules?:{values:Record<string,any>}}>()
const {t}=useI18n(),{$dayjs}=useNuxtApp()
const page=ref(1)
watch(()=>props.rows,()=>page.value=1)
const remaining=(row:any)=>row.expiry_date?Math.round((Date.parse(row.expiry_date+'T00:00:00Z')-Date.parse(props.today+'T00:00:00Z'))/86400000):null
const thresholds=computed(()=>['warning_days','ship_days'].filter(key=>Number(props.rules?.values[key])>0).map(key=>({key,days:Number(props.rules!.values[key])})))
const ruleDay=(row:any,days:number)=>(remaining(row)??0)-days
const left=computed(()=>-Math.max(1,...props.rows.map(row=>row.age_days||0),...props.rows.map(row=>Math.max(0,-(remaining(row)||0))),...props.rows.flatMap(row=>row.expiry_date?thresholds.value.map(rule=>Math.max(0,-ruleDay(row,rule.days))):[])))
const right=computed(()=>Math.max(1,...props.rows.map(row=>Math.max(0,remaining(row)||0))))
const x=(day:number)=>(day-left.value)*100/(right.value-left.value)
const columns=computed(()=>[
 {key:'lot',label:t('goods-label.lot')},
 {key:'quantity',label:t('common.fields.quantity'),type:'qty' as const,keepZero:true},
 {key:'timeline',label:t('goods-trend.age-timeline')},
 {key:'age_days',label:t('inventory-analysis.age-days'),value:(row:any)=>row.age_days??'—'},
 {key:'expiry_date',label:t('goods-trend.expiry'),value:(row:any)=>row.expiry_date||'—'}
])
</script>
<template><section class="goods-age"><h3>{{t('goods-trend.age-title')}}</h3><p>{{t('goods-trend.age-hint')}}</p><WTable :rows="rows.slice((page-1)*20,page*20)" :columns="columns"><template #cell-lot="{row}"><strong>{{row.lot_no||t('goods-trend.unassigned')}}</strong><small>{{row.in_at?$dayjs(row.in_at,'YYYY-MM-DD HH:mm',{warehouse_id:warehouseId}):t('goods-trend.unknown-age')}}</small></template><template #cell-timeline="{row}"><div class="timeline" :aria-label="t('goods-trend.today',{date:today})"><span v-if="row.age_days!=null" class="past" :style="{left:x(-row.age_days)+'%',width:(x(0)-x(-row.age_days))+'%'}"/><span v-if="remaining(row)!=null&&remaining(row)!>0" class="future" :style="{left:x(0)+'%',width:(x(remaining(row)!)-x(0))+'%'}"/><i v-for="rule in row.expiry_date?thresholds:[]" :key="rule.key" class="rule" :class="rule.key" :title="t('goods-trend.rule-marker',{rule:t('lot-rules.'+rule.key),days:rule.days})" :style="{left:x(ruleDay(row,rule.days))+'%'}"/><i class="today" :style="{left:x(0)+'%'}"/><i v-if="remaining(row)!=null" class="expiry" :class="{expired:remaining(row)!<0}" :style="{left:x(remaining(row)!)+'%'}"/></div><small>{{remaining(row)==null?t('goods-trend.unknown-expiry'):t(remaining(row)!<0?'goods-trend.expired-days':'goods-trend.remaining-days',{days:Math.abs(remaining(row)!)})}}</small></template></WTable><p>{{t('goods-trend.age-legend',{date:today})}}</p><p v-for="rule in thresholds" :key="rule.key" class="rule-legend"><i :class="rule.key"/>{{t('goods-trend.rule-marker',{rule:t('lot-rules.'+rule.key),days:rule.days})}}</p><WPagination v-if="rows.length>20" :page="page" :total="rows.length" :page-size="20" @update:page="page=$event"/></section></template>
<style scoped>
.goods-age{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--w-line);padding-top:16px}h3{margin:0;font-size:16px;line-height:24px;font-weight:600}p,small{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}small{display:block}strong{font-weight:500}.timeline{position:relative;min-width:220px;height:28px;background:linear-gradient(transparent 13px,var(--w-line) 13px,var(--w-line) 14px,transparent 14px)}.timeline span{position:absolute;top:9px;height:10px;border-radius:3px}.past{background:var(--w-pri)}.future{background:#dcd5ff}.timeline i{position:absolute;top:3px;height:22px;border-left:1px dashed var(--w-text-3)}.timeline .expiry{border-left:2px solid var(--w-pri)}.timeline .warning_days,.rule-legend .warning_days{border-color:#a5670b}.timeline .ship_days,.rule-legend .ship_days{border-color:var(--w-danger,#b32322)}.rule-legend{display:flex;align-items:center;gap:6px}.rule-legend i{height:14px;border-left:2px dashed}.timeline .expired{border-color:var(--w-danger,#b32322)}
</style>
