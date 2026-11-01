<script setup lang="ts">
const props = defineProps<{ warehouseId: number; filters: Record<string, any> }>()
const { t } = useI18n(), { bizErrorMessage } = useBizError(), staff = useStaffStore()
const layout = ref<any>(null), floorId = ref(''), selected = ref<any>(null), rows = ref<any[]>([])
const loading = ref(false), error = ref(''), published = ref(0)
const mapDisabled=ref(false),bindings=ref<Record<string,any>>({})
const bindingsLoaded=ref(false)
const layer=ref('matches'),health=ref<Record<number,any>>({}),healthReady=ref(false)
const shapeHealth=(shape:any)=>matches(shape).reduce((sum:Record<string,number>,row:any)=>{for(const key of ['quantity','expired','expiring','held','unknown_expiry'])sum[key]=(sum[key]||0)+Number(health.value[row.id]?.[key]||0);return sum},{})
const fill=(shape:any)=>{
 if(!matches(shape).length)return shape.type==='wall'?'#656C7A':'#F6F7FA'
 if(layer.value==='matches'||!healthReady.value)return '#DAD6FF'
 const count=shapeHealth(shape)
 if(layer.value==='expiry')return count.expired||count.held?'#F3B7BC':count.expiring?'#F8D993':count.unknown_expiry?'#D5D9E1':count.quantity?'#BFE2D1':'#F6F7FA'
 const max=maxQuantity.value
 return count.quantity?`hsl(259 75% ${94-44*count.quantity/max}%)`:'#F6F7FA'
}
let generation = 0
const floor = computed(() => layout.value?.floors?.find((item: any) => item.id === floorId.value))
const rowsById=computed(()=>new Map(rows.value.map(row=>[row.id,row])))
const rowsByRack=computed(()=>{const result=new Map<string,any[]>();for(const row of rows.value){const id=bindings.value[String(row.id)]?.rack_id;if(id){if(!result.has(id))result.set(id,[]);result.get(id)!.push(row)}}return result})
const matches = (shape: any):any[] => bindingsLoaded.value?(rowsByRack.value.get(shape.id)||[]):(shape.location_ids||[]).map((id:number)=>rowsById.value.get(id)).filter(Boolean)
const maxQuantity=computed(()=>Math.max(1,...(floor.value?.objects||[]).map((s:any)=>shapeHealth(s).quantity||0)))
const unbound = computed(() => rows.value.filter(row => bindingsLoaded.value?!bindings.value[String(row.id)]:!layout.value?.floors?.some((f: any) => f.objects.some((shape: any) => shape.location_ids?.includes(row.id)))))
const load = async () => {
  const seq = ++generation
  loading.value = true; error.value = ''; layout.value = null; rows.value = []; selected.value = null;health.value={};healthReady.value=false;mapDisabled.value=false;bindings.value={};bindingsLoaded.value=false
  const headers = warehouseHeaders(props.warehouseId)
  const fail = (e: any) => { if (seq === generation) error.value = bizErrorMessage(e) }
  const base = `/api/warehouse/warehouse/${props.warehouseId}/layout`
  const [state, locations, stock] = await Promise.all([
    httpRequest<any>(base, { headers, onError: fail }),
    httpRequest<PaginationData>('/api/warehouse/location/', { headers, params: { ...props.filters, warehouse_id: props.warehouseId, all: true }, onError: fail }),
    staff.hasPermission('inventory_read')?httpRequest<any>('/api/warehouse/inventory/location-health',{headers,onError:fail}):null,
  ])
  if (seq !== generation) return
  if(state?.operations?.map_enabled===false){mapDisabled.value=true;loading.value=false;return}
  rows.value = locations?.items || []; published.value = state?.published_version || 0
  if(stock){health.value=Object.fromEntries(stock.items.map((row:any)=>[row.location_id,row]));healthReady.value=true}
  if (published.value) {
    const version = await httpRequest<any>(`${base}/versions/${published.value}`, { headers, onError: fail })
    if (seq !== generation) return
    layout.value = version?.layout;bindings.value=version?.bindings||{};bindingsLoaded.value=!!version&&'bindings' in version
    if (!layout.value?.floors?.some((f: any) => f.id === floorId.value)) floorId.value = layout.value?.floors?.[0]?.id || ''
  }
  loading.value = false
}
watch(() => [props.warehouseId, props.filters], load, { immediate: true, deep: true })
onBeforeUnmount(() => generation++)
</script>
<template><section class="location-map">
  <WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
  <WEmptyState v-if="loading" :title="t('common.status.loading')"/>
  <template v-else-if="layout"><header><WSelect v-model="floorId" :options="layout.floors.map((f:any)=>({value:f.id,label:f.name}))" :aria-label="t('layout.floors')" @update:model-value="selected=null"/><WSelect v-if="staff.hasPermission('inventory_read')" v-model="layer" :disabled="!healthReady" :options="['matches','quantity','expiry'].map(value=>({value,label:t('location-map.layer-'+value)}))" :aria-label="t('location-map.layers')"/><span>{{t('layout.published',{n:published})}}</span><WButton v-if="staff.hasPermission('warehouse_read')" variant="text" :to="{path:'/warehouse/layout/'+warehouseId,query:{version:published,floor:floorId}}">{{t('layout.view-map')}}</WButton></header>
    <p v-if="layer==='matches'">{{t('location-map.help')}}</p><p v-if="layer!=='matches'">{{t('location-map.legend-'+layer)}}</p>
    <div v-if="floor" class="canvas"><svg :viewBox="`-1 -1 ${floor.width+2} ${floor.height+2}`" role="img" :aria-label="floor.name"><rect x="0" y="0" :width="floor.width" :height="floor.height" fill="white" stroke="#A0A4B0" stroke-width=".08"/><g v-for="shape in floor.objects" :key="shape.id" :tabindex="matches(shape).length?0:undefined" :role="matches(shape).length?'button':undefined" :aria-label="shape.name" :class="{matched:matches(shape).length,selected:selected?.id===shape.id}" @click="selected=shape" @keydown.enter.prevent="selected=shape" @keydown.space.prevent="selected=shape"><rect :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" :fill="fill(shape)" stroke="#A0A4B0" stroke-width=".05"/><text :style="{fill:layer==='quantity'&&healthReady&&(shapeHealth(shape).quantity||0)/maxQuantity>0.55?'#fff':'#151923'}" :x="shape.x+shape.width/2" :y="shape.y+shape.height/2" font-size=".28" text-anchor="middle" dominant-baseline="middle">{{shape.name}}</text></g></svg></div>
    <div v-if="selected" class="locations"><strong>{{selected.name}}</strong><NuxtLink v-for="row in matches(selected)" :key="row.id" :to="'/location/detail/'+row.id">{{row.code}}<span v-if="healthReady"> &middot; {{health[row.id]?.quantity||0}}<template v-if="layer==='expiry'"> &middot; {{t('location-map.expired')}} {{health[row.id]?.expired||0}} &middot; {{t('location-map.held')}} {{health[row.id]?.held||0}} &middot; {{t('location-map.expiring')}} {{health[row.id]?.expiring||0}} &middot; {{t('location-map.unknown')}} {{health[row.id]?.unknown_expiry||0}}</template></span></NuxtLink><span v-if="!matches(selected).length">{{t('location-map.no-match')}}</span></div>
    <details v-if="unbound.length"><summary>{{t('location-map.unbound',{n:unbound.length})}}</summary><div class="locations"><NuxtLink v-for="row in unbound" :key="row.id" :to="'/location/detail/'+row.id">{{row.code}}</NuxtLink></div></details>
  </template>
  <WEmptyState v-else-if="!error" :title="t(mapDisabled?'warehouse-operations.map-disabled':'location-map.no-published')"/>
</section></template>
<style scoped>
.location-map{padding:20px;display:flex;flex-direction:column;gap:16px}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}header>.w-select{width:180px}header>span,p,summary{font-size:12px;line-height:20px;color:var(--w-text-3);margin:0}.canvas{overflow:auto;border:1px solid var(--w-border);border-radius:6px;max-height:620px}.canvas svg{display:block;width:100%;min-width:520px;max-height:600px}.canvas text{pointer-events:none;fill:#151923}.matched{cursor:pointer}.selected rect,.matched:focus rect{stroke:#5F1FE6;stroke-width:.15}.locations{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;font-size:13px}.locations a{color:var(--w-link);text-decoration:none}.locations>strong{width:100%}details .locations{padding-top:12px}@media(max-width:600px){.location-map{padding:16px}}
</style>
