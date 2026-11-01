<script setup lang="ts">
const props=defineProps<{data:any;compare:boolean}>(),{t}=useI18n()
const current=computed(()=>props.data.outbound_issues)
const rate=(value:number|null|undefined)=>value==null?'—':(value*100).toFixed(1)+'%'
</script>
<template>
 <WCard v-if="current" class="outbound-issues" :title="t('outbound-issues.title')">
  <p>{{t('outbound-issues.basis')}}</p>
  <div class="rates"><section v-for="key in ['exception','closed']" :key="key"><span>{{t('outbound-issues.'+key)}}</span><strong>{{rate(current[key+'_rate'])}}</strong><small>{{current[key]}} / {{current.documents}}<template v-if="compare"> · {{t('outbound-freight.previous')}} {{data.previous_outbound_issues?.[key]??0}} / {{data.previous_outbound_issues?.documents??0}}</template></small></section></div>
  <div class="issue-list"><NuxtLink v-for="row in current.items" :key="row.id" :to="'/dn/detail/'+row.id"><strong>DN-{{row.id}}<small>{{row.carrier||'—'}}</small></strong><WStatus :tone="row.stage==='exception'?'bad':'none'">{{t('shipping.stage.'+row.stage)}}</WStatus><time>{{row.planned}}</time></NuxtLink></div>
  <p v-if="!current.items.length">{{t('outbound-issues.empty')}}</p>
  <p v-else-if="current.exception+current.closed>current.items.length">{{t('outbound-issues.limit',{count:current.items.length,total:current.exception+current.closed})}}</p>
 </WCard>
</template>
<style scoped>
.outbound-issues :deep(.w-card__body){padding:12px 24px 20px}.outbound-issues :deep(.w-card__header){padding:16px 24px 0}p,small{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0}.rates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:16px 0}.rates span{font-size:13px;line-height:20px;color:var(--w-text-2)}.rates strong{display:block;font-size:24px;line-height:32px;margin:4px 0;font-weight:600}.rates small{display:block}.issue-list a{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;padding:12px 0;border-top:1px solid var(--w-line);color:var(--w-text-1);text-decoration:none;font-size:13px}.issue-list a:hover{color:var(--w-link)}.issue-list strong{flex:1;min-width:120px;overflow-wrap:anywhere;font-weight:500}.issue-list small{display:block}.issue-list time{color:var(--w-text-3);font-size:12px}
</style>
