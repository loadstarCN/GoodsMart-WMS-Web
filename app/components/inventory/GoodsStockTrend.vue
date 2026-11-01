<script setup lang="ts">
type Day={date:string;stock:number;inbound:number;outbound:number;adjust_loss:number;coverage:string}
const props=defineProps<{days:Day[];goodsId?:string|number;thresholds?:{low:number;high:number}|null}>()
const {t,locale}=useI18n()
const staff=useStaffStore()
const ledger=(day:string)=>({path:'/inventory/ledger',query:{goods_id:props.goodsId,start_time:day,end_time:day,time_field:'occurred'}})
const canOpen=computed(()=>!!props.goodsId&&staff.hasPermission('inventory_read'))
const lines=computed(()=>[{key:'low',value:props.thresholds?.low},{key:'high',value:props.thresholds?.high}].filter(row=>row.value!=null&&row.value>=0))
const table=ref(false),selected=ref<number|null>(null)
const n=(value:number)=>Number(value||0).toLocaleString(locale.value)
const maximum=computed(()=>Math.max(1,...props.days.filter(d=>d.coverage!=='none').map(d=>d.stock),...lines.value.map(row=>row.value!)))
const flowMax=computed(()=>Math.max(1,...props.days.flatMap(d=>[d.inbound,d.outbound+d.adjust_loss])))
const x=(i:number)=>40+i*740/Math.max(1,props.days.length-1)
const y=(value:number)=>130-value/maximum.value*110
const segments=computed(()=>{
 const result:{points:string;partial:boolean}[]=[]
 let points:string[]=[],coverage=''
 const flush=()=>{if(points.length)result.push({points:points.join(' '),partial:coverage==='on_shelf_only'});points=[]}
 props.days.forEach((d,i)=>{if(d.coverage==='none'){flush();coverage='';return}if(d.coverage!==coverage){flush();coverage=d.coverage}points.push(x(i)+','+y(d.stock))});flush();return result
})
const active=computed(()=>props.days[selected.value??props.days.length-1])
const columns=computed(()=>[
 {key:'date',label:t('goods-trend.date')},
 {key:'stock',label:t('goods-trend.stock'),value:(row:Day)=>row.coverage==='none'?'—':n(row.stock)},
 {key:'inbound',label:t('goods-trend.inbound'),type:'qty' as const,keepZero:true},
 {key:'outbound',label:t('goods-trend.outbound'),type:'qty' as const,keepZero:true},
 {key:'adjust_loss',label:t('goods-trend.loss'),type:'qty' as const,keepZero:true},
 {key:'coverage',label:t('goods-trend.coverage'),value:(row:Day)=>t('goods-trend.'+row.coverage)}
])
</script>
<template><section class="goods-trend"><header><h3>{{t('goods-trend.title')}}</h3><WButton size="sm" variant="text" @click="table=!table">{{t(table?'operator-chart.chart':'operator-chart.table')}}</WButton></header>
<p>{{t('goods-trend.hint')}}</p>
<WTable v-if="table" :rows="days" :columns="columns" :row-key="(row:Day)=>row.date"><template #cell-date="{row}"><NuxtLink v-if="canOpen" :to="ledger(row.date)">{{row.date}}</NuxtLink><span v-else>{{row.date}}</span></template></WTable>
<template v-else><svg viewBox="0 0 800 260" role="img" :aria-label="t('goods-trend.title')">
 <g v-for="fraction in [0,.5,1]" :key="fraction"><line x1="40" x2="780" :y1="y(maximum*fraction)" :y2="y(maximum*fraction)" class="grid"/><text x="34" :y="y(maximum*fraction)+4" text-anchor="end">{{n(maximum*fraction)}}</text></g>
 <polyline v-for="(segment,i) in segments" :key="i" :points="segment.points" fill="none" stroke="#7855fe" stroke-width="2" :stroke-dasharray="segment.partial?'5 4':undefined"/>
 <g v-for="line in lines" :key="line.key"><line x1="40" x2="780" :y1="y(line.value!)" :y2="y(line.value!)" stroke="#a1a7b3" stroke-dasharray="4 4"/><text x="776" :y="y(line.value!)-4" text-anchor="end">{{t('inventory.ui.'+line.key)}} {{line.value}}</text></g>
 <line x1="40" x2="780" y1="200" y2="200" class="grid"/>
 <g v-for="(day,i) in days" :key="day.date"><circle v-if="day.coverage!=='none'" :cx="x(i)" :cy="y(day.stock)" r="1.8" fill="#7855fe"/>
  <rect :x="x(i)-2" :y="200-day.inbound/flowMax*45" width="4" :height="day.inbound/flowMax*45" fill="#998bff"/>
  <rect :x="x(i)-2" y="200" width="4" :height="day.outbound/flowMax*35" fill="#4e1dbc"/>
  <rect :x="x(i)-2" :y="200+day.outbound/flowMax*35" width="4" :height="day.adjust_loss/flowMax*35" fill="#9ca3af"/>
  <rect :x="x(i)-4" y="12" width="8" height="226" fill="transparent" @mouseenter="selected=i" @click="selected=i"><title>{{day.date}} · {{t('goods-trend.stock')}} {{day.coverage==='none'?'—':n(day.stock)}} · +{{n(day.inbound)}} / −{{n(day.outbound)}}</title></rect>
 </g>
 <text x="40" y="255">{{days[0]?.date}}</text><text x="780" y="255" text-anchor="end">{{days[days.length-1]?.date}}</text>
</svg><label class="day-picker">{{t('goods-trend.date')}}<input type="range" :value="selected??Math.max(0,days.length-1)" min="0" :max="Math.max(0,days.length-1)" :aria-label="t('goods-trend.date')" @input="selected=Number(($event.target as HTMLInputElement).value)"/></label>
<p v-if="active" class="day-values" aria-live="polite"><b>{{active.date}}</b><span>{{t('goods-trend.stock')}} {{active.coverage==='none'?'—':n(active.stock)}}</span><span>{{t('goods-trend.inbound')}} +{{n(active.inbound)}}</span><span>{{t('goods-trend.outbound')}} −{{n(active.outbound)}}</span><span>{{t('goods-trend.loss')}} −{{n(active.adjust_loss)}}</span><span>{{t('goods-trend.'+active.coverage)}}</span><NuxtLink v-if="canOpen" :to="ledger(active.date)">{{t('ledger.title')}} &rarr;</NuxtLink></p></template>
</section></template>
<style scoped>
.goods-trend{display:flex;flex-direction:column;gap:10px}header{display:flex;align-items:center;justify-content:space-between}h3{margin:0;font-size:16px;line-height:24px;font-weight:600}p{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}svg{width:100%;height:auto;display:block}.grid{stroke:var(--w-line)}svg text{font:11px var(--w-font);fill:var(--w-text-3)}.day-picker{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--w-text-3)}input{flex:1;min-width:0;accent-color:var(--w-pri)}.day-values{display:flex;flex-wrap:wrap;gap:6px 16px}.day-values b{color:var(--w-text-1)}
</style>
