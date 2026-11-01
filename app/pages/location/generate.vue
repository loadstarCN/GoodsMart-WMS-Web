<script setup lang="ts">
const {t}=useI18n(),staff=useStaffStore(),warehouse=useWarehouseStore(),router=useRouter(),{bizErrorMessage}=useBizError()
const {locationTypeLabel}=useOptionLabel()
const ready=ref(false),loading=ref(true),busy=ref(false),error=ref(''),result=ref<any>(null),printLabels=ref(true)
const draft=ref<Record<string,any>>({zone:'',rack_from:1,rack_to:10,level_from:1,level_to:5,rack_digits:2,location_type:'standard',description:''})
const baseline=ref(JSON.stringify(draft.value))
const allowed=computed(()=>ready.value&&staff.hasPermission('location_edit'))
const body=computed(()=>({...draft.value,warehouse_id:warehouse.currentWarehouse?.id}))
let generation=0
const load=async()=>{const seq=++generation;loading.value=true;ready.value=false;error.value='';const current=await staff.getCurrentStaffInfo();if(seq!==generation)return;if(current){warehouse.syncWarehouses();ready.value=true}else error.value=t('common.validation.company-required');loading.value=false}
const run=async(execute=false)=>{
 if(busy.value||!allowed.value||!body.value.warehouse_id||execute&&(!result.value||!result.value.pending))return
 busy.value=true;error.value='';if(!execute)result.value=null
 const seq=generation,key=JSON.stringify(body.value),requestBody={...body.value,execute}
 const data=await httpRequest<any>('/api/warehouse/location/generate',{method:'POST',headers:warehouseHeaders(requestBody.warehouse_id),body:requestBody,onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 busy.value=false
 if(seq!==generation||key!==JSON.stringify(body.value))return
 if(data){result.value=data;if(execute){baseline.value=JSON.stringify(draft.value);showToast(t('action-results.success'),'success');const ids=data.items.filter((row:any)=>!row.existing&&row.id).map((row:any)=>row.id);if(printLabels.value&&staff.hasPermission('location_read')&&ids.length&&ids.length<=100)router.push({path:'/location/label/'+ids[0],query:{ids:ids.join(',')}})}}
}
watch(body,()=>{result.value=null},{deep:true})
useUnsavedForm(()=>allowed.value&&JSON.stringify(draft.value)!==baseline.value,()=>busy.value)
onMounted(load);onBeforeUnmount(()=>generation++)
useHead({title:()=>t('location-generate.title')})
const labelBatches=computed(()=>{const ids=(result.value?.items||[]).filter((row:any)=>!row.existing&&row.id).map((row:any)=>row.id);return Array.from({length:Math.ceil(ids.length/100)},(_,index)=>({ids:ids.slice(index*100,index*100+100),start:index*100+1,end:Math.min(ids.length,index*100+100)}))})
const columns=computed(()=>[{key:'code',label:t('location.fields.code')},{key:'rack_level',label:t('warehouse-operations.rack_level')},{key:'existing',label:t('common.fields.status')}])
</script>
<template><div class="generate-locations w-scope">
 <header><div><NuxtLink to="/location">{{t('nav.location')}}</NuxtLink><h1>{{t('location-generate.title')}}</h1></div><WButton to="/location/add">{{t('location-generate.single')}}</WButton></header>
 <WAlert v-if="error" tone="block" :title="error"><template v-if="!ready" #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
 <WEmptyState v-if="loading" :title="t('common.status.loading')"/>
 <WEmptyState v-else-if="!allowed" :title="t('location-generate.denied')"/>
 <WEmptyState v-else-if="!warehouse.currentWarehouse" :title="t('common.validation.warehouse-required')"/>
 <WCard v-else flush><form @submit.prevent="run(false)"><fieldset :disabled="busy">
  <WFormSection :title="warehouse.currentWarehouse.name"><p>{{t('location-generate.help')}}</p><WFormGrid>
   <WField :label="t('location-generate.zone')" :span="6"><WInput v-model="draft.zone" maxlength="20"/></WField>
   <WField :label="t('location.fields.location-type')" :span="6"><WSelect v-model="draft.location_type" :options="['standard','damaged','return'].map(value=>({value,label:locationTypeLabel(value)}))"/></WField>
   <WField v-for="key in ['rack_from','rack_to','level_from','level_to','rack_digits']" :key="key" :label="t('location-generate.'+key)" :span="4"><WInput v-model.number="draft[key]" type="number" min="1" :max="key==='rack_digits'?6:2147483647" step="1" required/></WField>
   <WField :label="t('common.fields.description')"><WInput v-model="draft.description" maxlength="255"/></WField>
  </WFormGrid></WFormSection>
  <footer><WButton type="submit" :loading="busy">{{t('location-generate.preview')}}</WButton></footer>
 </fieldset></form>
 <template v-if="result"><footer v-if="result.created&&staff.hasPermission('location_read')"><WButton v-for="batch in labelBatches" :key="batch.start" :to="{path:'/location/label/'+batch.ids[0],query:{ids:batch.ids.join(',')}}">{{t('location-generate.label-batch',{start:batch.start,end:batch.end})}}</WButton></footer><p class="result-summary">{{t('location-generate.summary',{total:result.total,existing:result.existing,pending:result.pending,created:result.created})}}</p><WTable :rows="result.items" :columns="columns" row-key="code" max-height="400px"><template #cell-existing="{row}">{{t(row.existing?'location-generate.existing':result.created?'location-generate.created':'location-generate.new')}}</template></WTable><footer><WCheckbox v-if="staff.hasPermission('location_read')" v-model="printLabels" :disabled="busy">{{t('location-generate.labels')}}</WCheckbox><WButton variant="primary" :loading="busy" :disabled="!result.pending" @click="run(true)">{{t('location-generate.create',{n:result.pending})}}</WButton></footer></template>
 </WCard>
</div></template>
<style scoped>.generate-locations{display:flex;flex-direction:column;gap:20px}header,footer{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}h1{margin:8px 0 0;font-size:24px;line-height:32px}header a{font-size:13px;color:var(--w-text-3)}fieldset{border:0;padding:0;margin:0;min-width:0}footer{padding:16px 24px;border-top:1px solid var(--w-border)}p{font-size:13px;color:var(--w-text-3);line-height:20px}.result-summary{padding:0 24px}</style>
