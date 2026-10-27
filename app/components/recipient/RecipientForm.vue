<script setup lang="ts">
import { preserveAddressPatch } from '~/utils/addressPatch'
const props=defineProps<{recipientId?:string}>()
const {t}=useI18n(),staff=useStaffStore(),router=useRouter(),{bizErrorMessage}=useBizError()
const editing=computed(()=>!!props.recipientId),canEdit=computed(()=>staff.hasPermission('recipient_edit'))
const record=ref<Record<string,any>>({name:'',contact:'',phone:'',email:'',zip_code:'',address:'',is_active:true,country:null,organization:null,admin_area:null,locality:null,dependent_locality:null,address_line1:null,address_line2:null,latin:null})
const fields=['name','contact','phone','email','zip_code','address','is_active','country','organization','admin_area','locality','dependent_locality','address_line1','address_line2','latin','tax_id','tax_id_type']
const loading=ref(false),busy=ref(false),error=ref(''),errors=ref<Record<string,string>>({})
let original='',generation=0
const payload=()=>Object.fromEntries(fields.map(key=>[key,record.value[key]]))
const dirty=computed(()=>JSON.stringify(payload())!==original)
const title=computed(()=>t(editing.value?'recipient.operations.edit':'recipient.ui.create'))
useHead({title})
const load=async()=>{
 const seq=++generation;error.value=''
 if(!props.recipientId){original=JSON.stringify(payload());return}
 loading.value=true
 const result=await httpRequest<any>('/api/warehouse/recipient/'+props.recipientId,{onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}})
 if(seq!==generation)return
 if(result){record.value=result;original=JSON.stringify(payload())}
 loading.value=false

}
watch(()=>props.recipientId,load);onMounted(load);onBeforeUnmount(()=>generation++)
const save=async()=>{
 if(busy.value||!canEdit.value)return
 errors.value={};error.value=''
 if(!String(record.value.name||'').trim())errors.value.name=t('common.validation.name-required',{entity:t('recipient.entity')})
 if(record.value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.value.email))errors.value.email=t('common.validation.email-format')
 if(!record.value.country)errors.value.country=t('common.validation.country-required')
 if(Object.keys(errors.value).length)return
 busy.value=true
 try{
  if(!staff.staffInfo)await staff.getCurrentStaffInfo()
  const previous=original?JSON.parse(original):{}
  const body=editing.value?Object.fromEntries(Object.entries(payload()).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous[key]))):{...payload(),company_id:staff.staffInfo?.company_id}
  if(!Object.keys(body).length)return
  let success=false
  await httpRequest('/api/warehouse/recipient/'+(props.recipientId||''),{method:editing.value?'PUT':'POST',body:preserveAddressPatch(body,record.value),onSuccess:()=>{success=true},onError:err=>{error.value=bizErrorMessage(err)}})
  if(success){original=JSON.stringify(payload());showToast(t('action-results.success'),'success');await router.push(props.recipientId?'/recipient/detail/'+props.recipientId:'/recipient')}
 }finally{busy.value=false}
}
</script>
<template>
 <div class="w-recipient-form w-scope">
  <header><nav><NuxtLink class="w-recipient-breadcrumb" to="/recipient">{{t('nav.recipient')}}</NuxtLink><template v-if="editing"><span>/</span><NuxtLink class="w-recipient-breadcrumb" :to="'/recipient/detail/'+recipientId">{{record.name}}</NuxtLink></template><span>/</span><span>{{t(editing?'button.edit':'recipient.ui.create')}}</span></nav><div class="w-recipient-heading"><h1>{{title}}</h1></div><div v-if="editing&&record.id" class="w-recipient-meta"><span>{{t('recipient.ui.source')}} <strong>{{t(record.external_reference?'recipient.ui.external':'recipient.ui.manual')}}</strong></span><span v-if="record.external_reference">{{t('recipient.ui.external-id')}} <code>{{record.external_reference}}</code></span></div></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <WCard v-if="loading"><WEmptyState :title="t('common.status.loading')" /></WCard>
  <WCard v-else-if="!editing||record.id" flush><form @submit.prevent="save">
   <WFormSection :title="t('recipient.ui.basic')"><WFormGrid><WField :label="t('recipient.fields.name')" :error="errors.name"><WInput v-model="record.name" :disabled="busy||!canEdit" maxlength="255" /></WField><WField :label="t('common.fields.contact')" optional :span="4"><WInput v-model="record.contact" :disabled="busy||!canEdit" /></WField><WField :label="t('common.fields.phone')" optional :span="4"><WInput v-model="record.phone" type="tel" :disabled="busy||!canEdit" /></WField><WField :label="t('common.fields.email')" optional :span="4" :error="errors.email"><WInput v-model="record.email" type="email" :disabled="busy||!canEdit" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('common.fields.address')"><StructuredAddressFields v-model="record" id-prefix="recipient" country-required :country-error="errors.country" with-organization with-dependent-locality :editable="!busy&&canEdit" /></WFormSection>
   <WFormSection :title="t('recipient.ui.customs')"><WFormGrid><WField :label="t('customs.fields.tax-id-type')" optional :span="6"><WSelect v-model="record.tax_id_type" :disabled="busy||!canEdit" :options="[{value:'',label:'—'},...['EORI','VAT','PCCC','KR_BRN','CPF','CNPJ','EIN','USCC','TW_UBN','OTHER'].map(value=>({value,label:value}))]" /></WField><WField :label="t('customs.fields.recipient-tax-id')" optional :span="6"><WInput v-model="record.tax_id" maxlength="100" :disabled="busy||!canEdit" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('common.fields.status')"><div class="w-recipient-state"><WSwitch v-model="record.is_active" :label="t('recipient.ui.enable')" :disabled="busy||!canEdit" /><WHelp :text="t('recipient.ui.status-help')" /></div></WFormSection>
   <footer><span v-if="dirty&&canEdit" class="w-recipient-dirty"><i />{{t('recipient.ui.unsaved')}}</span><WButton to="/recipient" :disabled="busy">{{t('button.cancel')}}</WButton><WButton v-if="canEdit" type="submit" variant="primary" :disabled="!dirty" :loading="busy">{{t('button.save')}}</WButton></footer>
  </form></WCard>

 </div>
</template>
<style scoped>
.w-recipient-form { display:flex; flex-direction:column; gap:16px; }
.w-recipient-form header { display:flex; flex-direction:column; gap:8px; }
.w-recipient-form nav { display:flex; gap:8px; align-items:center; color:var(--w-text-2); font-size:13px; line-height:20px; }
.w-recipient-breadcrumb { color:var(--w-text-3); text-decoration:none; }
.w-recipient-heading { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.w-recipient-heading h1 { margin:0; font-size:24px; line-height:32px; font-weight:600; overflow-wrap:anywhere; }
.w-recipient-meta { display:flex; flex-wrap:wrap; gap:4px 24px; font-size:13px; line-height:20px; color:var(--w-text-3); margin-top:-4px; }
.w-recipient-form :deep(.w-form-grid) { gap:12px 16px; }
.w-recipient-form :deep(.w-field__optional) { font-size:13px; line-height:20px; }
.w-recipient-state { display:flex; align-items:center; gap:4px; min-height:24px; }
.w-recipient-form footer { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; padding:16px 24px; border-top:1px solid var(--w-border); }
.w-recipient-dirty { flex:1 1 200px; display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--w-text-2); }
.w-recipient-dirty i { width:6px; height:6px; border-radius:50%; background:var(--w-warn-dot); }
.w-recipient-recent { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 24px; border-bottom:1px solid var(--w-line); }
.w-recipient-recent h2 { margin:0; font-size:16px; line-height:24px; font-weight:600; }
.w-recipient-all { font-size:13px; line-height:20px; color:var(--w-link); }
.w-recipient-record { font-size:14px; font-weight:500; color:var(--w-text-1); }
.w-recipient-form :deep(.w-table thead th) { height:auto; padding-top:10px; padding-bottom:8px; line-height:16px; }
.w-recipient-form :deep(.w-table__head) { vertical-align:top; }
.w-recipient-form :deep(.w-table tbody td) { padding-top:14px; padding-bottom:14px; }
.w-recipient-form :deep(.w-table) { min-width:650px; border-collapse:collapse; }
</style>

<style scoped>.w-recipient-meta strong {font-weight:400;color:var(--w-text-1)}</style>
