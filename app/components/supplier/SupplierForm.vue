<script setup lang="ts">
const props=defineProps<{supplierId?:string}>()
const {t}=useI18n(),staff=useStaffStore(),router=useRouter(),{bizErrorMessage}=useBizError()
const editing=computed(()=>!!props.supplierId),canEdit=computed(()=>staff.hasPermission('supplier_edit'))
const record=ref<Record<string,any>>({name:'',contact:'',phone:'',email:'',zip_code:'',address:'',is_active:true})
const fields=['name','contact','phone','email','zip_code','address','is_active']
const loading=ref(false),busy=ref(false),error=ref(''),errors=ref<Record<string,string>>({}),asns=ref<PaginationData|null>(null)
let original='',generation=0
const payload=()=>Object.fromEntries(fields.map(key=>[key,record.value[key]]))
const dirty=computed(()=>JSON.stringify(payload())!==original)
const title=computed(()=>editing.value?record.value.name:t('supplier.ui.create'))
useHead({title})
const load=async()=>{
 const seq=++generation;error.value=''
 if(!props.supplierId){original=JSON.stringify(payload());return}
 loading.value=true
 const result=await httpRequest<any>('/api/warehouse/supplier/'+props.supplierId,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
 if(seq!==generation)return
 if(result){record.value=result;original=JSON.stringify(payload())}
 loading.value=false
 if(result&&staff.hasPermission('asn_read')){
  const recent=await httpRequest<PaginationData>('/api/warehouse/asn/',{params:{supplier_id:props.supplierId,per_page:5}})
  if(seq===generation)asns.value=recent
 }
}
watch(()=>props.supplierId,load);onMounted(load);onBeforeUnmount(()=>generation++)
const save=async()=>{
 if(busy.value||!canEdit.value)return
 errors.value={};error.value=''
 if(!String(record.value.name||'').trim())errors.value.name=t('common.validation.name-required',{entity:t('supplier.entity')})
 if(record.value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.value.email))errors.value.email=t('common.validation.email-format')
 if(Object.keys(errors.value).length)return
 busy.value=true
 try{
  if(!staff.staffInfo)await staff.getCurrentStaffInfo()
  const previous=original?JSON.parse(original):{}
  const body=editing.value?Object.fromEntries(Object.entries(payload()).filter(([key,value])=>value!==previous[key])):{...payload(),company_id:staff.staffInfo?.company_id}
  if(!Object.keys(body).length)return
  let success=false
  await httpRequest('/api/warehouse/supplier/'+(props.supplierId||''),{method:editing.value?'PUT':'POST',body,onSuccess:()=>{success=true},onError:err=>{error.value=bizErrorMessage(err)}})
  if(success){original=JSON.stringify(payload());showToast(t('action-results.success'),'success');await router.push('/supplier')}
 }finally{busy.value=false}
}
const columns=computed(()=>[
 {key:'id',label:t('asn.entity')},{key:'stage',label:t('asn.list.stage')},{key:'expected_arrival_date',label:t('asn.list.arrival')},{key:'warehouse',label:t('common.entities.warehouse'),value:(row:any)=>row.warehouse?.name},{key:'total_quantity',label:t('common.fields.quantity'),type:'qty' as const,strong:true,keepZero:true}
])
</script>
<template>
 <div class="w-supplier-form w-scope">
  <header><nav><NuxtLink class="w-supplier-breadcrumb" to="/supplier">{{t('nav.supplier')}}</NuxtLink><span>/</span><span>{{title}}</span></nav><div class="w-supplier-heading"><h1>{{title}}</h1><WStatus v-if="editing" variant="pill" :tone="record.is_active?'ok':'none'">{{t(record.is_active?'supplier.ui.enabled':'supplier.ui.disabled')}}</WStatus></div><div v-if="editing&&record.created_at" class="w-supplier-meta"><span>{{t('common.dates.created')}} {{ $dayjs(record.created_at) }} · {{record.creator?.user_name}}</span><span>{{t('common.dates.updated')}} {{$dayjs(record.updated_at)}}</span></div></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <WCard v-if="loading"><WEmptyState :title="t('common.status.loading')" /></WCard>
  <WCard v-else-if="!editing||record.id" flush><form @submit.prevent="save">
   <WFormSection :title="t('supplier.ui.basic')"><WFormGrid><WField :label="t('supplier.fields.name')" :error="errors.name"><WInput v-model="record.name" :disabled="busy||!canEdit" maxlength="100" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('supplier.ui.contact')"><WFormGrid><WField :label="t('common.fields.contact')" optional :span="4"><WInput v-model="record.contact" :disabled="busy||!canEdit" /></WField><WField :label="t('common.fields.phone')" optional :span="4"><WInput v-model="record.phone" type="tel" :disabled="busy||!canEdit" /></WField><WField :label="t('common.fields.email')" optional :span="4" :error="errors.email"><WInput v-model="record.email" type="email" :disabled="busy||!canEdit" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('common.fields.address')"><WFormGrid><WField :label="t('common.fields.zip')" optional :span="3"><WInput v-model="record.zip_code" :disabled="busy||!canEdit" maxlength="10" /></WField><WField :label="t('common.fields.address')" optional><WInput v-model="record.address" :disabled="busy||!canEdit" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('common.fields.status')"><div class="w-supplier-state"><WSwitch v-model="record.is_active" :label="t('supplier.ui.enable')" :disabled="busy||!canEdit" /><WHelp :text="t('supplier.ui.status-help')" /></div></WFormSection>
   <footer><span v-if="dirty&&canEdit" class="w-supplier-dirty"><i />{{t('supplier.ui.unsaved')}}</span><WButton to="/supplier" :disabled="busy">{{t('button.cancel')}}</WButton><WButton v-if="canEdit" type="submit" variant="primary" :disabled="!dirty" :loading="busy">{{t('button.save')}}</WButton></footer>
  </form></WCard>
  <WCard v-if="editing&&asns" flush><div class="w-supplier-recent"><h2>{{t('supplier.ui.recent')}}</h2><NuxtLink class="w-supplier-all" :to="{path:'/asn',query:{supplier_id:props.supplierId}}">{{t('supplier.ui.all-asns',{count:asns.total})}} →</NuxtLink></div><WTable :rows="asns.items" :columns="columns" inset><template #cell-id="{row}"><NuxtLink class="w-supplier-record" :to="'/asn/detail/'+row.id">ASN-{{row.id}}</NuxtLink></template><template #cell-stage="{row}"><WStatus muted :tone="row.inbound_stage==='completed'?'ok':row.inbound_stage==='exception'?'bad':['in_transit','sorting'].includes(row.inbound_stage)?'info':['putaway','receiving'].includes(row.inbound_stage)?'warn':'none'">{{t('asn.flow.stage.'+row.inbound_stage)}}</WStatus></template></WTable></WCard>
 </div>
</template>
<style scoped>
.w-supplier-form { display:flex; flex-direction:column; gap:16px; }
.w-supplier-form header { display:flex; flex-direction:column; gap:8px; }
.w-supplier-form nav { display:flex; gap:8px; align-items:center; color:var(--w-text-2); font-size:13px; line-height:20px; }
.w-supplier-breadcrumb { color:var(--w-text-3); text-decoration:none; }
.w-supplier-heading { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.w-supplier-heading h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; overflow-wrap:anywhere; }
.w-supplier-meta { display:flex; flex-wrap:wrap; gap:4px 24px; font-size:13px; line-height:20px; color:var(--w-text-3); margin-top:-4px; }
.w-supplier-form :deep(.w-form-grid) { gap:12px 16px; }
.w-supplier-form :deep(.w-field__optional) { font-size:13px; line-height:20px; }
.w-supplier-state { display:flex; align-items:center; gap:4px; min-height:24px; }
.w-supplier-form footer { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; padding:16px 24px; border-top:1px solid var(--w-border); }
.w-supplier-dirty { flex:1 1 200px; display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--w-text-2); }
.w-supplier-dirty i { width:6px; height:6px; border-radius:50%; background:var(--w-warn-dot); }
.w-supplier-recent { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; border-bottom:1px solid var(--w-line); }
.w-supplier-recent h2 { margin:0; font-size:16px; line-height:24px; font-weight:600; }
.w-supplier-all { font-size:13px; line-height:20px; color:var(--w-link); }
.w-supplier-record { font-size:14px; font-weight:500; color:var(--w-text-1); }
.w-supplier-form :deep(.w-table thead th) { height:auto; padding-top:10px; padding-bottom:8px; line-height:16px; }
.w-supplier-form :deep(.w-table__head) { vertical-align:top; }
.w-supplier-form :deep(.w-table tbody td) { padding-top:14px; padding-bottom:14px; }
.w-supplier-form :deep(.w-table) { min-width:650px; border-collapse:collapse; }
</style>
