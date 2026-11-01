<script setup lang="ts">
definePageMeta({key:route=>route.path})
const route=useRoute(),{t}=useI18n(),{bizErrorMessage}=useBizError()
const pinnedVersion=ref<number|null>(null)
const data=ref<any>(null),loading=ref(false),error=ref(''),station=ref(''),endStation=ref(''),floorId=ref('')
let generation=0
const load=async(latest=false)=>{
 const seq=++generation;loading.value=true;error.value=''
 const params:Record<string,string|number>={}
 if(station.value)params.station_id=station.value
 if(endStation.value)params.end_station_id=endStation.value
 if(latest)pinnedVersion.value=null
 if(pinnedVersion.value)params.version=pinnedVersion.value
 const result=await httpRequest<any>(`/api/warehouse/picking/${route.params.id}/route-plan`,{params,onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 data.value=result;loading.value=false
 if(result){pinnedVersion.value=result.version;station.value=result.station_id||'';endStation.value=result.end_station_id||'';if(!result.layout?.floors.some((f:any)=>f.id===floorId.value))floorId.value=result.stations.find((s:any)=>s.id===result.station_id)?.floor_id||result.layout?.floors[0]?.id||''}
}
const floor=computed(()=>data.value?.layout?.floors.find((value:any)=>value.id===floorId.value))
const stops=computed<any[]>(()=>data.value?.stops||[])
const ordered=computed<any[]>(()=>data.value?.route?.legs.map((leg:any,index:number)=>({...stops.value.find(stop=>stop.id===leg.stop_id),leg,sequence:index+1}))||[])
const tableRows=computed(()=>{const visited=new Set(ordered.value.map(stop=>stop.id));return [...ordered.value,...stops.value.filter(stop=>!visited.has(stop.id)).map(stop=>({...stop,sequence:'\u2014',leg:null}))]})
const paths=computed(()=>{
 const lines:any[]=[]
 for(const leg of [...(data.value?.route?.legs||[]),data.value?.route?.returning].filter(Boolean)){
  for(let i=1;i<leg.path.length;i++){const a=leg.path[i-1],b=leg.path[i];if(a[0]===floorId.value&&b[0]===floorId.value)lines.push({x1:a[1],y1:a[2],x2:b[1],y2:b[2]})}
 }
 return lines
})
const markers=computed(()=>ordered.value.filter(stop=>stop.floor_id===floorId.value).map(stop=>({...stop,point:stop.leg.path.at(-1)})))
const totalQuantity=computed(()=>stops.value.reduce((sum,stop)=>sum+stop.items.reduce((value:number,row:any)=>value+row.quantity,0),0))
const size=computed(()=>Math.max(.25,Math.min(floor.value?.width||20,floor.value?.height||20)/65))
const colour=(kind:string)=>(({rack:'#EAE5FF',wall:'#89909C',station:'#DFF2E8',connector:'#FFF0D2',zone:'#F5F6F8',door:'#E8F1FF'} as Record<string,string>)[kind]||'#F5F6F8')
const columns=computed(()=>[{key:'sequence',label:t('pick-route.stop')},{key:'location',label:t('nav.location')},{key:'items',label:t('nav.goods'),wrap:true},{key:'distance',label:t('pick-route.leg-distance'),type:'qty' as const}])
onMounted(()=>load())
onBeforeUnmount(()=>generation++)
useHead({title:()=>`${t('pick-route.title')} · PICK-${route.params.id}`})
</script>
<template><div class="pick-route w-scope">
 <header><div><nav><NuxtLink :to="'/picking/detail/'+route.params.id">PICK-{{route.params.id}}</NuxtLink><span>/ {{t('pick-route.title')}}</span></nav><h1>{{t('pick-route.title')}}</h1><p v-if="data">{{data.warehouse_name}} · {{t('pick-route.version',{version:data.version??'—'})}}</p></div><div class="actions"><WButton :to="'/picking/detail/'+route.params.id">{{t('pick-route.back')}}</WButton><WButton :to="'/picking/print/'+route.params.id" icon="printer">{{t('pick-route.worksheet')}}</WButton><WButton :disabled="loading" @click="station='';endStation='';load(true)">{{t('pick-route.refresh')}}</WButton></div></header>
 <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load()">{{t('dn.list.retry')}}</WButton></template></WAlert>
 <WEmptyState v-if="loading" :title="t('common.status.loading')"/>
 <template v-else-if="data">
  <WAlert tone="info" :title="t(data.mode==='record'?'pick-route.record-hint':'pick-route.hint')"/>
  <WAlert v-if="data.issue" tone="warn" :title="t('pick-route.issues.'+data.issue)"/>
  <div v-if="data.stations.length" class="controls"><WField :label="t('pick-route.start')"><WSelect v-model="station" :options="data.stations.map((s:any)=>({value:s.id,label:s.floor_name+' · '+s.name}))" @update:model-value="load()"/></WField><WField :label="t('pick-route.end')"><WSelect v-model="endStation" :options="data.stations.map((s:any)=>({value:s.id,label:s.floor_name+' · '+s.name}))" @update:model-value="load()"/></WField><WField :label="t('pick-route.floor')"><WSelect v-model="floorId" :options="data.layout.floors.map((f:any)=>({value:f.id,label:f.name}))"/></WField></div>
  <WCard v-if="data.route" flush><div class="metrics"><div><small>{{t('pick-route.stop')}}</small><strong>{{ordered.length}} / {{stops.length}}</strong></div><div><small>{{t('common.fields.quantity')}}</small><strong>{{totalQuantity}}</strong></div><div><small>{{t('pick-route.distance')}}</small><strong>{{data.route.distance.toFixed(1)}} m</strong></div><div><small>{{t('pick-route.time')}}</small><strong>{{Math.ceil(data.route.seconds/60)}} min</strong></div><div><small>{{t('pick-route.transfers')}}</small><strong>{{data.route.transfers}}</strong></div></div></WCard>
  <p v-if="data.route?.code_order_distance!=null">{{t('pick-route.code-order')}}: {{data.route.code_order_distance.toFixed(1)}} m</p>
  <WCard v-if="floor" :title="floor.name" flush><div class="map-scroll"><svg :viewBox="`-1 -1 ${floor.width+2} ${floor.height+2}`" role="img" :aria-label="t('pick-route.map')+' · '+floor.name">
   <rect x="0" y="0" :width="floor.width" :height="floor.height" fill="white" stroke="#CDD1DA" :stroke-width="size/8"/>
   <g v-for="obj in floor.objects" :key="obj.id"><rect :x="obj.x" :y="obj.y" :width="obj.width" :height="obj.height" :fill="colour(obj.type)" stroke="#B4ADC9" :stroke-width="size/10"/><text :x="obj.x+obj.width/2" :y="obj.y+obj.height/2" :font-size="size" text-anchor="middle" dominant-baseline="middle">{{obj.name}}</text></g>
   <line v-for="(line,index) in paths" :key="index" v-bind="line" stroke="#7855FE" :stroke-width="size/3" stroke-linecap="round"/>
   <g v-for="stop in markers" :key="stop.id"><circle :cx="stop.point[1]" :cy="stop.point[2]" :r="size*.85" fill="#6D28D9" stroke="white" :stroke-width="size/6"/><text :x="stop.point[1]" :y="stop.point[2]" :font-size="size" fill="white" text-anchor="middle" dominant-baseline="middle">{{stop.sequence}}</text></g>
  </svg></div><p class="legend">{{t('pick-route.map-hint')}}</p></WCard>
  <WCard :title="t('pick-route.stops')" flush><WTable :columns="columns" :rows="tableRows" row-key="id" inset><template #cell-location="{row}"><b>{{row.location}}</b><small>{{row.floor_name}} · {{row.rack_name}}</small></template><template #cell-items="{row}"><div v-for="item in row.items" :key="item.goods_id+':'+item.lot_id" class="item"><span>{{item.code}} · {{item.goods}}<small>{{item.lot_no||t('packing-lots.unassigned')}}<template v-if="item.expiry_date"> · {{item.expiry_date}}</template></small></span><b>× {{item.quantity}}</b></div></template><template #cell-distance="{row}">{{row.leg?row.leg.distance.toFixed(1)+' m':'\u2014'}}<small v-if="row.leg?.transfers">{{t('pick-route.connector-time',{seconds:row.leg.connector_seconds})}}</small></template></WTable></WCard>
  <WAlert v-if="data.route?.unreachable.length" tone="warn" :title="t('pick-route.unreachable')"><p>{{stops.filter(stop=>data.route.unreachable.includes(stop.id)).map(stop=>stop.location).join(' · ')}}</p></WAlert>
  <WCard v-if="data.unmapped.length" :title="t('pick-route.unmapped')"><p v-for="(row,index) in data.unmapped" :key="index">{{row.location}} · {{row.code}} · {{row.lot_no||t('packing-lots.unassigned')}} × {{row.quantity}}</p></WCard>
  <WCard v-if="data.shortages.length" :title="t('pick-route.shortages')"><p v-for="row in data.shortages" :key="row.goods_id">{{row.code}} · {{row.goods}} × {{row.quantity}}</p></WCard>
 </template>
</div></template>
<style scoped>
.pick-route{display:flex;flex-direction:column;gap:20px;min-width:0}header{display:flex;align-items:start;justify-content:space-between;gap:16px;flex-wrap:wrap}nav,.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}nav,p,small{font-size:12px;line-height:18px;color:var(--w-text-3)}h1{font-size:24px;line-height:32px;margin:8px 0}p{margin:4px 0}a{color:var(--w-pri)}.controls{display:flex;gap:16px;flex-wrap:wrap}.controls>.w-field{min-width:200px}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:20px;padding:20px}.metrics strong{display:block;font-size:24px;margin-top:8px}.map-scroll{overflow:auto;padding:12px}.map-scroll svg{display:block;width:100%;min-width:560px;max-height:600px}.legend{padding:0 20px 16px}.item{display:flex;justify-content:space-between;gap:20px;margin:4px 0}.item>span{overflow-wrap:anywhere}small{display:block}.pick-route :deep(table){min-width:700px}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.controls>.w-field{min-width:0;flex:1 1 180px}}
</style>
