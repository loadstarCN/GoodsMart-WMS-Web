<script setup lang="ts">
import { staffRolesOptions } from '~/data/selectOptions'
const props=defineProps<{staffId?:string;readonly?:boolean}>()
const {t}=useI18n(), {roleLabel}=useOptionLabel(),staff=useStaffStore(),warehouses=useWarehouseStore(),router=useRouter(),{bizErrorMessage}=useBizError()
const record=ref<Record<string,any>>({user_name:'',email:'',phone:'',position:'',employee_number:'',hire_date:null,avatar:null,is_active:true,roles:[],warehouse_ids:[],department_id:null})
const avatarUploader=useTemplateRef<{triggerSelect:()=>void}>('avatarUploader')
const departments=ref<any[]>([]),loading=ref(true),busy=ref(false),error=ref(''),errors=ref<Record<string,string>>({}),passwordVisible=ref(false)
const editable=computed(()=>!props.readonly&&staff.hasPermission('staff_edit'))
const title=computed(()=>props.staffId?record.value.user_name||t('nav.staff'):t('staff.ui.create'))
const fields=['user_name','email','phone','position','employee_number','hire_date','avatar','is_active','roles','warehouse_ids','department_id']
const payload=()=>Object.fromEntries(fields.map(key=>[key,record.value[key]]))
let original=''
const dirty=computed(()=>JSON.stringify(payload())!==original||!!record.value.password)
useHead({title})
onMounted(async()=>{
 try{
  if(props.staffId){const result=await httpRequest<any>('/api/warehouse/staff/'+props.staffId,{onError:e=>error.value=bizErrorMessage(e)});if(!result)return;record.value={...result,warehouse_ids:(result.warehouses||[]).map((w:any)=>w.id)}}
  original=JSON.stringify(payload())
  if(editable.value){await warehouses.fetchWarehouses();if(staff.hasPermission('department_read')){const result=await httpRequest<any>('/api/warehouse/department/',{params:{all:true,company_id:staff.staffInfo?.company_id},onError:e=>error.value=bizErrorMessage(e)});departments.value=result?.items||[]}}
 }finally{loading.value=false}
})
const warehouseOptions=computed(()=>Array.from(new Map([...(record.value.warehouses||[]),...warehouses.warehouses].map((w:any)=>[w.id,w])).values()))
const roleOptions=computed(()=>Array.from(new Set([...staffRolesOptions,...record.value.roles])))
const save=async()=>{
 if(busy.value||!editable.value)return
 errors.value={};error.value=''
 if(!String(record.value.user_name||'').trim())errors.value.user_name=t('common.validation.name-required',{entity:t('staff.entity')})
 if(!record.value.email)errors.value.email=t('common.validation.email-required')
 else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.value.email))errors.value.email=t('common.validation.email-format')
 if(!record.value.roles.length)errors.value.roles=t('common.validation.role-min-count')
 if(record.value.password&&!isValidPassword(record.value.password))errors.value.password=t('common.validation.password-policy',passwordPolicyParams())
 if(Object.keys(errors.value).length)return
 busy.value=true
 try{
  const previous=original?JSON.parse(original):{}
  const body=props.staffId?Object.fromEntries(Object.entries(payload()).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(previous[key]))):{...payload(),company_id:staff.staffInfo?.company_id}
  if(record.value.password)body.password=record.value.password
  let success=false
  await httpRequest('/api/warehouse/staff/'+(props.staffId||''),{method:props.staffId?'PUT':'POST',body,onSuccess:()=>{success=true},onError:e=>error.value=bizErrorMessage(e)})
  if(success){if(Number(props.staffId)===staff.staffInfo?.id)await staff.getCurrentStaffInfo();showToast(t('action-results.success'),'success');await router.push('/staff')}
 }finally{busy.value=false}
}
</script>
<template>
 <div class="w-staff-form w-scope">
  <header><nav><NuxtLink class="w-staff-link" to="/staff">{{t('nav.staff')}}</NuxtLink><span>/</span><span>{{title}}</span></nav><div class="w-staff-heading"><span class="w-staff-avatar"><img v-if="record.avatar" :src="record.avatar" alt="" /><template v-else>{{Array.from(String(record.user_name||''))[0]}}</template></span><div><h1>{{title}}</h1><div class="w-staff-meta"><span>{{record.email}}</span><span>{{(record.roles||[]).map(roleLabel).join(' · ')}}</span></div></div><WButton v-if="readonly&&staff.hasPermission('staff_edit')" :to="'/staff/edit/'+staffId">{{t('button.edit')}}</WButton></div></header>
  <WAlert v-if="error" tone="block" :title="error" />
  <WCard v-if="loading"><WEmptyState :title="t('common.status.loading')" /></WCard>
  <WCard v-else-if="!staffId||record.id" flush><form @submit.prevent="save"><fieldset :disabled="busy||!editable">
   <WFormSection :title="t('recipient.ui.basic')"><WFormGrid><div class="w-staff-upload"><ImageUploader ref="avatarUploader" :show-hint="false" v-if="editable" v-model="record.avatar" upload-url="/api/warehouse/staff/image/upload" shape="circle" :size="40" /><span>{{t('staff.fields.avater')}}</span><WButton v-if="editable" type="button" @click="avatarUploader?.triggerSelect()">{{t('button.upload')}}</WButton></div><WField :label="t('staff.fields.name')" :span="6" :error="errors.user_name"><WInput v-model="record.user_name" /></WField><WField :label="t('staff.fields.position')" :span="6" optional><WInput v-model="record.position" /></WField><WField :label="t('staff.fields.employee-number')" :span="4" optional><WInput v-model="record.employee_number" /></WField><WField :label="t('staff.fields.hire-date')" :span="4" optional><WInput v-model="record.hire_date" type="date" /></WField></WFormGrid></WFormSection>
   <WFormSection :title="t('staff.ui.account-password')"><WFormGrid><WField :label="t('common.fields.email')" :span="6" :error="errors.email"><WInput v-model="record.email" type="email" /></WField><WField :label="t('common.fields.phone')" :span="6" optional><WInput v-model="record.phone" type="tel" /></WField><div v-if="editable" class="w-staff-password"><strong>{{t('common.fields.password')}}</strong><div class="w-staff-password-fields"><WField :label="t('staff.ui.new-password')" :error="errors.password" optional><WInput v-model="record.password" :type="passwordVisible?'text':'password'" autocomplete="new-password"><template #suffix><WButton variant="text" size="sm" icon-only :icon="passwordVisible?'eye-off':'eye'" :aria-label="t(passwordVisible?'staff.ui.hide-password':'staff.ui.show-password')" :aria-pressed="passwordVisible" @click="passwordVisible=!passwordVisible"/></template></WInput></WField><WButton type="button" @click="record.password=generatePolicyPassword();passwordVisible=true">{{t('button.generate')}}</WButton></div></div><div class="w-staff-account-status"><WSwitch v-model="record.is_active" :disabled="!editable||Number(staffId)===staff.staffInfo?.id" :label="t('staff.ui.account-enabled')"/><WHelp :text="t('staff.ui.account-enabled-help')"/></div></WFormGrid></WFormSection>
   <WFormSection :title="t('staff.fields.roles')"><div class="w-staff-choices"><div v-for="role in roleOptions" :key="role" class="w-staff-choice" :class="{'is-selected':record.roles.includes(role)}"><WCheckbox v-model="record.roles" :value="role" :label="roleLabel(role)" /></div></div><p v-if="errors.roles" class="w-staff-error">{{errors.roles}}</p></WFormSection>
   <WFormSection :title="t('staff.ui.warehouses')" :help="t('staff.ui.warehouse-help')"><div class="w-staff-choices"><div v-for="warehouse in warehouseOptions" :key="warehouse.id" class="w-staff-choice" :class="{'is-selected':record.warehouse_ids.includes(warehouse.id)}"><WCheckbox v-model="record.warehouse_ids" :value="warehouse.id" :label="warehouse.name" /><span class="w-staff-zone">{{warehouse.timezone}}</span></div></div></WFormSection>
   <WFormSection :title="t('common.entities.department')"><WFormGrid><WField :label="t('common.entities.department')" :span="6" optional><WSelect v-model="record.department_id" :options="[{value:null,label:'—'},...Array.from(new Map([...(record.department?.id?[record.department]:[]),...departments].map(d=>[d.id,d])).values()).map(d=>({value:d.id,label:d.name}))]" /></WField></WFormGrid></WFormSection>
  </fieldset><footer><WButton to="/staff" :disabled="busy">{{t('button.cancel')}}</WButton><WButton v-if="editable" type="submit" variant="primary" :loading="busy" :disabled="!dirty">{{t('button.save')}}</WButton></footer></form></WCard>
 </div>
</template>
<style scoped>
.w-staff-form{display:flex;flex-direction:column;gap:16px}.w-staff-form header{display:flex;flex-direction:column;gap:8px}.w-staff-form nav{display:flex;gap:8px;font-size:13px;line-height:20px;color:var(--w-text-2)}.w-staff-link{color:var(--w-text-3);text-decoration:none}.w-staff-heading{display:flex;align-items:center;gap:16px}.w-staff-heading>div{flex:1;min-width:0}.w-staff-heading h1{margin:0;font-size:24px;line-height:32px;font-weight:600;overflow-wrap:anywhere}.w-staff-avatar{width:48px;height:48px;display:grid;place-items:center;background:#EDEFF3;border-radius:50%;font-size:20px;font-weight:600;flex:none;overflow:hidden}.w-staff-avatar img{width:100%;height:100%;object-fit:cover}.w-staff-meta{display:flex;flex-wrap:wrap;gap:4px 24px;color:var(--w-text-3);font-size:13px;line-height:20px;margin-top:4px}.w-staff-form fieldset{border:0;padding:0;margin:0;min-width:0}.w-staff-form :deep(.w-form-grid){gap:12px 16px}.w-staff-upload{grid-column:1/-1;display:flex;align-items:center;gap:12px;font-size:13px}.w-staff-password{grid-column:1/-1;border:1px solid var(--w-border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:12px}.w-staff-password-actions{display:flex;justify-content:space-between;gap:12px;align-items:center}.w-staff-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:8px}.w-staff-choice{padding:10px 12px;border:1px solid var(--w-border);border-radius:6px;display:flex;flex-direction:column;gap:4px;cursor:pointer}.w-staff-choice.is-selected{border-color:#5F1FE6;background:#F5F4FF}.w-staff-zone{padding-left:24px;font-size:12px;color:var(--w-text-3)}.w-staff-error{color:var(--w-danger);font-size:13px;margin:8px 0 0}.w-staff-form footer{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--w-border)}
.w-staff-password>strong{font-size:13px;line-height:20px;font-weight:600;color:var(--w-text-2)}.w-staff-password-fields{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,.7fr);gap:12px 16px;align-items:end;padding-top:12px;border-top:1px solid var(--w-line)}.w-staff-account-status{grid-column:1/-1;display:flex;align-items:center;gap:4px}.w-staff-choice :deep(.w-check__label){font-weight:600}@media(max-width:600px){.w-staff-password-fields{grid-template-columns:minmax(0,1fr) auto}}
</style>
