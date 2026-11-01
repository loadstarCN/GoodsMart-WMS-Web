<script setup lang="ts">
const props=defineProps<{warehouseId:number;locationId:number}>()
const {t}=useI18n(),staff=useStaffStore(),{bizErrorMessage}=useBizError()
const floor=ref<any>(null),rack=ref<any>(null),publishedVersion=ref<number|null>(null),error=ref(''),loading=ref(false)
let generation=0
const load=async()=>{
 const seq=++generation;floor.value=null;rack.value=null;publishedVersion.value=null;error.value=''
 if(!staff.refreshed||!staff.staffInfo||!staff.hasPermission('warehouse_read'))return
 loading.value=true
 const base='/api/warehouse/warehouse/'+props.warehouseId+'/layout',headers=warehouseHeaders(props.warehouseId)
 const onError=(e:any)=>{if(seq===generation)error.value=bizErrorMessage(e)}
 const state=await httpRequest<any>(base,{headers,onError})
 if(seq!==generation)return
 if(!state?.published_version||state.operations?.map_enabled===false){loading.value=false;return}
 const version=await httpRequest<any>(base+'/versions/'+state.published_version,{headers,onError})
 if(seq!==generation)return
 const binding=version?.bindings?.[String(props.locationId)]
 for(const item of version?.layout?.floors||[]){
  const found=item.objects.find((shape:any)=>version&&'bindings' in version?shape.id===binding?.rack_id:shape.location_ids?.includes(props.locationId))
  if(found){floor.value=item;rack.value=found;publishedVersion.value=state.published_version;break}
 }
 loading.value=false
}
watch(()=>[props.warehouseId,props.locationId,staff.refreshed],load,{immediate:true})
onBeforeUnmount(()=>generation++)
</script>
<template><WAlert v-if="error" tone="warn" :title="error"><template #actions><WButton :disabled="loading" @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><div v-if="floor" class="w-location-map-preview"><NuxtLink class="w-preview-link" :to="{path:'/warehouse/layout/'+warehouseId,query:{version:publishedVersion,floor:floor.id}}">{{t('layout.view-map')}} →</NuxtLink><svg :viewBox="`-1 -1 ${floor.width+2} ${floor.height+2}`" role="img" :aria-label="floor.name+' · '+rack.name"><rect x="0" y="0" :width="floor.width" :height="floor.height" fill="#fff" stroke="#A0A4B0" stroke-width=".1"/><g v-for="shape in floor.objects" :key="shape.id"><rect :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" :fill="shape.id===rack.id?'#7C4DFF':shape.type==='wall'?'#656C7A':shape.type==='zone'?'#F6F7FA':'#EDEFF3'" :stroke="shape.id===rack.id?'#5F1FE6':'#A0A4B0'" stroke-width=".05"/></g><circle :cx="rack.x+rack.width/2" :cy="Math.max(.4,rack.y-.6)" r=".35" fill="#5F1FE6"/><text :x="rack.x+rack.width/2+.6" :y="Math.max(.5,rack.y-.5)" font-size=".5" fill="#151923" font-weight="600">{{rack.name}}</text></svg><dl><dt>{{t('layout.floors')}}</dt><dd>{{floor.name}}</dd><dt>{{t('layout.kind.rack')}}</dt><dd>{{rack.name}}</dd></dl></div></template>
<style scoped>
.w-location-map-preview{display:flex;flex-direction:column;gap:10px}.w-preview-link{align-self:flex-end;color:#5F1FE6;text-decoration:none;font-size:12px;line-height:18px;font-weight:500;margin-top:-30px;margin-bottom:2px}.w-location-map-preview svg{display:block;width:100%;height:auto;max-height:220px;border:1px solid #EDEFF3;border-radius:4px;background:#FAFBFD}.w-location-map-preview dl{display:grid;grid-template-columns:84px minmax(0,1fr);gap:6px 12px;margin:0;font-size:12px;line-height:18px}.w-location-map-preview dt{color:#656C7A;font-weight:400}.w-location-map-preview dd{margin:0;color:#151923}
</style>
