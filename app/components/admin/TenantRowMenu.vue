<script setup lang="ts">
const props=defineProps<{row:any;busy:boolean}>()
const emit=defineEmits<{action:[value:'toggle'|'delete']}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const summary=ref<any>(null),loading=ref(true),error=ref('')
let generation=0
const load=async()=>{const seq=++generation;loading.value=true;summary.value=null;error.value='';const result=await httpRequest<any>(`/api/warehouse/company/${props.row.id}/platform-summary`,{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq===generation){summary.value=result;loading.value=false}}
const related=computed(()=>Object.entries(summary.value?.related||{}))
const canDelete=computed(()=>!props.busy&&!loading.value&&!!summary.value&&!error.value&&!related.value.length)
onMounted(load);onBeforeUnmount(()=>generation++)
</script>
<template>
 <NuxtLink role="menuitem" class="w-menu-item" :to="'/admin/tenants/'+row.id">{{t('button.edit')}}</NuxtLink>
 <NuxtLink role="menuitem" class="w-menu-item" :to="'/admin/tenants/'+row.id+'#tenant-expiry'">{{t('tenant-list.renew')}}</NuxtLink>
 <button role="menuitem" class="w-menu-item" :disabled="busy" @click="emit('action','toggle')">{{t(row.is_active?'tenant-list.inactive':'tenant-list.active')}}</button>
 <button role="menuitem" class="w-menu-item w-menu-item--stacked" :aria-disabled="!canDelete" @click="canDelete&&emit('action','delete')"><span class="w-menu-item__label">{{t('button.delete')}}</span><span v-if="loading" class="w-menu-item__desc">{{t('common.status.loading')}}</span><span v-else-if="related.length" class="w-menu-item__desc">{{t('tenant-management.delete-hint')}}<span v-for="[key,count] in related" :key="key" class="related">{{t('tenant-management.related.'+key)}}: {{count}}</span></span></button>
 <button v-if="error" role="menuitem" class="w-menu-item w-menu-item--stacked" data-keep-open @click="load"><span>{{t('dn.list.retry')}}</span><span class="w-menu-item__desc">{{error}}</span></button>
</template>
<style scoped>.related{display:block}</style>
