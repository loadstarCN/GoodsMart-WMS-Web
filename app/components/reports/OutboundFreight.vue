<script setup lang="ts">
const props=defineProps<{data:any;compare:boolean}>()
const {t,locale}=useI18n()
const money=(value:number|null|undefined)=>value==null?'—':Number(value).toLocaleString(locale.value,{minimumFractionDigits:2,maximumFractionDigits:2})
const rows=computed(()=>{
 const result=new Map<string,any>()
 for(const [period,items] of [['previous',props.compare?(props.data.previous_freight?.items||[]):[]],['current',props.data.freight?.items||[]]] as const){
  for(const row of items){const key=String(row.carrier_id)+'/'+row.currency;result.set(key,{...result.get(key),key,carrier:row.carrier,currency:row.currency,[period]:row})}
 }
 return [...result.values()].sort((a,b)=>String(a.carrier||'').localeCompare(String(b.carrier||''))||a.currency.localeCompare(b.currency))
})
</script>
<template><WCard class="outbound-freight" :title="t('outbound-freight.title')"><p class="help">{{t('outbound-freight.help')}}</p><div class="table-scroll"><table><thead><tr><th>{{t('nav.carrier')}}</th><th>{{t('outbound-freight.count')}}</th><th>{{t('outbound-freight.average')}}</th><th>{{t('outbound-freight.total')}}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.key"><td><b>{{row.carrier||t('outbound-freight.unknown-carrier')}}</b><small>{{row.currency}}</small></td><td>{{row.current?.count??0}}<small v-if="compare">{{t('outbound-freight.previous')}} {{row.previous?.count??0}}</small></td><td>{{money(row.current?.average)}}<small v-if="compare">{{t('outbound-freight.previous')}} {{money(row.previous?.average)}}</small></td><td>{{money(row.current?.total)}}<small v-if="compare">{{t('outbound-freight.previous')}} {{money(row.previous?.total)}}</small></td></tr><tr v-if="!rows.length"><td colspan="4" class="empty">{{t('outbound-freight.empty')}}</td></tr></tbody></table></div><p class="help">{{t('outbound-freight.missing',{count:data.freight?.missing??0})}}</p></WCard></template>
<style scoped>
.outbound-freight :deep(.w-card__header){padding:16px 24px 0}.outbound-freight :deep(.w-card__body){padding:12px 24px 20px;display:flex;flex-direction:column;gap:12px}.help{margin:0;font-size:12px;line-height:18px;color:var(--w-text-3)}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:360px;font-size:13px;line-height:20px}th{white-space:nowrap;font-size:12px;line-height:18px;color:var(--w-text-3);font-weight:500;padding:0 6px 8px;border-bottom:1px solid var(--w-border);text-align:right}td{text-align:right;padding:8px 6px;border-top:1px solid var(--w-line);vertical-align:top}th:first-child,td:first-child{padding-left:0;text-align:left}th:last-child,td:last-child{padding-right:0}b{font-weight:500}small{display:block;font-size:12px;line-height:18px;color:var(--w-text-3);white-space:nowrap}.empty{padding:24px 0;color:var(--w-text-3);text-align:center!important}
</style>
