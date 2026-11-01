<script setup lang="ts">
const props=defineProps<{warehouseId:number;filters?:Record<string,any>}>()
const {t,locale}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),page=ref(1)
const zone=ref<string|undefined>()
watch(zone,()=>{if(page.value!==1)page.value=1;else load()})
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';data.value=null
 const result=await httpRequest<any>('/api/warehouse/inventory/by-location',{headers:warehouseHeaders(props.warehouseId),params:{...props.filters,zone:zone.value,group_by:'shelf',shelf_levels:2,location_type:'standard',page:page.value,per_page:40},onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){data.value=result;loading.value=false}
}
watch(()=>props.warehouseId,()=>{if(page.value!==1)page.value=1;else load()})
watch(page,load);onMounted(load);onBeforeUnmount(()=>generation++)
const number=(value:any)=>value==null?'—':Number(value).toLocaleString(locale.value,{maximumFractionDigits:3})
const percent=(value:any)=>value==null?'—':Number(value).toLocaleString(locale.value,{style:'percent',maximumFractionDigits:1})
const colours=['#F5F4FF','#E9E5FF','#C9BFFD','#9B8AFB','#7855FE','#4E1DBC']
const colour=(rate:number)=>colours[Math.min(5,Math.max(0,Math.ceil(rate*5)))]
</script>
<template><WCard><section class="capacity"><header><h2>{{t('capacity.title')}}</h2><span v-if="data">{{t('capacity.occupied',{occupied:data.summary.occupied_count,total:data.summary.location_count,rate:percent(data.summary.occupancy_rate)})}}</span></header><StockMetadataFilter analysis dimension="zone" :warehouse-id="warehouseId" :filters="{zone}" @change="value=>{zone=value.zone}"/><p>{{t('inventory-analysis.zone-scope')}}</p><p>{{t('capacity.help')}}</p><p v-if="Object.keys(filters||{}).length">{{t('inventory-analysis.filtered-capacity')}}</p><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><WEmptyState v-else-if="loading" compact :title="t('common.status.loading')"/><template v-else-if="data"><p>{{t('capacity.volume',{count:data.summary.sized_location_count,capacity:number(data.summary.capacity_m3),used:number(data.summary.used_volume_m3),rate:percent(data.summary.volume_utilization)})}}</p><WAlert v-if="data.summary.volume_unknown_quantity" tone="warn" :title="t('capacity.unknown',{quantity:data.summary.volume_unknown_quantity})"/><div v-if="data.items.length" class="shelves"><NuxtLink v-for="row in data.items" :key="row.shelf" :to="{path:'/inventory/by-location',query:{...props.filters,zone,shelf:row.shelf,shelf_levels:2,location_type:'standard'}}" :style="{background:colour(row.occupancy_rate),color:row.occupancy_rate>0.6?'#fff':'#151923'}"><strong>{{row.shelf}}</strong><span>{{t('capacity.occupied',{occupied:row.occupied_count,total:row.location_count,rate:percent(row.occupancy_rate)})}}</span><span>{{t('capacity.goods',{count:row.goods_count,quantity:row.quantity})}}</span><span>{{t('capacity.utilization',{rate:percent(row.volume_utilization)})}}</span><span v-if="row.volume_unknown_quantity">{{t('capacity.unknown-short',{quantity:row.volume_unknown_quantity})}}</span></NuxtLink></div><WEmptyState v-else compact :title="t('common.status.nothing-show')"/><footer v-if="data.total>40"><WPagination :page="page" :page-size="40" :total="data.total" show-total @update:page="page=$event"/></footer></template></section></WCard></template>
<style scoped>
.capacity{display:flex;flex-direction:column;gap:12px}header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}h2{margin:0;font-size:16px;font-weight:600;line-height:24px}p,header>span{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}.shelves{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}.shelves>a{display:flex;flex-direction:column;gap:4px;padding:12px;border-radius:6px;text-decoration:none;overflow-wrap:anywhere;font-size:12px;line-height:18px}.shelves strong{font-size:14px;line-height:20px;font-weight:600}.shelves>a:focus-visible{outline:2px solid var(--w-text-1);outline-offset:3px}.shelves>a:hover{text-decoration:underline}
</style>
