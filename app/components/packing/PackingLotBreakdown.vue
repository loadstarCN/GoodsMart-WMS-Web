<script setup lang="ts">
const props=defineProps<{taskId:string|number}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError(),rows=ref<any[]>([]),error=ref(''),loading=ref(false)
let generation=0
const load=async()=>{const seq=++generation;loading.value=true;error.value='';const result=await httpRequest<any>(`/api/warehouse/packing/${props.taskId}/lot-allocations`,{onError:e=>{if(seq===generation)error.value=bizErrorMessage(e)}});if(seq===generation){rows.value=result?.items||[];loading.value=false}}
onMounted(load);onBeforeUnmount(()=>generation++)
const columns=computed(()=>[{key:'goods_name',label:t('nav.goods')},{key:'lot_no',label:t('packing-lots.lot')},{key:'picked_quantity',label:t('common.quantities.picked'),type:'qty' as const},{key:'packed_quantity',label:t('packing-lots.actual'),type:'qty' as const},{key:'returned',label:t('packing-lots.returned'),type:'qty' as const}])
</script>
<template><WCard v-if="rows.length||error||loading" :title="t('packing-lots.summary')" flush><WAlert v-if="error" tone="block" :title="error"><template #actions><WButton @click="load">{{t('freight.reload')}}</WButton></template></WAlert><WTable :rows="rows" :columns="columns" :loading="loading" inset><template #cell-lot_no="{row}">{{row.lot_no||t('packing-lots.unassigned')}}</template><template #cell-packed_quantity="{row}">{{row.packed_quantity}}</template><template #cell-returned="{row}">{{row.picked_quantity-row.packed_quantity}}</template></WTable></WCard></template>
