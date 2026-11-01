<script setup lang="ts">
const props=defineProps<{permissionId:number|null;displayName?:string;moduleName?:string;platformOnly?:boolean}>()
const emit=defineEmits<{close:[];saved:[]}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError(),{roleLabel}=useOptionLabel()
const form=ref({name:'',description:''}),original=ref<string|null>(null),record=ref<any>(null),roles=ref<any[]>([])
const loading=ref(false),busy=ref(false),error=ref(''),nameError=ref('')
const dirty=computed(()=>original.value!==null&&JSON.stringify(form.value)!==original.value)
useUnsavedForm(()=>dirty.value,()=>busy.value)
let generation=0,closing=false
const close=async()=>{if(busy.value||closing)return;closing=true;try{if(!dirty.value||await wConfirm({title:t('unsaved-form.title'),message:t('unsaved-form.message'),confirmText:t('unsaved-form.leave'),cancelText:t('unsaved-form.stay')}))emit('close')}finally{closing=false}}
const open=computed({get:()=>true,set:(value:boolean)=>{if(!value)void close()}})
const load=async()=>{
 const seq=++generation;loading.value=true;error.value='';record.value=null;roles.value=[];original.value=null
 if(props.permissionId===null){form.value={name:'',description:''};original.value=JSON.stringify(form.value);loading.value=false;return}
 const onError=(e:any)=>{if(seq===generation)error.value=bizErrorMessage(e)}
 const loadRoles=async()=>{const items:any[]=[];let page=1;while(true){const data=await httpRequest<any>('/api/system/user/roles',{params:{page,per_page:100},onError});if(seq!==generation||!data)return null;if(Array.isArray(data))return data;items.push(...(data.items||[]));if(items.length>=data.total||!data.items?.length)return items;page++}}
 const [permission,catalog]=await Promise.all([httpRequest<any>(`/api/system/user/permissions/${props.permissionId}`,{onError}),loadRoles()])
 if(seq!==generation)return
 if(permission&&catalog){record.value=permission;form.value={name:permission.name||'',description:permission.description||''};roles.value=catalog.filter((r:any)=>r.permissions?.includes(permission.name));original.value=JSON.stringify(form.value)}
 loading.value=false
}
const save=async()=>{
 if(busy.value||loading.value||original.value===null)return
 nameError.value='';error.value=''
 if(!form.value.name.trim()){nameError.value=t('common.validation.name-required',{entity:t('admin.permissions.entity')});return}
 busy.value=true
 try{let success=false;await httpRequest(props.permissionId===null?'/api/system/user/permissions':`/api/system/user/permissions/${props.permissionId}`,{method:props.permissionId===null?'POST':'PUT',body:{...form.value,name:form.value.name.trim()},onSuccess:()=>{success=true},onError:e=>error.value=bizErrorMessage(e)});if(success){original.value=JSON.stringify(form.value);showToast(t('action-results.success'),'success');emit('saved')}}finally{busy.value=false}
}
const remove=async()=>{
 if(busy.value||loading.value||!record.value||record.value.is_builtin)return
 busy.value=true
 try{if(!await wConfirm({title:t('action-results.delete-confirm-title'),message:t('action-results.delete-confirm',{entity:record.value.name}),confirmText:t('button.delete'),cancelText:t('button.cancel'),danger:true}))return;let success=false;await httpRequest(`/api/system/user/permissions/${props.permissionId}`,{method:'DELETE',onSuccess:()=>{success=true},onError:e=>error.value=bizErrorMessage(e)});if(success){original.value=JSON.stringify(form.value);emit('saved')}}finally{busy.value=false}
}
onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <WDrawer v-model:open="open" :title="t(permissionId===null?'admin.permissions.operations.add':'admin.permissions.operations.edit')" :closable="!busy">
  <WAlert v-if="error" tone="block" :title="error"><template v-if="original===null" #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert>
  <WEmptyState v-if="loading" :title="t('common.status.loading')"/>
  <form v-else-if="original!==null" id="permission-editor-form" class="permission-editor" @submit.prevent="save">
   <WField :label="t('permission-catalog.code')" required :error="nameError" :hint="record?.is_builtin?t('admin.builtin.permission-tip'):undefined"><WInput v-model="form.name" :readonly="!!record?.is_builtin" :disabled="busy"/></WField>
   <WField :label="t('common.fields.description')"><WTextarea v-model="form.description" :disabled="busy" :rows="4"/></WField>
   <template v-if="record">
    <dl><dt>{{t('common.fields.name')}}</dt><dd>{{displayName||record.name}}</dd><dt>{{t('permission-catalog.module')}}</dt><dd>{{moduleName}}</dd></dl>
    <WStatus v-if="record.is_builtin" tone="none">{{t('admin.builtin.label')}}</WStatus>
    <WStatus v-if="platformOnly" tone="none">{{t('permission-catalog.platform')}}</WStatus>
    <h3>{{t('permission-catalog.roles')}} · {{roles.length}}</h3>
    <WEmptyState v-if="!roles.length" :title="t('permission-catalog.unused')"/>
    <ul v-else><li v-for="role in roles" :key="role.id"><NuxtLink :to="'/admin/roles/'+role.id">{{role.display_name||roleLabel(role.name)}}</NuxtLink><small>{{role.name}}</small></li></ul>
   </template>
  </form>
  <template #footer><WButton v-if="record" variant="danger" :disabled="busy||loading||record.is_builtin" @click="remove">{{t('button.delete')}}</WButton><WButton :disabled="busy" @click="close">{{t('button.cancel')}}</WButton><WButton form="permission-editor-form" type="submit" variant="primary" :loading="busy" :disabled="loading||original===null">{{t('button.save')}}</WButton></template>
 </WDrawer>
</template>
<style scoped>.permission-editor{display:flex;flex-direction:column;gap:16px}dl{display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px;font-size:13px;margin:0}dt,small{color:var(--w-text-3)}dd{margin:0;overflow-wrap:anywhere}h3{font-size:13px;margin:4px 0 0}ul{list-style:none;margin:0;padding:0;border:1px solid var(--w-border);border-radius:8px}li{padding:10px 12px;border-bottom:1px solid var(--w-border);display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px}li:last-child{border:0}small{font-size:12px;overflow-wrap:anywhere}</style>
