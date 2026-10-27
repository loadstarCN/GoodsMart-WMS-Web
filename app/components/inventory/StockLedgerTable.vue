<script setup lang="ts">
const props=defineProps<{rows:any[];loading?:boolean;compact?:boolean;hideGoods?:boolean}>()
const {t}=useI18n()
const documentLink=(row:any)=>{
 const paths:Record<string,string>={asn:'/asn/detail/',dn:'/dn/detail/',adjustment:'/adjustment/detail/',picking_task:'/picking/detail/',packing_task:'/packing/detail/'}
 return row.doc_id&&paths[row.doc_type]?paths[row.doc_type]+row.doc_id:null
}
const columns=computed(()=>[
 {key:'occurred_at',label:t('ledger.time')},{key:'movement_type',label:t('ledger.movement')},
 {key:'document',label:t('ledger.document')},...(!props.hideGoods?[{key:'goods',label:t('nav.goods'),wrap:true}]:[]),
 ...(!props.compact?[{key:'lot_no',label:t('goods-label.lot')},{key:'location',label:t('nav.location')},{key:'stock_type',label:t('ledger.stock-type')}]:[]),
 {key:'quantity',label:t('ledger.change'),type:'qty' as const,strong:true,keepZero:true},
 ...(!props.compact?[{key:'category_balance_after',label:t('ledger.balance'),help:t('ledger.balance-help'),type:'qty' as const,keepZero:true}]:[]),
 {key:'operator',label:t('common.users.operator')},
])
</script>
<template><WTable class="w-ledger-table" :class="{'is-compact':compact}" :rows="rows" :columns="columns" :loading="loading" inset>
 <template #cell-occurred_at="{row}">{{$dayjs(row.occurred_at,compact?'MM/DD HH:mm':'YYYY/MM/DD HH:mm',row)}}</template>
 <template #cell-movement_type="{row}">{{t('ledger.movements.'+row.movement_type)}}</template>
 <template #cell-document="{row}"><NuxtLink v-if="documentLink(row)" class="w-ledger-link" :to="documentLink(row)!">{{row.doc_type.toUpperCase()}}-{{row.doc_id}}</NuxtLink><span v-else>{{row.doc_type?row.doc_type.toUpperCase()+'-'+row.doc_id:'—'}}</span><span class="w-ledger-sub">{{row.doc_no||row.reason}}</span></template>
 <template #cell-goods="{row}"><NuxtLink class="w-ledger-link" :to="'/goods/detail/'+row.goods_id">{{row.goods?.name}}</NuxtLink><span class="w-ledger-sub">{{row.goods?.code}}</span></template>
 <template #cell-lot_no="{row}">{{row.lot_no||t('ledger.no-lot')}}</template>
 <template #cell-location="{row}"><NuxtLink v-if="row.location" class="w-ledger-link" :to="'/location/detail/'+row.location.id">{{row.location.code}}</NuxtLink></template>
 <template #cell-stock_type="{row}">{{t('ledger.types.'+row.stock_type)}}</template>
 <template #cell-quantity="{row}"><strong>{{row.quantity>0?'+':''}}{{row.quantity}}</strong></template>
 <template #cell-operator="{row}">{{row.operator?.user_name||row.source}}</template>
</WTable></template>
<style scoped>
.w-ledger-table :deep(table){min-width:1120px;border-collapse:collapse}.w-ledger-table.is-compact :deep(table){min-width:650px}.w-ledger-table :deep(thead th){height:auto;padding:12px 10px 8px;font-size:12px;line-height:16px}.w-ledger-table :deep(tbody td){padding:12px 10px;vertical-align:top}.w-ledger-table :deep(th:first-child),.w-ledger-table :deep(td:first-child){padding-left:20px}.w-ledger-table :deep(th:last-child),.w-ledger-table :deep(td:last-child){padding-right:20px}.w-ledger-link{color:var(--w-text-1);font-weight:500}.w-ledger-sub{display:block;font-size:12px;line-height:18px;color:var(--w-text-3)}
</style>
