<script setup lang="ts">
const props=defineProps<{goodsId:number}>()
const {t}=useI18n(),{bizErrorMessage}=useBizError()
const data=ref<any>(null),loading=ref(false),error=ref(''),keyword=ref(''),page=ref(1)
let generation=0
const load=async()=>{const seq=++generation;loading.value=true;error.value='';const result=await httpRequest<any>('/api/warehouse/goods/'+props.goodsId+'/lots',{params:{keyword:keyword.value,page:page.value,per_page:20},onError:err=>{if(seq===generation)error.value=bizErrorMessage(err)}});if(seq===generation){data.value=result;loading.value=false}}
const columns=computed(()=>[{key:'lot_no',label:t('goods-label.lot'),strong:true},{key:'production_date',label:t('goods.fields.product-date')},{key:'expiry_date',label:t('goods-label.expiry')},{key:'actions',label:t('common.fields.action'),align:'right' as const}])
watch([page,()=>props.goodsId],load);onMounted(load);onBeforeUnmount(()=>generation++)
const search=()=>{if(page.value!==1)page.value=1;else load()}
</script>
<template><section class="w-goods-lots"><header><h2>{{t('goods-label.lot')}} <small>{{data?.total??0}}</small></h2><WInput v-model="keyword" type="search" :placeholder="t('goods-label.lot')" :aria-label="t('goods-label.lot')" @keydown.enter.prevent="search" @change="search"/><WButton :to="'/goods/label/'+goodsId">{{t('goods-label.title')}}</WButton></header><WAlert v-if="error" tone="block" :title="error"/><WTable :rows="data?.items||[]" :columns="columns" :loading="loading" inset><template #cell-actions="{row}"><WButton variant="text" size="sm" :to="{path:'/goods/label/'+goodsId,query:{lot_id:row.id}}">{{t('goods-label.title')}}</WButton></template></WTable><footer><WPagination v-model:page="page" :page-size="20" :total="data?.total" show-total /></footer></section></template>
<style scoped>
.w-goods-lots header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px 20px;border-bottom:1px solid var(--w-line)}h2{font-size:16px;line-height:24px;font-weight:600;margin:0 auto 0 0}h2 small{margin-left:6px;font-size:13px;font-weight:400;color:var(--w-text-3)}header>.w-input{width:220px}footer{padding:12px 20px;border-top:1px solid var(--w-line)}.w-goods-lots :deep(table){min-width:600px}
.w-goods-lots :deep(.w-table-wrap){--w-table-edge:20px}
.w-goods-lots :deep(thead th){height:auto;padding-top:12px;padding-bottom:8px;font-weight:500}
.w-goods-lots :deep(thead th.is-strong){color:var(--w-text-3);font-weight:500}
.w-goods-lots :deep(tbody td){height:auto;padding-top:12px;padding-bottom:12px}
.w-goods-lots :deep(tbody td:last-child){padding-top:8px;padding-bottom:8px}
.w-goods-lots :deep(tbody td:nth-child(2)){color:var(--w-text-2)}
</style>
