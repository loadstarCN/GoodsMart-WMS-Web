<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill'
import 'quill/dist/quill.snow.css'
const props=defineProps<{locationId?:string}>()
const {t}=useI18n(),router=useRouter(),staff=useStaffStore(),warehouses=useWarehouseStore(),{bizErrorMessage}=useBizError(),{locationTypeLabel}=useOptionLabel()
const editing=computed(()=>!!props.locationId),canEdit=computed(()=>staff.hasPermission('location_edit'))
const record=ref<Record<string,any>>({code:'',location_type:'standard',warehouse_id:warehouses.currentWarehouse?.id||null,description:'',width:null,depth:null,height:null,capacity:null})
const loading=ref(false),busy=ref(false),error=ref(''),errors=ref<Record<string,string>>({})
const title=computed(()=>t(editing.value?'location.operations.edit':'location.ui.create'))
const fields=['code','location_type','warehouse_id','description','width','depth','height','capacity']
const dimensions=['width','depth','height','capacity']
let original='',generation=0
const payload=()=>Object.fromEntries(fields.map(key=>[key,dimensions.includes(key)?toNullableNumber(record.value[key]):record.value[key]]))
const dirty=computed(()=>JSON.stringify(payload())!==original)
const warehouseOptions=computed(()=>warehouses.warehouses.map(w=>({value:w.id,label:w.name})))
useHead({title})
const load=async()=>{
 const seq=++generation
 await warehouses.fetchWarehouses()
 if(!editing.value){if(!record.value.warehouse_id&&warehouseOptions.value.length===1)record.value.warehouse_id=warehouseOptions.value[0]?.value;original=JSON.stringify(payload());return}
 loading.value=true
 const data=await httpRequest<any>('/api/warehouse/location/'+props.locationId,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
 if(seq!==generation)return
 if(data){record.value=data;original=JSON.stringify(payload())}
 loading.value=false
}
onMounted(load);watch(()=>props.locationId,load);onBeforeUnmount(()=>generation++)
const save=async()=>{
 if(busy.value||!canEdit.value)return
 errors.value={};error.value=''
 if(!String(record.value.code||'').trim())errors.value.code=t('location.validation.code-required')
 if(!record.value.warehouse_id)errors.value.warehouse=t('location.validation.warehouse-required')
 for(const key of dimensions){const value=toNullableNumber(record.value[key]);if(value!==null&&(!Number.isFinite(value)||value<=0))errors.value[key]=t('location.ui.positive')}
 if(Object.keys(errors.value).length)return
 busy.value=true
 try{
  const previous=original?JSON.parse(original):{}
  const body=editing.value?Object.fromEntries(Object.entries(payload()).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous[key]))):payload()
  if(!Object.keys(body).length)return
  let success=false
  await httpRequest('/api/warehouse/location/'+(props.locationId||''),{method:editing.value?'PUT':'POST',headers:warehouseHeaders(record.value.warehouse_id),body,onSuccess:()=>{success=true},onError:err=>{error.value=bizErrorMessage(err)}})
  if(success){original=JSON.stringify(payload());showToast(t('action-results.success'),'success');await router.push('/location')}
 }finally{busy.value=false}
}
</script>
<template>
 <div class="w-location-form w-scope"><header><nav><NuxtLink class="w-location-back" to="/location">{{t('nav.location')}}</NuxtLink><span>/</span><span>{{title}}</span></nav><h1>{{title}}</h1></header><WAlert v-if="error" tone="block" :title="error" /><WEmptyState v-if="loading" :title="t('common.status.loading')" />
 <WCard v-else-if="!editing||record.id" flush><form @submit.prevent="save">
 <WFormSection :title="t('location.ui.position')"><WFormGrid><WField :label="t('common.entities.warehouse')" :span="4" :error="errors.warehouse"><WCombobox v-model="record.warehouse_id" :options="warehouseOptions" :selected-label="record.warehouse?.name||record.warehouse_name" :disabled="editing||busy||!canEdit||warehouseOptions.length===1" /></WField><WField :label="t('location.fields.code')" :span="8" :error="errors.code"><WInput v-model="record.code" maxlength="50" :disabled="busy||!canEdit" /></WField></WFormGrid></WFormSection>
 <WFormSection :title="t('location.fields.location-type')"><div class="w-location-types"><label v-for="type in ['standard','damaged','return']" :key="type" :class="{'is-selected':record.location_type===type}"><input v-model="record.location_type" type="radio" :value="type" :disabled="busy||!canEdit" />{{locationTypeLabel(type)}}</label></div></WFormSection>
 <WFormSection :title="t('location.ui.dimensions')"><WFormGrid><WField v-for="key in dimensions" :key="key" :label="t('location.fields.'+key)" optional :span="3" :error="errors[key]"><WInput v-model="record[key]" type="number" min="0.000001" step="any" :disabled="busy||!canEdit"><template #suffix>{{key==='capacity'?'m³':'cm'}}</template></WInput></WField></WFormGrid></WFormSection>
 <WFormSection :title="t('common.fields.description')"><div class="w-location-editor"><QuillEditor v-model:content="record.description" content-type="html" toolbar="minimal" :read-only="busy||!canEdit" /></div></WFormSection>
 <footer><span v-if="dirty">{{t('recipient.ui.unsaved')}}</span><WButton to="/location" :disabled="busy">{{t('button.cancel')}}</WButton><WButton v-if="canEdit" type="submit" variant="primary" :loading="busy" :disabled="!dirty">{{t('button.save')}}</WButton></footer>
 </form></WCard></div>
</template>
<style scoped>
.w-location-form { display:flex;flex-direction:column;gap:16px; }.w-location-form header { display:flex;flex-direction:column;gap:8px; }.w-location-form nav { display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2); }.w-location-back { color:var(--w-text-3); }
.w-location-form h1 { margin:0;font-size:24px;line-height:32px;font-weight:600; }.w-location-form :deep(.w-form-grid){gap:12px 16px}.w-location-form :deep(.w-field__optional){font-size:13px}
.w-location-types { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px; }.w-location-types label { display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--w-border-strong);border-radius:6px;font-size:14px;line-height:22px;cursor:pointer; }.w-location-types label.is-selected { border-color:var(--w-pri);background:var(--w-sel-bg); }.w-location-types input { accent-color:var(--w-pri);width:16px;height:16px;margin:0; }
.w-location-editor :deep(.ql-toolbar) { border-color:var(--w-border-strong);border-radius:6px 6px 0 0; }.w-location-editor :deep(.ql-container) { border-color:var(--w-border-strong);border-radius:0 0 6px 6px;font:inherit;min-height:120px; }
.w-location-form footer { display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border); }.w-location-form footer>span { flex:1;font-size:13px;color:var(--w-text-2); }
@media(max-width:600px){.w-location-types{grid-template-columns:1fr}}
</style>
