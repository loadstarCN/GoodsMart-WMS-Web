<script setup lang="ts">
import FreightLines from '~/components/freight/FreightLines.vue'
const {t}=useI18n(),{bizErrorMessage}=useBizError(),warehouses=useWarehouseStore(),staff=useStaffStore()
const ready=ref(false)
const warehouseId=computed(()=>warehouses.currentWarehouse?.id||null),canEdit=computed(()=>ready.value&&!!staff.refreshed&&!!staff.staffInfo&&staff.hasPermission('freight_edit'))
const carrier=ref(''),carriers=ref<any[]>([]),file=shallowRef<File|null>(null),busy=ref(false),error=ref(''),preview=ref<any>(null)
const metadata=reactive({invoice_number:'',invoice_date:'',period_from:'',period_to:'',currency:'JPY',encoding:'auto'})
const carrierError=ref(''),carriersLoading=ref(false),imported=ref(false)
let carrierGeneration=0,disposed=false
const loadCarriers=async()=>{const seq=++carrierGeneration;carriersLoading.value=true;carrierError.value='';const result=await httpRequest<any>('/api/warehouse/carrier/freight/carriers',{headers:warehouseHeaders(warehouseId.value),onError:e=>{if(seq===carrierGeneration)carrierError.value=bizErrorMessage(e)}});if(seq!==carrierGeneration||disposed)return;carriers.value=result?.items||[];carriersLoading.value=false}
useUnsavedForm(()=>!imported.value&&!!(file.value||carrier.value||metadata.invoice_number||metadata.invoice_date||metadata.period_from||metadata.period_to),()=>busy.value)
let generation=0
const invalidate=()=>{generation++;preview.value=null;error.value=''}
watch([warehouseId,carrier,metadata],invalidate,{deep:true})
const selectFile=(event:Event)=>{file.value=(event.target as HTMLInputElement).files?.[0]||null;invalidate()}
const body=()=>{const form=new FormData();if(file.value)form.append('file',file.value);for(const [key,value] of Object.entries(metadata))form.append(key,value);return form}
const submit=async(importing=false)=>{
 if(busy.value||carriersLoading.value||carrierError.value||!file.value||!carrier.value||!canEdit.value)return
 if(importing&&(!preview.value?.can_import||preview.value?.duplicate))return
 if(!importing)preview.value=null
 const seq=++generation,scope=warehouseId.value;busy.value=true;error.value=''
 try{const result=await httpRequest<any>(`/api/warehouse/carrier/${carrier.value}/freight-${importing?'import':'preview'}`,{method:'POST',body:body(),headers:warehouseHeaders(scope),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq!==generation)return
 if(result){if(importing){imported.value=true;await navigateTo('/freight/invoices/'+result.id)}else preview.value=result}
 }finally{busy.value=false}
}
const readMetadata=async()=>{if(busy.value||!file.value||!carrier.value||!canEdit.value||carrierError.value)return;const seq=++generation;busy.value=true;error.value='';preview.value=null;try{const result=await httpRequest<any>('/api/warehouse/carrier/'+carrier.value+'/freight-metadata',{method:'POST',body:body(),headers:warehouseHeaders(warehouseId.value),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq!==generation||disposed)return;if(result){Object.assign(metadata,result.metadata);showToast(t(Object.keys(result.metadata).length?'freight.read-metadata-done':'freight.read-metadata-empty'),Object.keys(result.metadata).length?'success':'warning')}}finally{busy.value=false}}
const template=async()=>{try{await downloadFile('/api/warehouse/carrier/freight/template',{},'carrier-invoice.csv')}catch(e){error.value=bizErrorMessage(e as HttpRequestError)}}
const initialize=async()=>{ready.value=false;carrierError.value='';carriersLoading.value=true;const current=await staff.getCurrentStaffInfo();if(disposed)return;if(!current){carriersLoading.value=false;carrierError.value=t('action-results.failed');return}ready.value=true;await loadCarriers()};onMounted(initialize)
onBeforeUnmount(()=>{disposed=true;generation++;carrierGeneration++})
useHead({title:()=>t('freight.import')})
</script>
<template><div class="freight-page w-scope"><header><div><NuxtLink to="/reports/freight">{{t('freight.title')}}</NuxtLink><h1>{{t('freight.import')}}</h1><p>{{t('freight.import-hint')}}</p></div><WButton @click="template">{{t('freight.template')}}</WButton></header>
 <WAlert v-if="error" tone="block" :title="error"/>
 <WAlert v-if="carrierError" tone="block" :title="carrierError"><template #actions><WButton :disabled="carriersLoading" @click="ready?loadCarriers():initialize()">{{t('dn.list.retry')}}</WButton></template></WAlert>
 <WCard><form @submit.prevent="submit(false)"><fieldset :disabled="busy||carriersLoading||!!carrierError||!canEdit"><WFormGrid>
 <WField :label="t('nav.carrier')" :span="6" required><WSelect v-model="carrier" :options="carriers.map(row=>({value:String(row.id),label:row.name}))"/></WField>
 <WField :label="t('freight.number')" :span="6" required><WInput v-model="metadata.invoice_number" required maxlength="100"/></WField>
 <WField :label="t('freight.date')" :span="6" required><WInput v-model="metadata.invoice_date" type="date" required/></WField>
 <WField :label="t('freight.currency')" :span="6" required><WInput v-model="metadata.currency" required minlength="3" maxlength="3"/></WField>
 <WField :label="t('freight.from')" :span="6" required><WInput v-model="metadata.period_from" type="date" required/></WField>
 <WField :label="t('freight.to')" :span="6" required><WInput v-model="metadata.period_to" type="date" :min="metadata.period_from||undefined" required/></WField>
 <WField :label="t('freight.file')" :span="6" required><input type="file" accept=".csv,.xlsx" required :aria-label="t('freight.file')" @change="selectFile"><small>{{t('freight.file-hint')}}</small><WButton type="button" :disabled="!file||!carrier||busy" @click="readMetadata">{{t('freight.read-metadata')}}</WButton></WField>
 <WField :label="t('goods.files.encoding')" :span="6"><WSelect v-model="metadata.encoding" :options="[{value:'auto',label:'Auto'},{value:'utf-8',label:'UTF-8'},{value:'shift_jis',label:'Shift_JIS'}]"/></WField>
 </WFormGrid></fieldset><footer><WButton type="submit" variant="primary" :loading="busy" :disabled="!file||!carrier||carriersLoading||!!carrierError||!canEdit">{{t('freight.preview')}}</WButton></footer></form></WCard>
 <WCard v-if="preview" :title="t('freight.preview')" flush><div class="preview-summary"><b>{{preview.currency}} {{preview.total}}</b><span>{{preview.lines.length}} {{t('freight.lines')}}</span><span>{{preview.error_count}} {{t('freight.errors')}}</span></div>
 <WAlert v-if="preview.duplicate" tone="block" :title="t('freight.duplicate')"/>
 <ul v-if="preview.errors.length"><li v-for="(item,index) in preview.errors" :key="index">{{item.row}}: {{item.message||item.error||item}}</li></ul>
 <FreightLines :rows="preview.lines" preview/>
 <footer><WButton variant="primary" :loading="busy" :disabled="!preview.can_import||!canEdit" @click="submit(true)">{{t('freight.save-import')}}</WButton></footer></WCard>
 </div></template>
<style scoped>.freight-page h1,.freight-page header>div,.summary>div{min-width:0;max-width:100%;overflow-wrap:anywhere}.freight-page :deep(.w-table td){max-width:260px;white-space:normal;overflow-wrap:anywhere}.freight-page{display:flex;flex-direction:column;gap:20px}header{display:flex;justify-content:space-between;gap:16px;align-items:start}h1{font-size:24px;margin:10px 0}p,small{color:var(--w-text-3)}fieldset{border:0;padding:0;min-width:0}footer{display:flex;justify-content:flex-end;padding-top:16px}.preview-summary{display:flex;gap:24px;padding:20px}.w-card footer{padding:16px}input[type=file]{max-width:100%}small{display:block;margin-top:8px}a{color:var(--w-pri)}@media(max-width:767px){header{flex-direction:column}.preview-summary{flex-wrap:wrap}}</style>
