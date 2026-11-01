<script setup lang="ts">
const props=defineProps<{rows:any[];goodsId:number}>()
const {t}=useI18n(),staff=useStaffStore()
const page=ref(1)
watch(()=>props.rows,()=>page.value=1)
const total=computed(()=>props.rows.reduce((n,row)=>n+row.quantity,0))
const maximum=computed(()=>Math.max(1,...props.rows.map(row=>row.quantity)))
const columns=computed(()=>[
 {key:'location',label:t('goods-trend.location')},
 {key:'stock_type',label:t('goods-trend.category'),value:(row:any)=>t('ledger.types.'+row.stock_type)},
 {key:'lot_no',label:t('goods-label.lot'),value:(row:any)=>row.lot_no||'—'},
 {key:'expiry_date',label:t('goods-trend.expiry'),value:(row:any)=>row.expiry_date||'—'},
 {key:'quantity',label:t('common.fields.quantity'),type:'qty' as const,keepZero:true},
])
</script>
<template><section class="goods-distribution"><header><h3>{{t('goods-trend.distribution')}}</h3><span>{{t('goods-trend.distribution-total',{quantity:total})}}</span></header><p>{{t('goods-trend.distribution-hint')}}</p>
<WTable :rows="rows.slice((page-1)*20,page*20)" :columns="columns" :row-key="(row:any)=>[row.location_id,row.lot_id,row.stock_type].join(':')"><template #cell-location="{row}"><NuxtLink v-if="row.location_id&&staff.hasPermission('location_read')" :to="'/location/detail/'+row.location_id">{{row.location_code}}</NuxtLink><span v-else>{{row.location_code||'—'}}</span></template><template #cell-quantity="{row}"><div class="quantity"><span class="bar" aria-hidden="true"><i :style="{width:row.quantity/maximum*100+'%'}"/></span><b>{{row.quantity}}</b></div></template></WTable>
<WPagination v-if="rows.length>20" :page="page" :page-size="20" :total="rows.length" show-total @update:page="page=$event"/>
</section></template>
<style scoped>
.goods-distribution{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--w-line);padding-top:16px}header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center}h3{margin:0;font-size:16px;line-height:24px;font-weight:600}p,header span{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}.quantity{display:flex;align-items:center;gap:10px;min-width:100px;justify-content:flex-end}.bar{width:70px;height:8px;background:var(--w-line);border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:var(--w-pri)}b{font-weight:600;min-width:24px}a{color:var(--w-pri)}
</style>
