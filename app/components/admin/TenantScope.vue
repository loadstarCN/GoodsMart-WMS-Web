<script setup lang="ts">
const props=defineProps<{companyId:string|number;summary:any}>()
const emit=defineEmits<{changed:[]}>()
const {t}=useI18n(),{roleLabel}=useOptionLabel(),{bizErrorMessage}=useBizError(),router=useRouter()
const open=ref(false),mode=ref<'add'|'password'>('add'),target=ref<any>(null),busy=ref(false),error=ref('')
const form=reactive({name:'',email:'',password:''})
const dirty=computed(()=>open.value&&!!(form.name||form.email||form.password))
useUnsavedForm(()=>dirty.value,()=>busy.value)
let closing=false
const close=async()=>{if(busy.value||closing)return;closing=true;try{if(!dirty.value||await wConfirm({title:t('unsaved-form.title'),message:t('unsaved-form.message'),confirmText:t('unsaved-form.leave'),cancelText:t('unsaved-form.stay')}))open.value=false}finally{closing=false}}
const drawerOpen=computed({get:()=>open.value,set:(value:boolean)=>{if(value)open.value=true;else void close()}})
const begin=(member?:any)=>{mode.value=member?'password':'add';target.value=member||null;form.name='';form.email='';form.password='';error.value='';open.value=true}
const save=async()=>{
 if(busy.value)return
 error.value=''
 if(mode.value==='add'&&(!form.name.trim()||!/^\S+@\S+\.\S+$/.test(form.email.trim()))){error.value=t('tenant-management.account-required');return}
 if(!isValidPassword(form.password)){error.value=t('common.validation.password-policy',passwordPolicyParams());return}
 busy.value=true
 try{
  let ok=false
  await httpRequest('/api/warehouse/staff/'+(mode.value==='password'?target.value.id:''),{method:mode.value==='password'?'PUT':'POST',body:mode.value==='password'?{password:form.password}:{company_id:Number(props.companyId),user_name:form.name.trim(),email:form.email.trim(),password:form.password,roles:['company_admin'],warehouse_ids:[],is_active:true},onSuccess:()=>ok=true,onError:e=>error.value=bizErrorMessage(e)})
  if(ok){open.value=false;form.password='';emit('changed');showToast(t('action-results.success'),'success')}
 }finally{busy.value=false}
}
const remove=async()=>{
 if(busy.value||Object.keys(props.summary?.related||{}).length)return
 busy.value=true;error.value=''
 try{if(!await wConfirm({title:t('admin.tenants.operations.delete'),message:t('tenant-management.delete-confirm'),confirmText:t('button.delete'),cancelText:t('button.cancel')}))return;let ok=false;await httpRequest('/api/warehouse/company/'+props.companyId,{method:'DELETE',onSuccess:()=>ok=true,onError:e=>error.value=bizErrorMessage(e)});if(ok)await router.push('/admin/tenants')}finally{busy.value=false}
}
const warehouseColumns=computed(()=>[{key:'name',label:t('nav.warehouse'),wrap:true},{key:'timezone',label:t('tenant-management.timezone')}])
const roleColumns=computed(()=>[{key:'name',label:t('staff.fields.roles'),wrap:true},{key:'count',label:t('tenant-management.people'),type:'qty' as const}])
watch(open,value=>{if(!value)form.password=''})
</script>
<template>
 <WFormSection :title="t('tenant-management.scope')"><div class="scope-grid"><WTable :columns="warehouseColumns" :rows="summary?.warehouses||[]"><template #cell-name="{row}">{{row.name}}<small v-if="!row.is_active">{{t('common.status.inactive')}}</small></template></WTable><div><WTable :columns="roleColumns" :rows="summary?.roles||[]"><template #cell-name="{row}">{{row.display_name||roleLabel(row.name)}}<small v-if="!row.is_active">{{t('common.status.inactive')}}</small></template></WTable><p class="hint">{{t('tenant-management.role-counts',{count:summary?.staff_count||0})}}</p></div></div></WFormSection>
 <WFormSection :title="t('tenant-management.admins')"><div class="accounts"><article v-for="member in summary?.admins||[]" :key="member.id"><span class="avatar">{{member.name.slice(0,1).toUpperCase()}}</span><div><strong>{{member.name}}</strong><small>{{member.email}}</small><WStatus v-if="!member.is_active" tone="none">{{t('common.status.inactive')}}</WStatus></div><WButton size="sm" :disabled="busy" @click="begin(member)">{{t('tenant-management.reset-password')}}</WButton></article><WButton :disabled="busy" @click="begin()">{{t('tenant-management.add-admin')}}</WButton></div></WFormSection>
 <WFormSection :title="t('admin.tenants.operations.delete')"><div class="deletion"><WButton variant="danger" :disabled="busy||!summary||Object.keys(summary.related).length>0" @click="remove">{{t('admin.tenants.operations.delete')}}</WButton><div><p class="hint">{{t('tenant-management.delete-hint')}}</p><ul v-if="summary"><li v-for="(count,key) in summary.related" :key="key">{{t('tenant-management.related.'+key)}}: {{count}}</li></ul></div></div><WAlert v-if="error&&!open" tone="block" :title="error"/></WFormSection>
 <WDrawer v-model:open="drawerOpen" :title="t(mode==='add'?'tenant-management.add-admin':'tenant-management.reset-password')" width="480px" :closable="!busy" :close-on-backdrop="!busy"><form id="tenant-admin-form" @submit.prevent="save"><p v-if="target">{{target.name}} · {{target.email}}</p><WAlert v-if="error" tone="block" :title="error"/><WField v-if="mode==='add'" :label="t('common.fields.name')" required><WInput v-model="form.name" :disabled="busy"/></WField><WField v-if="mode==='add'" :label="t('common.fields.email')" required><WInput v-model="form.email" type="email" :disabled="busy"/></WField><WField :label="t('common.fields.password')" required><WInput v-model="form.password" type="password" autocomplete="new-password" :disabled="busy"/></WField></form><template #footer><WButton :disabled="busy" @click="close">{{t('button.cancel')}}</WButton><WButton form="tenant-admin-form" type="submit" variant="primary" :loading="busy">{{t('button.save')}}</WButton></template></WDrawer>
</template>
<style scoped>
.scope-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.scope-grid>*{min-width:0}.accounts{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.accounts article{display:flex;width:100%;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--w-line);flex-wrap:wrap}.accounts article>div{flex:1;min-width:100px;overflow-wrap:anywhere}.accounts strong{font-size:14px;font-weight:500}.avatar{width:32px;height:32px;border-radius:50%;background:var(--w-line);display:grid;place-items:center;font-size:13px;flex:none}small,.hint{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}.hint{margin:8px 0}.deletion{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}.deletion ul{display:flex;gap:8px 20px;flex-wrap:wrap;padding:0;list-style:none;font-size:13px}form{display:flex;flex-direction:column;gap:16px}@media(max-width:800px){.scope-grid{grid-template-columns:minmax(0,1fr)}}
</style>
