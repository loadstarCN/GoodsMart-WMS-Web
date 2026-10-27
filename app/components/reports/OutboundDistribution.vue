<script setup lang="ts">
const props=defineProps<{data:any;compare:boolean}>()
const emit=defineEmits<{'select':[value:{dimension:string;value:string;label:string}]}>()
const {t,locale}=useI18n()
const table=ref(false)
const groups=['carrier','country','source']
const label=(dimension:string,row:any)=>{
  if(dimension==='country'&&/^[A-Z]{2}$/.test(row.value)){
    return new Intl.DisplayNames([locale.value],{type:'region'}).of(row.value)||row.label
  }
  return row.label||t('document-report.unknown-'+dimension)
}
const scale=(dimension:string)=>Math.max(1,...(props.data.distributions?.[dimension]||[]).flatMap((row:any)=>[row.count,props.compare?row.previous:0]))
const select=(dimension:string,row:any)=>emit('select',{dimension,value:row.value,label:label(dimension,row)})
const columns=computed(()=>[{key:'label',label:t('common.fields.name')},{key:'count',label:t('document-report.current'),type:'qty' as const,keepZero:true},...(props.compare?[{key:'previous',label:t('document-report.previous'),type:'qty' as const,keepZero:true}]:[])])
</script>
<template>
  <WCard class="outbound-distribution" :title="t('document-report.distribution')" :subtitle="String(data.summary.documents)+' '+t('document-report.documents')">
    <template #actions><div class="legend"><span class="current">{{t('document-report.current')}}</span><span v-if="compare" class="previous">{{t('document-report.previous')}}</span><WButton variant="text" size="sm" @click="table=!table">{{t('document-report.'+(table?'view-chart':'view-table'))}}</WButton></div></template>
    <p class="hint">{{t('document-report.distribution-help')}}</p>
    <div class="groups"><section v-for="dimension in groups" :key="dimension"><h3>{{t('document-report.by-'+dimension)}}</h3>
      <WEmptyState v-if="!data.distributions?.[dimension]?.length" compact :title="t('w.table.empty')"/>
      <WTable v-else-if="table" :rows="data.distributions[dimension]" :columns="columns" row-key="value"><template #cell-label="{row}"><button class="label-button" @click="select(dimension,row)">{{label(dimension,row)}}</button></template></WTable>
      <template v-else><button v-for="row in data.distributions[dimension]" :key="row.value" class="distribution-row" :title="label(dimension,row)+' · '+row.count+(compare?' / '+row.previous:'')" @click="select(dimension,row)"><span class="row-label">{{label(dimension,row)}}</span><span class="bar"><i :style="{width:row.count/scale(dimension)*100+'%'}"/><b v-if="compare&&row.previous" :style="{left:row.previous/scale(dimension)*100+'%'}"/></span><span class="value"><strong>{{row.count}}</strong> · {{data.summary.documents?(row.count/data.summary.documents*100).toFixed(0):'0'}}%</span></button></template>
    </section></div>
  </WCard>
</template>
<style scoped>
.outbound-distribution :deep(.w-card__header){padding:16px 24px 0;flex-wrap:wrap}.outbound-distribution :deep(.w-card__body){padding:12px 24px 20px}.legend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--w-text-2)}.legend>span{display:inline-flex;align-items:center;gap:6px}.legend>span:before{content:'';display:inline-block}.current:before{width:8px;height:8px;background:#7855FE;border-radius:2px}.previous:before{width:2px;height:12px;background:#151923}.hint{font-size:12px;line-height:18px;color:var(--w-text-3);margin:0 0 12px}.groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 32px}.groups section{min-width:0}h3{font-size:14px;line-height:22px;font-weight:600;margin:0 0 6px}.distribution-row{display:grid;width:100%;grid-template-columns:84px minmax(0,1fr) 76px;gap:12px;align-items:center;border:0;background:transparent;padding:4px 0;margin:0 0 2px;font:inherit;color:var(--w-text-1);text-align:left;cursor:pointer}.distribution-row:hover{background:var(--w-surface-2)}.distribution-row:focus-visible{outline:2px solid var(--w-pri);outline-offset:2px}.row-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px}.bar{position:relative;display:block;height:12px}.bar i{position:absolute;left:0;top:0;bottom:0;background:#7855FE;border-radius:0 4px 4px 0}.bar b{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:#151923;box-shadow:0 0 0 2px white}.value{font-size:12px;line-height:18px;color:var(--w-text-3);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.value strong{font-size:13px;font-weight:600;color:var(--w-text-1)}.label-button{font:inherit;color:var(--w-pri);background:transparent;border:0;padding:0;cursor:pointer}.outbound-distribution :deep(.w-table){min-width:0!important}@media(max-width:1100px){.groups{grid-template-columns:1fr}}
</style>
