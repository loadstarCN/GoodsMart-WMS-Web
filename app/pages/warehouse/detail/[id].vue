<script setup lang="ts">
import WarehousePlans from '~/components/warehouse/WarehousePlans.vue'
const {t}=useI18n(),route=useRoute(),staff=useStaffStore(),warehouseStore=useWarehouseStore(),router=useRouter(),{bizErrorMessage}=useBizError()
const record=ref<any>(null),locations=ref<any>(null),people=ref<PaginationData|null>(null),overview=ref<any>(null),error=ref(''),loading=ref(true)
let generation=0
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';record.value=null;locations.value=null;people.value=null;overview.value=null
 const id=Number(route.params.id)
 const result=await httpRequest<any>('/api/warehouse/warehouse/'+id,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
 if(seq!==generation)return
 record.value=result;loading.value=false
 if(!result)return
 const values=await Promise.all([
  httpRequest<any>('/api/warehouse/warehouse/'+id+'/overview'),
  staff.hasPermission('location_read')?httpRequest<PaginationData>('/api/warehouse/warehouse/'+id+'/zones'):null,
  staff.hasPermission('staff_read')?httpRequest<PaginationData>('/api/warehouse/staff/',{params:{warehouse_id:id,per_page:6}}):null,
 ])
 if(seq===generation){overview.value=values[0];locations.value=values[1];people.value=values[2]}
}
watch(()=>route.params.id,load);onMounted(load);onBeforeUnmount(()=>generation++)
useHead({title:()=>record.value?.name||t('nav.warehouse')})
const {locationTypeLabel}=useOptionLabel()
const locationColumns=computed(()=>[{key:'code',label:t('warehouse.ui.zone')},{key:'location_types',label:t('location.fields.location-type')},{key:'locations',label:t('nav.location'),type:'qty' as const,keepZero:true},...(staff.hasPermission('inventory_read')?[{key:'empty',label:t('warehouse.ui.empty-locations'),type:'qty' as const},{key:'volume_utilization',label:t('location.ui.utilization')}]:[])])
const activeTab=computed(()=>route.query.view==='plans'?'plans':'overview')
const staffColumns=computed(()=>[{key:'user_name',label:t('common.fields.name')},{key:'position',label:t('warehouse.ui.position')},{key:'phone',label:t('common.fields.phone')},{key:'email',label:t('common.fields.email')}])
const emptyLocations=computed(()=>locations.value?.items.reduce((n:number,row:any)=>n+Number(row.empty||0),0)||0)
const openList=(path:string,query:Record<string,any>={})=>{warehouseStore.selectWarehouse(record.value);router.push({path,query})}
</script>
<template>
 <div class="w-warehouse-detail w-scope"><nav><NuxtLink class="w-warehouse-back" to="/warehouse">{{t('nav.warehouse')}}</NuxtLink><span>/</span><span>{{record?.name}}</span></nav><WAlert v-if="error" tone="block" :title="error" /><WEmptyState v-if="loading" :title="t('common.status.loading')" />
 <template v-if="record"><header><div><h1>{{record.name}}</h1><WStatus muted :tone="record.is_active?'ok':'none'">{{t(record.is_active?'recipient.ui.enabled':'recipient.ui.disabled')}}</WStatus></div><div class="header-actions"><WButton :to="'/warehouse/layout/'+record.id">{{t('layout.title')}}</WButton><WButton v-if="staff.hasPermission('warehouse_edit')" :to="'/warehouse/edit/'+record.id">{{t('button.edit')}}</WButton></div></header><div class="warehouse-subtitle"><span>{{record.timezone}} · {{record.default_currency}}</span><span>{{record.address}}</span><span v-if="record.manager?.user_name">{{t('common.users.manager')}} {{record.manager.user_name}}</span><span v-if="record.phone">{{record.phone}}</span></div>
 <WTabs :model-value="activeTab" :label="t('warehouse.ui.overview')" :items="[{key:'overview',label:t('warehouse.ui.overview')},{key:'plans',label:t('layout.title')}]" @change="value=>router.push({query:{...route.query,view:value}})"/><WarehousePlans v-if="activeTab==='plans'" :warehouse-id="record.id"/>
 <div v-else class="w-warehouse-detail__layout"><div class="w-warehouse-detail__main">
 <WCard v-if="overview" flush><div class="w-warehouse-metrics"><div v-for="metric in [{key:'locations',label:t('nav.location')},{key:'onhand',label:t('goods.ui.onhand')},{key:'dispatch_today',label:t('warehouse.ui.dispatch-today')},{key:'receive_today',label:t('warehouse.ui.receive-today')}]" v-show="overview[metric.key]!==undefined" :key="metric.key"><span>{{metric.label}}</span><strong>{{Number(overview[metric.key]).toLocaleString()}}</strong><small v-if="metric.key==='locations'&&staff.hasPermission('inventory_read')">{{t('warehouse.ui.empty-locations')}} {{emptyLocations}}</small><small v-else-if="metric.key==='onhand'">{{t('warehouse.ui.goods-count',{count:overview.goods_count})}}</small></div></div></WCard>
 <WCard v-if="locations" flush><div class="w-warehouse-section"><h2>{{t('warehouse.ui.zones')}} <small>{{t('warehouse.ui.zone-summary',{zones:locations.total,locations:locations.locations})}}</small></h2><WButton variant="text" size="sm" @click="openList('/location')">{{t('common.status.all')}} →</WButton></div><WTable :columns="locationColumns" :rows="locations.items" inset><template #cell-code="{row}"><button class="w-zone-link" @click="openList('/location',{code:row.code})">{{row.code}}</button><small class="zone-range">{{row.first_code}}<template v-if="row.last_code!==row.first_code"> ~ {{row.last_code}}</template></small></template><template #cell-location_types="{row}">{{row.location_types.map(locationTypeLabel).join(' · ')}}</template><template #cell-volume_utilization="{row}"><div v-if="row.volume_utilization!=null" class="zone-volume" :class="{warning:row.volume_utilization>=.9}"><progress :value="row.volume_utilization" max="1"/><span>{{row.volume_unknown_quantity?'≥ ':''}}{{Math.round(row.volume_utilization*100)}}%</span><small v-if="row.volume_utilization>=.9">{{t('warehouse.ui.nearly-full')}}</small></div><span v-else>—</span></template></WTable></WCard>
 <WCard v-if="people" flush><div class="w-warehouse-section"><h2>{{t('nav.staff')}} <small>{{people.total}}</small></h2><WButton variant="text" size="sm" :to="{path:'/staff',query:{warehouse_id:record.id}}">{{t('common.status.all')}} →</WButton></div><ul class="warehouse-staff"><li v-for="person in people.items" :key="person.id"><span class="staff-avatar"><img v-if="person.avatar" :src="person.avatar" alt=""/><span v-else>{{person.user_name.slice(0,1)}}</span></span><div><NuxtLink class="w-warehouse-record" :to="'/staff/detail/'+person.id">{{person.user_name}}</NuxtLink><small>{{[person.position||person.roles?.join(' / '),person.department?.name].filter(Boolean).join(' · ')}}</small></div><span v-if="record.manager?.id===person.id" class="manager-tag">{{t('common.users.manager')}}</span></li></ul><div class="staff-footer"><NuxtLink class="w-staff-all" :to="{path:'/staff',query:{warehouse_id:record.id}}">{{t('warehouse.ui.all-staff',{count:people.total})}}</NuxtLink></div></WCard>
 </div><aside>
 <WCard><h3>{{t('warehouse.fields.timezone')}}</h3><p class="warehouse-timezone">{{isValidTimeZone(record.timezone)?timeZoneDescription(record.timezone):'—'}}</p><small v-if="!record.timezone_configured">{{t('timezone.default')}}</small><dl><dt>{{t('warehouse.ui.business-date')}}</dt><dd>{{overview?.date}}</dd></dl></WCard>
 <WCard><h3>{{t('warehouse.ui.pickup-contact')}}</h3><dl><dt>{{t('warehouse.fields.contact-name-en')}}</dt><dd>{{record.contact_name_en||'—'}}</dd><dt>{{t('common.fields.phone')}}</dt><dd>{{record.phone||'—'}}</dd></dl></WCard>
 <WCard><h3>{{t('common.fields.address')}}</h3><StructuredAddressView :address="record" country-key="country_code" :legacy="record.address" :legacy-latin="record.address_en" /></WCard>
 <WCard><h3>{{t('warehouse.ui.information')}}</h3><dl><dt>{{t('common.users.manager')}}</dt><dd>{{record.manager?.user_name||'—'}}</dd><dt>{{t('warehouse.ui.currency')}}</dt><dd>{{record.default_currency}}</dd><dt>{{t('common.dates.created')}}</dt><dd>{{$dayjs(record.created_at,'YYYY/MM/DD HH:mm',record)}}</dd><dt>{{t('common.dates.updated')}}</dt><dd>{{$dayjs(record.updated_at,'YYYY/MM/DD HH:mm',record)}}</dd></dl></WCard>
 </aside></div></template></div>
</template>
<style scoped>
.w-warehouse-detail { display:flex;flex-direction:column;gap:16px; }
.w-warehouse-detail nav { display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2); }
.w-warehouse-back { color:var(--w-text-3); }
.w-warehouse-detail header { display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:-8px; }
.w-warehouse-detail header>div { display:flex;align-items:center;gap:12px; }
.w-warehouse-detail h1 { margin:0;font-size:24px;line-height:32px;font-weight:600; }
.w-warehouse-detail__layout { display:flex;flex-wrap:wrap;gap:16px; }
.w-warehouse-detail__main { flex:999 1 600px;min-width:0;display:flex;flex-direction:column;gap:16px; }
.w-warehouse-detail aside { flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px; }
.w-warehouse-detail aside :deep(.w-card__body) { padding:16px 20px 20px;display:flex;flex-direction:column;gap:10px; }
.w-warehouse-detail h3 { margin:0;font-size:14px;line-height:22px;font-weight:600; }
.w-warehouse-detail p { margin:0;font-size:13px;line-height:20px; }
.w-warehouse-detail small { font-size:12px;color:var(--w-text-3); }
.w-warehouse-detail dl { margin:0;display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px 12px;font-size:13px;line-height:20px; }
.w-warehouse-detail dt { color:var(--w-text-3);font-weight:400; }.w-warehouse-detail dd { margin:0;overflow-wrap:anywhere; }
.w-warehouse-section { display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--w-line); }
.w-warehouse-section h2 { margin:0;font-size:16px;line-height:24px;font-weight:600; }
.w-warehouse-section small { font-size:13px;font-weight:400; }
.w-warehouse-metrics { display:grid;grid-template-columns:repeat(4,minmax(0,1fr)); }
.w-warehouse-metrics>div { padding:16px 24px;display:flex;flex-direction:column;gap:4px; }
.w-warehouse-metrics>div+div { border-left:1px solid var(--w-line); }.w-warehouse-metrics span { font-size:12px;color:var(--w-text-2); }.w-warehouse-metrics strong { font-size:24px;line-height:32px;font-weight:600; }
.w-warehouse-detail :deep(.w-table) { min-width:540px;border-collapse:collapse; }.w-warehouse-detail :deep(.w-table thead th) { height:auto;padding-top:10px;padding-bottom:8px;line-height:18px; }.w-warehouse-detail :deep(.w-table tbody td) { padding-top:12px;padding-bottom:12px; }.w-warehouse-record { color:var(--w-text-1);font-weight:500; }
@media(max-width:600px){.w-warehouse-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.w-warehouse-metrics>div:nth-child(3){border-left:0}}
.zone-range{display:block;font-size:12px;line-height:18px;margin-top:2px}.w-zone-link{padding:0;border:0;background:none;font:inherit;font-size:14px;font-weight:600;line-height:22px;color:var(--w-text-1);cursor:pointer}.w-zone-link:hover{color:#5F1FE6}.zone-volume{display:flex;gap:10px;align-items:center;font-size:13px;font-variant-numeric:tabular-nums}.zone-volume progress{width:84px;height:6px;appearance:none;border:0;border-radius:6px;overflow:hidden;background:#EDEFF3}.zone-volume progress::-webkit-progress-bar{background:#EDEFF3}.zone-volume progress::-webkit-progress-value{background:#7855FE;border-radius:6px}.zone-volume.warning progress::-webkit-progress-value{background:#E99B1A}.zone-volume small{border:1px solid #F0D5AA;border-radius:4px;padding:1px 5px;color:#92500B;white-space:nowrap}.header-actions{margin-left:auto}.w-warehouse-detail :deep(.w-card__actions){margin-left:auto}
.warehouse-subtitle{display:flex;gap:8px 20px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--w-text-3);margin-top:-8px}.warehouse-staff{list-style:none;margin:0;padding:16px 24px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px}.warehouse-staff li{display:flex;align-items:center;gap:10px;min-width:0;font-size:13px;line-height:20px}.staff-avatar{width:32px;height:32px;flex:none;border-radius:50%;background:#EDEFF3;color:#4C5261;display:grid;place-items:center;font-size:13px;font-weight:600;overflow:hidden}.staff-avatar img{width:100%;height:100%;object-fit:cover}.warehouse-staff li>div{min-width:0}.warehouse-staff small{display:block;line-height:18px;overflow-wrap:anywhere}.manager-tag{padding:1px 6px;border:1px solid var(--w-border);border-radius:6px;font-size:12px;line-height:16px;white-space:nowrap}.staff-footer{padding:0 24px 16px;font-size:13px;line-height:20px}.w-staff-all{color:#5F1FE6;text-decoration:none;font-weight:500}.w-warehouse-detail .warehouse-timezone{font-size:20px;line-height:28px;font-weight:600}.w-warehouse-metrics small{font-size:12px;line-height:18px;color:var(--w-text-3)}@media(max-width:600px){.warehouse-staff{grid-template-columns:1fr}}
</style>
