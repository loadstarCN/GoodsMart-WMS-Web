<script setup lang="ts">
const props=defineProps<{rows:any[],editable?:boolean,preview?:boolean}>()
const staff=useStaffStore()
const emit=defineEmits<{review:[row:any]}>(),{t}=useI18n(),page=ref(1)
watch(()=>props.rows,()=>page.value=1)
const visible=computed(()=>props.rows.slice((page.value-1)*20,page.value*20))
const columns=computed(()=>[
 {key:'tracking_number',label:t('freight.tracking'),wrap:true},
 {key:'shipping_date',label:t('freight.shipping-date')},
 {key:'dn_id',label:t('nav.DN')},
 {key:'estimated_amount',label:t('freight.estimate'),type:'qty' as const},
 {key:'amount',label:t('freight.amount'),type:'qty' as const},
 {key:'difference',label:t('freight.difference'),type:'qty' as const},
 {key:'state',label:t('common.fields.status')},
 {key:'note',label:t('freight.note'),wrap:true},
 ...(props.editable?[{key:'actions',label:t('common.fields.action')}]:[])
])
</script>
<template><WTable class="freight-lines" :rows="visible" :columns="columns" row-key="line_number" inset>
 <template #cell-tracking_number="{row}"><strong>{{row.tracking_number}}</strong><small class="line-meta">{{row.service||'—'}}<template v-if="row.billable_weight!=null"> &middot; {{row.billable_weight}} kg</template></small></template>
 <template #cell-dn_id="{row}"><NuxtLink v-if="row.dn_id && staff.refreshed && staff.staffInfo && staff.hasPermission('dn_read')" :to="'/dn/detail/'+row.dn_id">DN #{{row.dn_id}}</NuxtLink><span v-else>{{row.dn_id ? 'DN #'+row.dn_id : '—'}}</span></template>
 <template #cell-estimated_amount="{row}">{{row.estimated_amount??'—'}} {{row.estimated_currency||''}}</template>
 <template #cell-difference="{row}">{{row.difference??'—'}}</template>
 <template #cell-state="{row}"><WStatus :tone="['matched','accepted','external'].includes(row.state)?'ok':row.state==='disputed'?'bad':'warn'">{{t('freight.states.'+row.state)}}</WStatus></template>
 <template #cell-actions="{row}"><WButton size="sm" variant="text" @click="emit('review',row)">{{t('freight.review')}}</WButton></template>
</WTable><div class="pager"><WPagination v-model:page="page" :total="rows.length" :page-size="20" show-total/></div></template>
<style scoped>.freight-lines :deep(.w-table){min-width:1000px}.freight-lines :deep(td){max-width:240px;overflow-wrap:anywhere}.line-meta{display:block;color:var(--w-text-3);margin-top:4px}.pager{padding:16px}a{color:var(--w-pri)}</style>
