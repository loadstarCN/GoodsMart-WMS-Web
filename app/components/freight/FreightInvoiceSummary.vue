<script setup lang="ts">
defineProps<{data:any}>()
const emit=defineEmits<{all:[]}>()
const {t}=useI18n()
</script>
<template>
 <section class="invoice-summary">
  <header><div><h2>{{t('freight-summary.title')}}</h2><p>{{t('freight-summary.scope')}}</p></div><WButton @click="emit('all')">{{t('freight-summary.all',{count:data.total})}}</WButton></header>
  <div class="counts"><span>{{t('freight.states.pending')}} <b>{{data.pending}}</b></span><span>{{t('freight.states.confirmed')}} <b>{{data.confirmed}}</b></span><span>{{t('freight.unresolved')}} <b>{{data.unresolved}}</b></span></div>
  <div v-for="(total,currency) in data.totals" :key="currency" class="amounts"><span>{{currency}} · {{t('freight.amount')}} <b>{{total.amount}}</b></span><span>{{t('freight-summary.unlinked',{count:total.unlinked_count})}} <b>{{currency}} {{total.unlinked_amount}}</b></span></div>
  <div v-if="data.items.length" class="cards"><WCard v-for="invoice in data.items" :key="invoice.id"><header><h3>{{invoice.carrier_name}}</h3><WStatus :tone="invoice.status==='confirmed'?'ok':'warn'">{{t('freight.states.'+invoice.status)}}</WStatus></header><p>{{invoice.invoice_number}}</p><p>{{invoice.period_from}} — {{invoice.period_to}}</p><strong>{{invoice.currency}} {{invoice.total}}</strong><footer><span>{{t('freight.unresolved')}} {{invoice.unresolved}}</span><NuxtLink :to="'/freight/invoices/'+invoice.id">{{t('freight-summary.review')}} →</NuxtLink></footer></WCard></div>
  <WEmptyState v-else :title="t('w.table.empty')"/>
 </section>
</template>
<style scoped>
.invoice-summary{display:flex;flex-direction:column;gap:12px}header{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap}h2{font-size:16px;line-height:24px;margin:0}h3{font-size:14px;line-height:22px;margin:0;overflow-wrap:anywhere}p{font-size:12px;line-height:18px;margin:4px 0;color:var(--w-text-3);overflow-wrap:anywhere}.counts,.amounts{display:flex;gap:12px 24px;flex-wrap:wrap;font-size:13px}.counts b{margin-left:4px}.amounts{color:var(--w-text-2)}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cards>.w-card{min-width:0}.cards strong{font-size:20px;display:block;margin:16px 0}footer{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--w-text-3)}a{color:var(--w-pri)}@media(max-width:900px){.cards{grid-template-columns:minmax(0,1fr)}}
</style>
