<script setup lang="ts">
import GoodsStockComposition from '~/components/inventory/GoodsStockComposition.vue'
const props=defineProps<{warehouseId:number;filters?:Record<string,any>}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref('')
let generation=0
const load=async()=>{
 const seq=++generation;data.value=null;error.value='';loading.value=true
 const result=await httpRequest('/api/warehouse/inventory/summary',{params:props.filters,headers:warehouseHeaders(props.warehouseId),onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}})
 if(seq===generation){data.value=result;loading.value=false}
}
watch(()=>props.warehouseId,load,{immediate:true});onBeforeUnmount(()=>generation++)
</script>
<template><WCard v-if="loading"><WEmptyState :title="t('common.status.loading')"/></WCard><WAlert v-else-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('dn.list.retry')}}</WButton></template></WAlert><GoodsStockComposition v-else-if="data" :rows="[data]" :filters="filters"/></template>
